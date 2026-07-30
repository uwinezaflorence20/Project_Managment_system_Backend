import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";

export class ReorderColumnsDto {
  @ApiProperty({
    description: "Column IDs for this board in the desired new order",
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  orderedColumnIds: string[];
}
