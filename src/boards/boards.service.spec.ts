import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { BoardsService } from "./boards.service";
import { Board } from "./entities/board.entity";
import { BoardMember } from "./entities/board-member.entity";
import { BoardColumn } from "../columns/entities/column.entity";
import { UsersService } from "../users/users.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";
import { User } from "../users/entities/user.entity";

function createQueryBuilderMock(result: unknown) {
  const qb: Record<string, jest.Mock> = {};
  const chainMethods = [
    "leftJoin",
    "leftJoinAndSelect",
    "where",
    "orWhere",
    "select",
    "orderBy",
    "addOrderBy",
  ];
  for (const method of chainMethods) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getOne = jest.fn().mockResolvedValue(result);
  qb.getMany = jest.fn().mockResolvedValue(result);
  qb.getRawMany = jest.fn().mockResolvedValue(result);
  return qb;
}

describe("BoardsService", () => {
  let service: BoardsService;
  let boardsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let columnsRepository: { create: jest.Mock; save: jest.Mock };
  let boardMembersRepository: {
    count: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let usersService: { findByEmail: jest.Mock };
  let realtimeGateway: { emitToUser: jest.Mock; emitToBoard: jest.Mock };
  let notificationsService: { create: jest.Mock };

  const owner: Partial<User> = { id: "owner-1", email: "owner@example.com" };
  const member: Partial<User> = { id: "member-1", email: "member@example.com" };
  const stranger: Partial<User> = { id: "stranger-1" };

  const board = (overrides: Partial<Board> = {}): Board =>
    ({
      id: "board-1",
      title: "Sprint board",
      ownerId: owner.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Board;

  beforeEach(() => {
    boardsRepository = {
      create: jest.fn((data) => data as Board),
      save: jest.fn(async (entity) => entity as Board),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    columnsRepository = {
      create: jest.fn((data) => data as BoardColumn),
      save: jest.fn(async (entities) => entities as BoardColumn[]),
    };
    boardMembersRepository = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => data as BoardMember),
      save: jest.fn(async (entity) => entity as BoardMember),
      remove: jest.fn(),
    };
    usersService = { findByEmail: jest.fn() };
    realtimeGateway = { emitToUser: jest.fn(), emitToBoard: jest.fn() };
    notificationsService = { create: jest.fn() };

    service = new BoardsService(
      boardsRepository as unknown as Repository<Board>,
      columnsRepository as unknown as Repository<BoardColumn>,
      boardMembersRepository as unknown as Repository<BoardMember>,
      usersService as unknown as UsersService,
      realtimeGateway as unknown as RealtimeGateway,
      notificationsService as unknown as NotificationsService,
    );
  });

  describe("create", () => {
    it("owns the board on behalf of the creating user and seeds three default columns", async () => {
      boardsRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock(board()) as never,
      );

      await service.create(owner.id!, { title: "Sprint board" });

      expect(boardsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: owner.id, title: "Sprint board" }),
      );
      const seededColumns = (columnsRepository.save as jest.Mock).mock
        .calls[0][0] as BoardColumn[];
      expect(seededColumns.map((c) => c.title)).toEqual([
        "To Do",
        "In Progress",
        "Done",
      ]);
      expect(seededColumns.map((c) => c.order)).toEqual([0, 1, 2]);
      expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
        owner.id,
        "board:created",
        expect.anything(),
      );
    });
  });

  describe("getAccessibleBoardOrFail", () => {
    it("allows the owner", async () => {
      boardsRepository.findOne.mockResolvedValue(board());

      await expect(
        service.getAccessibleBoardOrFail(owner.id!, "board-1"),
      ).resolves.toBeDefined();
    });

    it("allows a board member", async () => {
      boardsRepository.findOne.mockResolvedValue(board());
      boardMembersRepository.count.mockResolvedValue(1);

      await expect(
        service.getAccessibleBoardOrFail(member.id!, "board-1"),
      ).resolves.toBeDefined();
    });

    it("rejects a user with no relationship to the board", async () => {
      boardsRepository.findOne.mockResolvedValue(board());
      boardMembersRepository.count.mockResolvedValue(0);

      await expect(
        service.getAccessibleBoardOrFail(stranger.id!, "board-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects when the board does not exist", async () => {
      boardsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getAccessibleBoardOrFail(owner.id!, "missing"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getOwnedBoardOrFail", () => {
    it("allows the owner", async () => {
      boardsRepository.findOne.mockResolvedValue(board());

      await expect(
        service.getOwnedBoardOrFail(owner.id!, "board-1"),
      ).resolves.toBeDefined();
    });

    it("rejects a board member who is not the owner", async () => {
      boardsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getOwnedBoardOrFail(member.id!, "board-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("addMember", () => {
    it("rejects when the target is already the board owner", async () => {
      boardsRepository.findOne.mockResolvedValue(board());
      usersService.findByEmail.mockResolvedValue(owner as User);

      await expect(
        service.addMember(owner.id!, "board-1", { email: owner.email! }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when the target is already a member", async () => {
      boardsRepository.findOne.mockResolvedValue(board());
      usersService.findByEmail.mockResolvedValue(member as User);
      boardMembersRepository.count.mockResolvedValue(1);

      await expect(
        service.addMember(owner.id!, "board-1", { email: member.email! }),
      ).rejects.toThrow(ConflictException);
    });

    it("adds a new member and notifies them", async () => {
      boardsRepository.findOne.mockResolvedValue(board());
      boardsRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock(board()) as never,
      );
      usersService.findByEmail.mockResolvedValue(member as User);
      boardMembersRepository.count.mockResolvedValue(0);

      await service.addMember(owner.id!, "board-1", { email: member.email! });

      expect(boardMembersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: "board-1", userId: member.id }),
      );
      expect(notificationsService.create).toHaveBeenCalled();
    });
  });
});
