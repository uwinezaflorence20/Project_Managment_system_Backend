import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User, UserRole } from "../users/entities/user.entity";
import { AdminService } from "./admin.service";
import { UpdateUserRoleDto } from "./dto/update-user-role.dto";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("stats")
  getStats() {
    return this.adminService.getStats();
  }

  @Get("users")
  getUsers() {
    return this.adminService.findAllUsers();
  }

  @Patch("users/:id/role")
  updateUserRole(
    @CurrentUser() currentUser: User,
    @Param("id") id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(id, dto.role, currentUser.id);
  }

  @Delete("users/:id")
  removeUser(@CurrentUser() currentUser: User, @Param("id") id: string) {
    return this.adminService.removeUser(id, currentUser.id);
  }

  @Get("boards")
  getBoards() {
    return this.adminService.findAllBoards();
  }

  @Get("boards/:id")
  getBoardDetail(@Param("id") id: string) {
    return this.adminService.getBoardDetail(id);
  }

  @Delete("boards/:id")
  removeBoard(@Param("id") id: string) {
    return this.adminService.removeBoard(id);
  }
}
