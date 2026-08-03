import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({ description: "The reset token received by email" })
  @IsString()
  token: string;

  @ApiProperty({ example: "NewStrongPassword456" })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
