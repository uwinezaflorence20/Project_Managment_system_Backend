import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { TaskPriority, TaskStatus } from "../entities/task.entity";

export enum TaskSortBy {
  NEWEST = "newest",
  OLDEST = "oldest",
  PRIORITY = "priority",
  DEADLINE = "deadline",
}

export class QueryTasksDto {
  @ApiPropertyOptional({
    description: "Case-insensitive match against task title",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: "Filter by assignee user id" })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TaskSortBy, default: TaskSortBy.NEWEST })
  @IsOptional()
  @IsIn(Object.values(TaskSortBy))
  sortBy?: TaskSortBy;
}
