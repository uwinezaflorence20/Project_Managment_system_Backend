import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Board } from "./entities/board.entity";
import { BoardMember } from "./entities/board-member.entity";
import { BoardColumn } from "../columns/entities/column.entity";
import { BoardsService } from "./boards.service";
import { BoardsController } from "./boards.controller";
import { RealtimeModule } from "../realtime/realtime.module";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Board, BoardColumn, BoardMember]),
    RealtimeModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}
