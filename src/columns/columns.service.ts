import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BoardColumn } from "./entities/column.entity";
import { BoardsService } from "../boards/boards.service";
import { CreateColumnDto } from "./dto/create-column.dto";
import { UpdateColumnDto } from "./dto/update-column.dto";
import { ReorderColumnsDto } from "./dto/reorder-columns.dto";
import { RealtimeGateway } from "../realtime/realtime.gateway";

@Injectable()
export class ColumnsService {
  constructor(
    @InjectRepository(BoardColumn)
    private readonly columnsRepository: Repository<BoardColumn>,
    private readonly boardsService: BoardsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(
    userId: string,
    boardId: string,
    dto: CreateColumnDto,
  ): Promise<BoardColumn> {
    await this.boardsService.getOwnedBoardOrFail(userId, boardId);

    const columnCount = await this.columnsRepository.count({
      where: { boardId },
    });

    const column = this.columnsRepository.create({
      title: dto.title,
      boardId,
      order: columnCount,
    });
    const savedColumn = await this.columnsRepository.save(column);
    this.realtimeGateway.emitToBoard(boardId, "column:created", savedColumn);
    return savedColumn;
  }

  async findAllForBoard(
    userId: string,
    boardId: string,
  ): Promise<BoardColumn[]> {
    await this.boardsService.getOwnedBoardOrFail(userId, boardId);
    return this.columnsRepository.find({
      where: { boardId },
      order: { order: "ASC" },
      relations: ["tasks"],
    });
  }

  /**
   * Loads a column and verifies (via its board) that it belongs to the user.
   * Used by TasksService before mutating tasks within a column.
   */
  async getOwnedColumnOrFail(
    userId: string,
    columnId: string,
  ): Promise<BoardColumn> {
    const column = await this.columnsRepository.findOne({
      where: { id: columnId },
      relations: ["board"],
    });
    if (!column || column.board.ownerId !== userId) {
      throw new NotFoundException("Column not found");
    }
    return column;
  }

  async update(
    userId: string,
    boardId: string,
    columnId: string,
    dto: UpdateColumnDto,
  ): Promise<BoardColumn> {
    await this.boardsService.getOwnedBoardOrFail(userId, boardId);
    const column = await this.columnsRepository.findOne({
      where: { id: columnId, boardId },
    });
    if (!column) {
      throw new NotFoundException("Column not found");
    }
    Object.assign(column, dto);
    const savedColumn = await this.columnsRepository.save(column);
    this.realtimeGateway.emitToBoard(boardId, "column:updated", savedColumn);
    return savedColumn;
  }

  async remove(
    userId: string,
    boardId: string,
    columnId: string,
  ): Promise<void> {
    await this.boardsService.getOwnedBoardOrFail(userId, boardId);
    const column = await this.columnsRepository.findOne({
      where: { id: columnId, boardId },
    });
    if (!column) {
      throw new NotFoundException("Column not found");
    }
    await this.columnsRepository.remove(column);
    this.realtimeGateway.emitToBoard(boardId, "column:deleted", { columnId });
  }

  async reorder(
    userId: string,
    boardId: string,
    dto: ReorderColumnsDto,
  ): Promise<BoardColumn[]> {
    await this.boardsService.getOwnedBoardOrFail(userId, boardId);

    const columns = await this.columnsRepository.find({ where: { boardId } });
    if (columns.length !== dto.orderedColumnIds.length) {
      throw new BadRequestException(
        "orderedColumnIds must include exactly the columns belonging to this board",
      );
    }

    const columnsById = new Map(columns.map((column) => [column.id, column]));
    const updated = dto.orderedColumnIds.map((id, index) => {
      const column = columnsById.get(id);
      if (!column) {
        throw new BadRequestException(
          `Column ${id} does not belong to this board`,
        );
      }
      column.order = index;
      return column;
    });

    const savedColumns = await this.columnsRepository.save(updated);
    this.realtimeGateway.emitToBoard(
      boardId,
      "columns:reordered",
      savedColumns,
    );
    return savedColumns;
  }
}
