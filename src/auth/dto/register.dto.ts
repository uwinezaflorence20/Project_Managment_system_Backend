import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "Ada Lovelace" })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "StrongPassword123" })
  @IsString()
  @MinLength(6)
  password: string;
}
