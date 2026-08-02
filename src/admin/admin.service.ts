import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserRole } from "../users/entities/user.entity";
import { Board } from "../boards/entities/board.entity";
import { Task, TaskStatus } from "../tasks/entities/task.entity";

export interface AdminStats {
  totalUsers: number;
  totalAdmins: number;
  totalBoards: number;
  totalTasks: number;
  totalCompletedTasks: number;
  overallProgressPercent: number;
}

export interface AdminBoardSummary {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  progressPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminMemberProgress {
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
  assignedCount: number;
  completedCount: number;
  progressPercent: number;
}

export interface AdminBoardDetail {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: Date;
  updatedAt: Date;
  columnCount: number;
  taskCount: number;
  completedTaskCount: number;
  progressPercent: number;
  memberProgress: AdminMemberProgress[];
}

function percent(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Board)
    private readonly boardsRepository: Repository<Board>,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const [
      totalUsers,
      totalAdmins,
      totalBoards,
      totalTasks,
      totalCompletedTasks,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.count({ where: { role: UserRole.ADMIN } }),
      this.boardsRepository.count(),
      this.tasksRepository.count(),
      this.tasksRepository.count({ where: { status: TaskStatus.DONE } }),
    ]);
    return {
      totalUsers,
      totalAdmins,
      totalBoards,
      totalTasks,
      totalCompletedTasks,
      overallProgressPercent: percent(totalCompletedTasks, totalTasks),
    };
  }

  findAllUsers(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: "DESC" } });
  }

  async updateUserRole(
    targetUserId: string,
    role: UserRole,
    requestingUserId: string,
  ): Promise<User> {
    if (targetUserId === requestingUserId) {
      throw new BadRequestException("You cannot change your own role");
    }
    const user = await this.usersRepository.findOneBy({ id: targetUserId });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    user.role = role;
    return this.usersRepository.save(user);
  }

  async removeUser(
    targetUserId: string,
    requestingUserId: string,
  ): Promise<void> {
    if (targetUserId === requestingUserId) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const user = await this.usersRepository.findOneBy({ id: targetUserId });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    await this.usersRepository.remove(user);
  }

  async findAllBoards(): Promise<AdminBoardSummary[]> {
    const boards = await this.boardsRepository.find({
      relations: ["owner", "members"],
      order: { createdAt: "DESC" },
    });

    const taskCounts = await this.tasksRepository
      .createQueryBuilder("task")
      .select("task.boardId", "boardId")
      .addSelect("COUNT(*)", "count")
      .groupBy("task.boardId")
      .getRawMany<{ boardId: string; count: string }>();
    const countByBoard = new Map(
      taskCounts.map((row) => [row.boardId, Number(row.count)]),
    );

    const completedCounts = await this.tasksRepository
      .createQueryBuilder("task")
      .select("task.boardId", "boardId")
      .addSelect("COUNT(*)", "count")
      .where("task.status = :status", { status: TaskStatus.DONE })
      .groupBy("task.boardId")
      .getRawMany<{ boardId: string; count: string }>();
    const completedByBoard = new Map(
      completedCounts.map((row) => [row.boardId, Number(row.count)]),
    );

    return boards.map((board) => {
      const taskCount = countByBoard.get(board.id) ?? 0;
      const completedTaskCount = completedByBoard.get(board.id) ?? 0;
      return {
        id: board.id,
        title: board.title,
        description: board.description ?? null,
        ownerId: board.ownerId,
        ownerName: board.owner?.name ?? "",
        ownerEmail: board.owner?.email ?? "",
        memberCount: (board.members?.length ?? 0) + 1,
        taskCount,
        completedTaskCount,
        progressPercent: percent(completedTaskCount, taskCount),
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
      };
    });
  }

  async getBoardDetail(boardId: string): Promise<AdminBoardDetail> {
    const board = await this.boardsRepository.findOne({
      where: { id: boardId },
      relations: [
        "owner",
        "members",
        "members.user",
        "columns",
        "columns.tasks",
        "columns.tasks.assignees",
      ],
    });
    if (!board) {
      throw new NotFoundException("Board not found");
    }

    const tasks = board.columns?.flatMap((column) => column.tasks ?? []) ?? [];
    const taskCount = tasks.length;
    const completedTaskCount = tasks.filter(
      (task) => task.status === TaskStatus.DONE,
    ).length;

    const participants = [
      {
        userId: board.owner.id,
        name: board.owner.name,
        email: board.owner.email,
        isOwner: true,
      },
      ...(board.members ?? []).map((member) => ({
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        isOwner: false,
      })),
    ];

    const memberProgress: AdminMemberProgress[] = participants.map(
      (participant) => {
        const assigned = tasks.filter((task) =>
          task.assignees?.some(
            (assignee) => assignee.userId === participant.userId,
          ),
        );
        const completed = assigned.filter(
          (task) => task.status === TaskStatus.DONE,
        );
        return {
          userId: participant.userId,
          name: participant.name,
          email: participant.email,
          isOwner: participant.isOwner,
          assignedCount: assigned.length,
          completedCount: completed.length,
          progressPercent: percent(completed.length, assigned.length),
        };
      },
    );

    return {
      id: board.id,
      title: board.title,
      description: board.description ?? null,
      ownerId: board.ownerId,
      ownerName: board.owner.name,
      ownerEmail: board.owner.email,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      columnCount: board.columns?.length ?? 0,
      taskCount,
      completedTaskCount,
      progressPercent: percent(completedTaskCount, taskCount),
      memberProgress,
    };
  }

  async removeBoard(boardId: string): Promise<void> {
    const board = await this.boardsRepository.findOneBy({ id: boardId });
    if (!board) {
      throw new NotFoundException("Board not found");
    }
    await this.boardsRepository.remove(board);
  }
}
