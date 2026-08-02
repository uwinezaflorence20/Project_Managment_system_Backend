import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Task } from "./entities/task.entity";
import { TaskAssignee } from "./entities/task-assignee.entity";
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
  "assignees",
  "assignees.user",
  "createdBy",
];

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(TaskAssignee)
    private readonly taskAssigneesRepository: Repository<TaskAssignee>,
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

    const assigneeIds = await this.validateAssignees(
      dto.assigneeIds,
      column.board,
    );

    const taskCount = await this.tasksRepository.count({
      where: { columnId },
    });

    const task = this.tasksRepository.create({
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      createdById: userId,
      columnId,
      boardId: column.boardId,
      order: taskCount,
    });
    const savedTask = await this.tasksRepository.save(task);

    if (assigneeIds.length > 0) {
      await this.taskAssigneesRepository.save(
        assigneeIds.map((assigneeId) =>
          this.taskAssigneesRepository.create({
            taskId: savedTask.id,
            userId: assigneeId,
          }),
        ),
      );
    }

    const fullTask = await this.findOne(userId, savedTask.id);
    this.realtimeGateway.emitToBoard(column.boardId, "task:created", fullTask);
    await this.notifyAssignment(userId, fullTask, assigneeIds);
    return fullTask;
  }

  /**
   * Ensures every assignee id refers to a real user who is a collaborator
   * (owner or member) on the task's project — co-assignment is only allowed
   * among people already assigned to that project.
   */
  private async validateAssignees(
    assigneeIds: string[] | undefined,
    board: { id: string; ownerId: string },
  ): Promise<string[]> {
    if (!assigneeIds || assigneeIds.length === 0) {
      return [];
    }
    const uniqueIds = Array.from(new Set(assigneeIds));
    for (const assigneeId of uniqueIds) {
      await this.usersService.findById(assigneeId);
      if (!(await this.canAccessBoard(assigneeId, board))) {
        throw new BadRequestException(
          "Assignees must be members of this project",
        );
      }
    }
    return uniqueIds;
  }

  async getAccessibleTaskOrFail(userId: string, taskId: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: ["column", "column.board", "assignees"],
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
      .leftJoinAndSelect("task.assignees", "assignees")
      .leftJoinAndSelect("assignees.user", "assigneeUser")
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
    if (query.assigneeId) {
      // A subquery (rather than filtering the joined rows directly) keeps
      // each matching task's full assignee list intact in the result.
      qb.andWhere(
        `task.id IN (SELECT "taskId" FROM task_assignees WHERE "userId" = :assigneeId)`,
        { assigneeId: query.assigneeId },
      );
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
    const previousAssigneeIds = new Set(
      task.assignees.map((assignee) => assignee.userId),
    );

    let newAssigneeIds: string[] | undefined;
    if (dto.assigneeIds !== undefined) {
      newAssigneeIds = await this.validateAssignees(
        dto.assigneeIds,
        task.column.board,
      );
    }

    const { assigneeIds: _assigneeIds, ...rest } = dto;
    Object.assign(task, {
      ...rest,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : task.dueDate,
    });
    await this.tasksRepository.save(task);

    let newlyAssignedIds: string[] = [];
    if (newAssigneeIds !== undefined) {
      await this.taskAssigneesRepository.delete({ taskId });
      if (newAssigneeIds.length > 0) {
        await this.taskAssigneesRepository.save(
          newAssigneeIds.map((assigneeId) =>
            this.taskAssigneesRepository.create({ taskId, userId: assigneeId }),
          ),
        );
      }
      newlyAssignedIds = newAssigneeIds.filter(
        (id) => !previousAssigneeIds.has(id),
      );
    }

    const fullTask = await this.findOne(userId, taskId);
    this.realtimeGateway.emitToBoard(task.boardId, "task:updated", fullTask);
    if (newlyAssignedIds.length > 0) {
      await this.notifyAssignment(userId, fullTask, newlyAssignedIds);
    }
    return fullTask;
  }

  /** Notifies newly-added assignees, skipping anyone who assigned themselves. */
  private async notifyAssignment(
    actorUserId: string,
    task: Task,
    newlyAssignedIds: string[],
  ): Promise<void> {
    const recipients = newlyAssignedIds.filter((id) => id !== actorUserId);
    await Promise.all(
      recipients.map((assigneeId) =>
        this.notificationsService.create(
          assigneeId,
          NotificationType.TASK_ASSIGNED,
          `You were assigned to "${task.title}"`,
          { boardId: task.boardId, taskId: task.id },
        ),
      ),
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
