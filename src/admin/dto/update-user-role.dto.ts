import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { UserRole } from "../../users/entities/user.entity";

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  @IsEnum(UserRole)
  role: UserRole;
}
