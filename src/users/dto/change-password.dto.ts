import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({ example: "CurrentPassword123" })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: "NewStrongPassword456" })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
