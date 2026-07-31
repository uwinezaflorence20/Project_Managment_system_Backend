import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "./entities/notification.entity";
import { Task } from "../tasks/entities/task.entity";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { TaskDueDateScheduler } from "./task-due-date.scheduler";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Task]), RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, TaskDueDateScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
