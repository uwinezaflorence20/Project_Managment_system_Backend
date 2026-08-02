import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { TasksService } from "./tasks.service";
import { Task } from "./entities/task.entity";
import { TaskAssignee } from "./entities/task-assignee.entity";
import { ColumnsService } from "../columns/columns.service";
import { BoardsService } from "../boards/boards.service";
import { UsersService } from "../users/users.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";

type TaskRecord = {
  id: string;
  columnId: string;
  boardId: string;
  order: number;
};

/** Mimics TypeORM's `manager.getRepository(Task)` against an in-memory array,
 * so the drag-and-drop resequencing logic can be exercised without a real DB. */
function createFakeTransactionalTaskRepo(records: TaskRecord[]) {
  return {
    find: async ({ where: { columnId } }: { where: { columnId: string } }) =>
      records
        .filter((t) => t.columnId === columnId)
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ ...t })),
    update: async (id: string, partial: Partial<TaskRecord>) => {
      const record = records.find((t) => t.id === id)!;
      Object.assign(record, partial);
    },
    findOneOrFail: async ({ where: { id } }: { where: { id: string } }) =>
      ({ ...records.find((t) => t.id === id) }) as Task,
  };
}

describe("TasksService", () => {
  let service: TasksService;
  let tasksRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    remove: jest.Mock;
  };
  let taskAssigneesRepository: {
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let columnsService: { getAccessibleColumnOrFail: jest.Mock };
  let boardsService: {
    isBoardMember: jest.Mock;
    getAccessibleBoardOrFail: jest.Mock;
    findOne: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let realtimeGateway: { emitToBoard: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const ownerId = "owner-1";
  const boardId = "board-1";
  const board = { id: boardId, ownerId };

  beforeEach(() => {
    tasksRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => data as Task),
      save: jest.fn(async (entity) => ({ id: "task-1", ...entity }) as Task),
      count: jest.fn(),
      remove: jest.fn(),
    };
    taskAssigneesRepository = {
      save: jest.fn(),
      create: jest.fn((data) => data as TaskAssignee),
      delete: jest.fn(),
    };
    columnsService = { getAccessibleColumnOrFail: jest.fn() };
    boardsService = {
      isBoardMember: jest.fn().mockResolvedValue(false),
      getAccessibleBoardOrFail: jest.fn(),
      findOne: jest.fn(),
    };
    usersService = { findById: jest.fn() };
    realtimeGateway = { emitToBoard: jest.fn() };
    notificationsService = { create: jest.fn() };
    dataSource = { transaction: jest.fn() };

    service = new TasksService(
      tasksRepository as unknown as Repository<Task>,
      taskAssigneesRepository as unknown as Repository<TaskAssignee>,
      columnsService as unknown as ColumnsService,
      boardsService as unknown as BoardsService,
      usersService as unknown as UsersService,
      dataSource as unknown as DataSource,
      realtimeGateway as unknown as RealtimeGateway,
      notificationsService as unknown as NotificationsService,
    );
  });

  describe("move (drag-and-drop)", () => {
    it("re-sequences orders in both columns when a task is dropped into a different column", async () => {
      const records: TaskRecord[] = [
        { id: "task-1", columnId: "col-a", boardId, order: 0 },
        { id: "task-2", columnId: "col-a", boardId, order: 1 },
        { id: "task-3", columnId: "col-a", boardId, order: 2 },
        { id: "task-4", columnId: "col-b", boardId, order: 0 },
      ];

      tasksRepository.findOne.mockResolvedValue({
        id: "task-2",
        columnId: "col-a",
        boardId,
        column: { board },
      } as unknown as Task);
      columnsService.getAccessibleColumnOrFail.mockResolvedValue({
        id: "col-b",
        boardId,
      } as never);
      boardsService.findOne.mockResolvedValue({ id: boardId } as never);
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: () => createFakeTransactionalTaskRepo(records) }),
      );

      await service.move(ownerId, "task-2", {
        targetColumnId: "col-b",
        targetIndex: 0,
      });

      const byId = (id: string) => records.find((t) => t.id === id)!;
      expect(byId("task-2")).toMatchObject({ columnId: "col-b", order: 0 });
      expect(byId("task-4")).toMatchObject({ columnId: "col-b", order: 1 });
      // The source column's remaining tasks are re-sequenced with no gaps.
      expect(byId("task-1")).toMatchObject({ columnId: "col-a", order: 0 });
      expect(byId("task-3")).toMatchObject({ columnId: "col-a", order: 1 });

      expect(realtimeGateway.emitToBoard).toHaveBeenCalledWith(
        boardId,
        "task:moved",
        expect.anything(),
      );
    });

    it("re-sequences orders within the same column when reordering in place", async () => {
      const records: TaskRecord[] = [
        { id: "task-1", columnId: "col-a", boardId, order: 0 },
        { id: "task-2", columnId: "col-a", boardId, order: 1 },
        { id: "task-3", columnId: "col-a", boardId, order: 2 },
      ];

      tasksRepository.findOne.mockResolvedValue({
        id: "task-1",
        columnId: "col-a",
        boardId,
        column: { board },
      } as unknown as Task);
      columnsService.getAccessibleColumnOrFail.mockResolvedValue({
        id: "col-a",
        boardId,
      } as never);
      boardsService.findOne.mockResolvedValue({ id: boardId } as never);
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: () => createFakeTransactionalTaskRepo(records) }),
      );

      // Move task-1 from the front of the column to the last slot.
      await service.move(ownerId, "task-1", {
        targetColumnId: "col-a",
        targetIndex: 2,
      });

      const byId = (id: string) => records.find((t) => t.id === id)!;
      expect(byId("task-2")).toMatchObject({ order: 0 });
      expect(byId("task-3")).toMatchObject({ order: 1 });
      expect(byId("task-1")).toMatchObject({ order: 2 });
    });

    it("rejects moving a task onto a column belonging to a different board", async () => {
      tasksRepository.findOne.mockResolvedValue({
        id: "task-1",
        columnId: "col-a",
        boardId,
        column: { board },
      } as unknown as Task);
      columnsService.getAccessibleColumnOrFail.mockResolvedValue({
        id: "col-x",
        boardId: "some-other-board",
      } as never);

      await expect(
        service.move(ownerId, "task-1", {
          targetColumnId: "col-x",
          targetIndex: 0,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("rejects an assignee who is not a collaborator on the board", async () => {
      columnsService.getAccessibleColumnOrFail.mockResolvedValue({
        id: "col-a",
        boardId,
        board,
      } as never);
      usersService.findById.mockResolvedValue({ id: "outsider-1" } as never);
      boardsService.isBoardMember.mockResolvedValue(false);

      await expect(
        service.create(ownerId, "col-a", {
          title: "Ship it",
          assigneeIds: ["outsider-1"],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(tasksRepository.save).not.toHaveBeenCalled();
    });

    it("creates the task and assigns collaborators", async () => {
      columnsService.getAccessibleColumnOrFail.mockResolvedValue({
        id: "col-a",
        boardId,
        board,
      } as never);
      tasksRepository.count.mockResolvedValue(0);
      tasksRepository.findOne.mockResolvedValue({
        id: "task-1",
        columnId: "col-a",
        boardId,
        column: { board },
        assignees: [],
      } as unknown as Task);

      await service.create(ownerId, "col-a", {
        title: "Ship it",
        assigneeIds: [ownerId],
      });

      expect(tasksRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Ship it",
          columnId: "col-a",
          order: 0,
        }),
      );
      expect(taskAssigneesRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({ taskId: "task-1", userId: ownerId }),
      ]);
      expect(realtimeGateway.emitToBoard).toHaveBeenCalledWith(
        boardId,
        "task:created",
        expect.anything(),
      );
    });
  });
});
