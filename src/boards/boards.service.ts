import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Board } from "./entities/board.entity";
import { BoardColumn } from "../columns/entities/column.entity";
import { CreateBoardDto } from "./dto/create-board.dto";
import { UpdateBoardDto } from "./dto/update-board.dto";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const DEFAULT_COLUMN_TITLES = ["To Do", "In Progress", "Done"];

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(Board)
    private readonly boardsRepository: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columnsRepository: Repository<BoardColumn>,
    private readonly realtimeGateway: RealtimeGateway,
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

  findAll(userId: string): Promise<Board[]> {
    return this.boardsRepository.find({
      where: { ownerId: userId },
      order: { createdAt: "DESC" },
    });
  }

  async findOne(userId: string, boardId: string): Promise<Board> {
    const board = await this.boardsRepository
      .createQueryBuilder("board")
      .leftJoinAndSelect("board.columns", "column")
      .leftJoinAndSelect("column.tasks", "task")
      .where("board.id = :boardId", { boardId })
      .andWhere("board.ownerId = :userId", { userId })
      .orderBy("column.order", "ASC")
      .addOrderBy("task.order", "ASC")
      .getOne();
    if (!board) {
      throw new NotFoundException("Board not found");
    }
    return board;
  }

  /**
   * Lightweight ownership check used by columns/tasks modules before
   * they operate on children of a board.
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
}
