import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Repository } from "typeorm";
import { Server, Socket } from "socket.io";
import { Board } from "../boards/entities/board.entity";
import { BoardMember } from "../boards/entities/board-member.entity";
import { JwtPayload } from "../auth/types/jwt-payload.interface";

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    email?: string;
  };
}

/**
 * Real-time layer for the Kanban board. Clients authenticate with the same
 * JWT they use for the REST API, then join a room per board they have open
 * so drag-and-drop / CRUD changes made by one client (or one tab) show up
 * live for everyone else looking at that board.
 */
@Injectable()
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Board)
    private readonly boardsRepository: Repository<Board>,
    @InjectRepository(BoardMember)
    private readonly boardMembersRepository: Repository<BoardMember>,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error("Missing token");
      }
      const payload = this.jwtService.verify<JwtPayload>(token);
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      client.join(this.userRoomName(payload.sub));
    } catch {
      client.emit("exception", { message: "Authentication failed" });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage("joinBoard")
  async handleJoinBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() boardId: string,
  ) {
    if (!client.data.userId) return;

    const board = await this.boardsRepository.findOne({
      where: { id: boardId },
    });
    const isMember =
      board &&
      (board.ownerId === client.data.userId ||
        (await this.boardMembersRepository.exists({
          where: { boardId, userId: client.data.userId },
        })));
    if (!isMember) {
      client.emit("exception", { message: "Board not found" });
      return;
    }

    await client.join(this.roomName(boardId));
    client.emit("joinedBoard", { boardId });
  }

  @SubscribeMessage("leaveBoard")
  handleLeaveBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() boardId: string,
  ) {
    client.leave(this.roomName(boardId));
  }

  emitToBoard(boardId: string, event: string, payload: unknown) {
    this.server.to(this.roomName(boardId)).emit(event, payload);
  }

  /** Used for events relevant to a boards list (create/delete) rather than one open board. */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(this.userRoomName(userId)).emit(event, payload);
  }

  private roomName(boardId: string): string {
    return `board:${boardId}`;
  }

  private userRoomName(userId: string): string {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    const header = client.handshake.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      return header.slice("Bearer ".length);
    }
    return undefined;
  }
}
