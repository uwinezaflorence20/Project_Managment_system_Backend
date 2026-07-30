import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateBoardDto {
  @ApiProperty({ example: "Website Redesign" })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: "Everything needed to ship the new site" })
  @IsOptional()
  @IsString()
  description?: string;
}
