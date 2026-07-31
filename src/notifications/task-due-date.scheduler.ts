import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, IsNull, LessThan, Not, Repository } from "typeorm";
import { Task, TaskStatus } from "../tasks/entities/task.entity";
import { NotificationsService } from "./notifications.service";
import { NotificationType } from "./entities/notification.entity";

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TaskDueDateScheduler {
  private readonly logger = new Logger(TaskDueDateScheduler.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleDueDateNotifications(): Promise<void> {
    const now = new Date();
    await this.notifyDueSoon(now);
    await this.notifyOverdue(now);
  }

  private async notifyDueSoon(now: Date): Promise<void> {
    const tasks = await this.tasksRepository.find({
      where: {
        dueDate: Between(now, new Date(now.getTime() + DUE_SOON_WINDOW_MS)),
        dueSoonNotifiedAt: IsNull(),
        assignedUserId: Not(IsNull()),
        status: Not(TaskStatus.DONE),
      },
    });

    for (const task of tasks) {
      await this.notificationsService.create(
        task.assignedUserId as string,
        NotificationType.TASK_DUE_SOON,
        `"${task.title}" is due soon`,
        { boardId: task.boardId, taskId: task.id },
      );
      await this.tasksRepository.update(task.id, { dueSoonNotifiedAt: now });
    }
    if (tasks.length > 0) {
      this.logger.debug(`Sent ${tasks.length} due-soon notification(s)`);
    }
  }

  private async notifyOverdue(now: Date): Promise<void> {
    const tasks = await this.tasksRepository.find({
      where: {
        dueDate: LessThan(now),
        overdueNotifiedAt: IsNull(),
        assignedUserId: Not(IsNull()),
        status: Not(TaskStatus.DONE),
      },
    });

    for (const task of tasks) {
      await this.notificationsService.create(
        task.assignedUserId as string,
        NotificationType.TASK_OVERDUE,
        `"${task.title}" is overdue`,
        { boardId: task.boardId, taskId: task.id },
      );
      await this.tasksRepository.update(task.id, { overdueNotifiedAt: now });
    }
    if (tasks.length > 0) {
      this.logger.debug(`Sent ${tasks.length} overdue notification(s)`);
    }
  }
}
