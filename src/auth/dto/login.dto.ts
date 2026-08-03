import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "StrongPassword123" })
  @IsString()
  password: string;

  @ApiPropertyOptional({
    description: "Issue a long-lived session (30 days) instead of the default.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
