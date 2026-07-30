import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "../users/entities/user.entity";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { MoveTaskDto } from "./dto/move-task.dto";
import { QueryTasksDto } from "./dto/query-tasks.dto";

@ApiTags("tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post("boards/:boardId/columns/:columnId/tasks")
  create(
    @CurrentUser() user: User,
    @Param("columnId") columnId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user.id, columnId, dto);
  }

  @Get("boards/:boardId/tasks")
  findAll(
    @CurrentUser() user: User,
    @Param("boardId") boardId: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.tasksService.findAll(user.id, boardId, query);
  }

  @Get("tasks/:taskId")
  findOne(@CurrentUser() user: User, @Param("taskId") taskId: string) {
    return this.tasksService.findOne(user.id, taskId);
  }

  @Patch("tasks/:taskId")
  update(
    @CurrentUser() user: User,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, taskId, dto);
  }

  @Patch("tasks/:taskId/move")
  move(
    @CurrentUser() user: User,
    @Param("taskId") taskId: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasksService.move(user.id, taskId, dto);
  }

  @Delete("tasks/:taskId")
  remove(@CurrentUser() user: User, @Param("taskId") taskId: string) {
    return this.tasksService.remove(user.id, taskId);
  }
}
