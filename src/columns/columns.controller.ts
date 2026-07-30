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
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "../users/entities/user.entity";
import { ColumnsService } from "./columns.service";
import { CreateColumnDto } from "./dto/create-column.dto";
import { UpdateColumnDto } from "./dto/update-column.dto";
import { ReorderColumnsDto } from "./dto/reorder-columns.dto";

@ApiTags("columns")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("boards/:boardId/columns")
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Param("boardId") boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columnsService.create(user.id, boardId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Param("boardId") boardId: string) {
    return this.columnsService.findAllForBoard(user.id, boardId);
  }

  @Patch("reorder")
  reorder(
    @CurrentUser() user: User,
    @Param("boardId") boardId: string,
    @Body() dto: ReorderColumnsDto,
  ) {
    return this.columnsService.reorder(user.id, boardId, dto);
  }

  @Patch(":columnId")
  update(
    @CurrentUser() user: User,
    @Param("boardId") boardId: string,
    @Param("columnId") columnId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columnsService.update(user.id, boardId, columnId, dto);
  }

  @Delete(":columnId")
  remove(
    @CurrentUser() user: User,
    @Param("boardId") boardId: string,
    @Param("columnId") columnId: string,
  ) {
    return this.columnsService.remove(user.id, boardId, columnId);
  }
}
