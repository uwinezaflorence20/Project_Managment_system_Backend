import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BoardColumn } from "./entities/column.entity";
import { ColumnsService } from "./columns.service";
import { ColumnsController } from "./columns.controller";
import { BoardsModule } from "../boards/boards.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([BoardColumn]),
    BoardsModule,
    RealtimeModule,
  ],
  controllers: [ColumnsController],
  providers: [ColumnsService],
  exports: [ColumnsService],
})
export class ColumnsModule {}
