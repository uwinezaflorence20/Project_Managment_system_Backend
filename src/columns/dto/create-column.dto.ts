import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class CreateColumnDto {
  @ApiProperty({ example: "In Review" })
  @IsString()
  @MinLength(1)
  title: string;
}
