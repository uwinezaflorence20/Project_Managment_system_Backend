import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/entities/user.entity";
import { Board } from "../boards/entities/board.entity";
import { Task } from "../tasks/entities/task.entity";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User, Board, Task])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
