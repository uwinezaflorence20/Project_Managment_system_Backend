import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { TaskPriority, TaskStatus } from "../entities/task.entity";

export class CreateTaskDto {
  @ApiProperty({ example: "Design the login page" })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: "Include mobile and desktop mockups" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ example: "2026-08-15" })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "User id to assign this task to" })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}
