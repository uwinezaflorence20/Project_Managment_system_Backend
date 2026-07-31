import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class AddMemberDto {
  @ApiProperty({ example: "teammate@example.com" })
  @IsEmail()
  email: string;
}
