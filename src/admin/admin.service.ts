import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserRole } from "../users/entities/user.entity";
import { Board } from "../boards/entities/board.entity";
import { Task } from "../tasks/entities/task.entity";

export interface AdminStats {
  totalUsers: number;
  totalAdmins: number;
  totalBoards: number;
  totalTasks: number;
}

export interface AdminBoardSummary {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
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
    const [totalUsers, totalAdmins, totalBoards, totalTasks] =
      await Promise.all([
        this.usersRepository.count(),
        this.usersRepository.count({ where: { role: UserRole.ADMIN } }),
        this.boardsRepository.count(),
        this.tasksRepository.count(),
      ]);
    return { totalUsers, totalAdmins, totalBoards, totalTasks };
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
      relations: ["owner"],
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

    return boards.map((board) => ({
      id: board.id,
      title: board.title,
      description: board.description ?? null,
      ownerId: board.ownerId,
      ownerName: board.owner?.name ?? "",
      ownerEmail: board.owner?.email ?? "",
      taskCount: countByBoard.get(board.id) ?? 0,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    }));
  }

  async removeBoard(boardId: string): Promise<void> {
    const board = await this.boardsRepository.findOneBy({ id: boardId });
    if (!board) {
      throw new NotFoundException("Board not found");
    }
    await this.boardsRepository.remove(board);
  }
}
