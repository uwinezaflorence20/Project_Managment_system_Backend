import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Board } from "../boards/entities/board.entity";
import { BoardMember } from "../boards/entities/board-member.entity";
import { AuthModule } from "../auth/auth.module";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [TypeOrmModule.forFeature([Board, BoardMember]), AuthModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
