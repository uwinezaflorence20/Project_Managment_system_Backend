import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Notification, NotificationType } from "./entities/notification.entity";
import { RealtimeGateway } from "../realtime/realtime.gateway";

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(
    userId: string,
    type: NotificationType,
    message: string,
    opts: { boardId?: string; taskId?: string } = {},
  ): Promise<Notification> {
    const notification = this.notificationsRepository.create({
      userId,
      type,
      message,
      boardId: opts.boardId,
      taskId: opts.taskId,
    });
    const saved = await this.notificationsRepository.save(notification);
    this.realtimeGateway.emitToUser(userId, "notification:new", saved);
    return saved;
  }

  findAllForUser(userId: string): Promise<Notification[]> {
    return this.notificationsRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException("Notification not found");
    }
    notification.isRead = true;
    return this.notificationsRepository.save(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationsRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }
}
