import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Task } from "./entities/task.entity";
import { ColumnsService } from "../columns/columns.service";
import { BoardsService } from "../boards/boards.service";
import { UsersService } from "../users/users.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { MoveTaskDto } from "./dto/move-task.dto";
import { QueryTasksDto, TaskSortBy } from "./dto/query-tasks.dto";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/entities/notification.entity";

const TASK_DETAIL_RELATIONS = [
  "column",
  "column.board",
  "assignedUser",
  "createdBy",
];

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    private readonly columnsService: ColumnsService,
    private readonly boardsService: BoardsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    userId: string,
    columnId: string,
    dto: CreateTaskDto,
  ): Promise<Task> {
    const column = await this.columnsService.getAccessibleColumnOrFail(
      userId,
      columnId,
    );

    if (dto.assignedUserId) {
      await this.usersService.findById(dto.assignedUserId);
    }

    const taskCount = await this.tasksRepository.count({
      where: { columnId },
    });

    const task = this.tasksRepository.create({
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedUserId: dto.assignedUserId,
      createdById: userId,
      columnId,
      boardId: column.boardId,
      order: taskCount,
    });
    const savedTask = await this.tasksRepository.save(task);
    this.realtimeGateway.emitToBoard(column.boardId, "task:created", savedTask);
    await this.notifyAssignment(userId, savedTask);
    return savedTask;
  }

  async getAccessibleTaskOrFail(userId: string, taskId: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: ["column", "column.board"],
    });
    if (!task || !(await this.canAccessBoard(userId, task.column.board))) {
      throw new NotFoundException("Task not found");
    }
    return task;
  }

  async findOne(userId: string, taskId: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: TASK_DETAIL_RELATIONS,
    });
    if (!task || !(await this.canAccessBoard(userId, task.column.board))) {
      throw new NotFoundException("Task not found");
    }
    return task;
  }

  private async canAccessBoard(
    userId: string,
    board: { id: string; ownerId: string },
  ): Promise<boolean> {
    if (board.ownerId === userId) {
      return true;
    }
    return this.boardsService.isBoardMember(userId, board.id);
  }

  async findAll(
    userId: string,
    boardId: string,
    query: QueryTasksDto,
  ): Promise<Task[]> {
    await this.boardsService.getAccessibleBoardOrFail(userId, boardId);

    const qb = this.tasksRepository
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.assignedUser", "assignedUser")
      .where("task.boardId = :boardId", { boardId });

    if (query.search) {
      qb.andWhere("task.title ILIKE :search", { search: `%${query.search}%` });
    }
    if (query.priority) {
      qb.andWhere("task.priority = :priority", { priority: query.priority });
    }
    if (query.status) {
      qb.andWhere("task.status = :status", { status: query.status });
    }
    if (query.assignedUserId) {
      qb.andWhere("task.assignedUserId = :assignedUserId", {
        assignedUserId: query.assignedUserId,
      });
    }

    switch (query.sortBy) {
      case TaskSortBy.OLDEST:
        qb.orderBy("task.createdAt", "ASC");
        break;
      case TaskSortBy.PRIORITY:
        qb.orderBy(
          `CASE task.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
          "ASC",
        );
        break;
      case TaskSortBy.DEADLINE:
        qb.orderBy("task.dueDate", "ASC", "NULLS LAST");
        break;
      case TaskSortBy.NEWEST:
      default:
        qb.orderBy("task.createdAt", "DESC");
        break;
    }

    return qb.getMany();
  }

  async update(
    userId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<Task> {
    const task = await this.getAccessibleTaskOrFail(userId, taskId);
    if (dto.assignedUserId) {
      await this.usersService.findById(dto.assignedUserId);
    }
    const previousAssignedUserId = task.assignedUserId;
    Object.assign(task, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : task.dueDate,
    });
    const savedTask = await this.tasksRepository.save(task);
    this.realtimeGateway.emitToBoard(task.boardId, "task:updated", savedTask);
    if (savedTask.assignedUserId !== previousAssignedUserId) {
      await this.notifyAssignment(userId, savedTask);
    }
    return savedTask;
  }

  /** Notifies the assignee, unless they assigned the task to themselves. */
  private async notifyAssignment(actorUserId: string, task: Task): Promise<void> {
    if (!task.assignedUserId || task.assignedUserId === actorUserId) {
      return;
    }
    await this.notificationsService.create(
      task.assignedUserId,
      NotificationType.TASK_ASSIGNED,
      `You were assigned to "${task.title}"`,
      { boardId: task.boardId, taskId: task.id },
    );
  }

  async remove(userId: string, taskId: string): Promise<void> {
    const task = await this.getAccessibleTaskOrFail(userId, taskId);
    await this.tasksRepository.remove(task);
    this.realtimeGateway.emitToBoard(task.boardId, "task:deleted", {
      taskId,
      columnId: task.columnId,
    });
  }

  /**
   * Handles dragging a task to a new position, possibly in a different
   * column. Re-sequences the `order` column for every affected task so
   * that ordering stays gap-free and consistent for both columns involved.
   */
  async move(userId: string, taskId: string, dto: MoveTaskDto): Promise<Task> {
    const task = await this.getAccessibleTaskOrFail(userId, taskId);
    const targetColumn = await this.columnsService.getAccessibleColumnOrFail(
      userId,
      dto.targetColumnId,
    );

    if (targetColumn.boardId !== task.boardId) {
      throw new NotFoundException(
        "Cannot move a task to a column on a different board",
      );
    }

    const sourceColumnId = task.columnId;
    const boardId = task.boardId;

    const movedTask = await this.dataSource.transaction(async (manager) => {
      const taskRepo = manager.getRepository(Task);

      const targetTasks = await taskRepo.find({
        where: { columnId: dto.targetColumnId },
        order: { order: "ASC" },
      });
      const remainingTargetTasks = targetTasks.filter((t) => t.id !== taskId);

      const clampedIndex = Math.max(
        0,
        Math.min(dto.targetIndex, remainingTargetTasks.length),
      );
      remainingTargetTasks.splice(clampedIndex, 0, task);

      // Use targeted column updates rather than entity.save() here: `task`
      // still carries the stale `column` relation loaded in
      // getAccessibleTaskOrFail, and TypeORM's save() would resolve the FK from
      // that relation object, silently overwriting the new columnId.
      await Promise.all(
        remainingTargetTasks.map((t, index) =>
          taskRepo.update(t.id, {
            order: index,
            columnId: dto.targetColumnId,
          }),
        ),
      );

      if (sourceColumnId !== dto.targetColumnId) {
        const sourceTasks = await taskRepo.find({
          where: { columnId: sourceColumnId },
          order: { order: "ASC" },
        });
        await Promise.all(
          sourceTasks.map((t, index) =>
            taskRepo.update(t.id, { order: index }),
          ),
        );
      }

      return taskRepo.findOneOrFail({ where: { id: taskId } });
    });

    this.realtimeGateway.emitToBoard(boardId, "task:moved", movedTask);
    // Reordering can shift many rows across two columns at once; broadcast a
    // full, authoritative snapshot so every connected client (including the
    // one that triggered the move) stays perfectly in sync.
    const boardSnapshot = await this.boardsService.findOne(userId, boardId);
    this.realtimeGateway.emitToBoard(boardId, "board:sync", boardSnapshot);

    return movedTask;
  }
}
