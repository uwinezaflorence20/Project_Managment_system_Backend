import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User, UserRole } from "../users/entities/user.entity";
import { BoardsService } from "./boards.service";
import { CreateBoardDto } from "./dto/create-board.dto";
import { UpdateBoardDto } from "./dto/update-board.dto";
import { AddMemberDto } from "./dto/add-member.dto";

@ApiTags("boards")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("boards")
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  // Only admins create projects and assign users to them; regular users can
  // only view and work within the projects they've been assigned to.
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.boardsService.findAll(user.id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: User, @Param("id") id: string) {
    return this.boardsService.findOne(user.id, id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(user.id, id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(":id")
  remove(@CurrentUser() user: User, @Param("id") id: string) {
    return this.boardsService.remove(user.id, id);
  }

  @Roles(UserRole.ADMIN)
  @Post(":id/members")
  addMember(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.boardsService.addMember(user.id, id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(":id/members/:userId")
  removeMember(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.boardsService.removeMember(user.id, id, userId);
  }
}
