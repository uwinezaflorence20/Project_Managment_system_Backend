import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Task } from "./entities/task.entity";
import { TaskAssignee } from "./entities/task-assignee.entity";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";
import { ColumnsModule } from "../columns/columns.module";
import { BoardsModule } from "../boards/boards.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskAssignee]),
    ColumnsModule,
    BoardsModule,
    RealtimeModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
