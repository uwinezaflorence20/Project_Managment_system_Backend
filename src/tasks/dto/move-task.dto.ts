import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsUUID, Min } from "class-validator";

export class MoveTaskDto {
  @ApiProperty({
    description:
      "The column the task is being dropped into (can be the same column it is already in)",
  })
  @IsUUID("4")
  targetColumnId: string;

  @ApiProperty({
    description:
      "Zero-based position the task should occupy within the target column",
    example: 0,
  })
  @IsInt()
  @Min(0)
  targetIndex: number;
}
