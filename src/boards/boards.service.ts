import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Board } from "./entities/board.entity";
import { BoardMember } from "./entities/board-member.entity";
import { BoardColumn } from "../columns/entities/column.entity";
import { CreateBoardDto } from "./dto/create-board.dto";
import { UpdateBoardDto } from "./dto/update-board.dto";
import { AddMemberDto } from "./dto/add-member.dto";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { UsersService } from "../users/users.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/entities/notification.entity";

const DEFAULT_COLUMN_TITLES = ["To Do", "In Progress", "Done"];

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(Board)
    private readonly boardsRepository: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columnsRepository: Repository<BoardColumn>,
    @InjectRepository(BoardMember)
    private readonly boardMembersRepository: Repository<BoardMember>,
    private readonly usersService: UsersService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateBoardDto): Promise<Board> {
    const board = this.boardsRepository.create({
      title: dto.title,
      description: dto.description,
      ownerId: userId,
    });
    const savedBoard = await this.boardsRepository.save(board);

    const defaultColumns = DEFAULT_COLUMN_TITLES.map((title, index) =>
      this.columnsRepository.create({
        title,
        order: index,
        boardId: savedBoard.id,
      }),
    );
    await this.columnsRepository.save(defaultColumns);

    const fullBoard = await this.findOne(userId, savedBoard.id);
    this.realtimeGateway.emitToUser(userId, "board:created", fullBoard);
    return fullBoard;
  }

  async findAll(userId: string): Promise<Board[]> {
    // Two-pass: first resolve which board ids the user can see, then load
    // full member lists for those boards. Filtering by member.userId in the
    // same query that leftJoinAndSelect's board.members would collapse each
    // board's member rows down to only the requesting user's own row.
    const accessible = await this.boardsRepository
      .createQueryBuilder("board")
      .leftJoin("board.members", "member")
      .where("board.ownerId = :userId", { userId })
      .orWhere("member.userId = :userId", { userId })
      .select("board.id", "id")
      .getRawMany<{ id: string }>();

    if (accessible.length === 0) {
      return [];
    }

    return this.boardsRepository
      .createQueryBuilder("board")
      .leftJoinAndSelect("board.owner", "owner")
      .leftJoinAndSelect("board.members", "member")
      .leftJoinAndSelect("member.user", "memberUser")
      .where("board.id IN (:...ids)", { ids: accessible.map((row) => row.id) })
      .orderBy("board.createdAt", "DESC")
      .getMany();
  }

  async findOne(userId: string, boardId: string): Promise<Board> {
    await this.getAccessibleBoardOrFail(userId, boardId);

    const board = await this.boardsRepository
      .createQueryBuilder("board")
      .leftJoinAndSelect("board.owner", "owner")
      .leftJoinAndSelect("board.columns", "column")
      .leftJoinAndSelect("column.tasks", "task")
      .leftJoinAndSelect("board.members", "member")
      .leftJoinAndSelect("member.user", "memberUser")
      .where("board.id = :boardId", { boardId })
      .orderBy("column.order", "ASC")
      .addOrderBy("task.order", "ASC")
      .getOne();
    if (!board) {
      throw new NotFoundException("Board not found");
    }
    return board;
  }

  async isBoardMember(userId: string, boardId: string): Promise<boolean> {
    const count = await this.boardMembersRepository.count({
      where: { boardId, userId },
    });
    return count > 0;
  }

  /**
   * Strict ownership check for actions reserved for the board owner
   * (board settings, member management).
   */
  async getOwnedBoardOrFail(userId: string, boardId: string): Promise<Board> {
    const board = await this.boardsRepository.findOne({
      where: { id: boardId, ownerId: userId },
    });
    if (!board) {
      throw new NotFoundException("Board not found");
    }
    return board;
  }

  /**
   * Collaborator check (owner or member) used by columns/tasks modules
   * before they operate on children of a board.
   */
  async getAccessibleBoardOrFail(
    userId: string,
    boardId: string,
  ): Promise<Board> {
    const board = await this.boardsRepository.findOne({
      where: { id: boardId },
    });
    if (!board) {
      throw new NotFoundException("Board not found");
    }
    if (
      board.ownerId !== userId &&
      !(await this.isBoardMember(userId, boardId))
    ) {
      throw new NotFoundException("Board not found");
    }
    return board;
  }

  async update(
    userId: string,
    boardId: string,
    dto: UpdateBoardDto,
  ): Promise<Board> {
    const board = await this.getOwnedBoardOrFail(userId, boardId);
    Object.assign(board, dto);
    await this.boardsRepository.save(board);
    const fullBoard = await this.findOne(userId, boardId);
    this.realtimeGateway.emitToUser(userId, "board:updated", fullBoard);
    this.realtimeGateway.emitToBoard(boardId, "board:updated", fullBoard);
    return fullBoard;
  }

  async remove(userId: string, boardId: string): Promise<void> {
    const board = await this.getOwnedBoardOrFail(userId, boardId);
    await this.boardsRepository.remove(board);
    this.realtimeGateway.emitToUser(userId, "board:deleted", { boardId });
    this.realtimeGateway.emitToBoard(boardId, "board:deleted", { boardId });
  }

  async addMember(
    ownerId: string,
    boardId: string,
    dto: AddMemberDto,
  ): Promise<Board> {
    const board = await this.getOwnedBoardOrFail(ownerId, boardId);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException("No user found with that email");
    }
    if (user.id === board.ownerId) {
      throw new BadRequestException("The board owner is already a member");
    }
    if (await this.isBoardMember(user.id, boardId)) {
      throw new ConflictException("User is already a member of this board");
    }

    const member = this.boardMembersRepository.create({
      boardId,
      userId: user.id,
    });
    await this.boardMembersRepository.save(member);

    const fullBoard = await this.findOne(ownerId, boardId);
    this.realtimeGateway.emitToBoard(boardId, "board:member-added", fullBoard);
    this.realtimeGateway.emitToUser(user.id, "board:added", fullBoard);
    await this.notificationsService.create(
      user.id,
      NotificationType.BOARD_ADDED,
      `You were added to the board "${fullBoard.title}"`,
      { boardId },
    );
    return fullBoard;
  }

  async removeMember(
    ownerId: string,
    boardId: string,
    memberUserId: string,
  ): Promise<Board> {
    await this.getOwnedBoardOrFail(ownerId, boardId);

    const member = await this.boardMembersRepository.findOne({
      where: { boardId, userId: memberUserId },
    });
    if (!member) {
      throw new NotFoundException("Member not found");
    }
    await this.boardMembersRepository.remove(member);

    const fullBoard = await this.findOne(ownerId, boardId);
    this.realtimeGateway.emitToBoard(boardId, "board:member-removed", {
      boardId,
      userId: memberUserId,
    });
    this.realtimeGateway.emitToUser(memberUserId, "board:removed", {
      boardId,
    });
    return fullBoard;
  }
}
