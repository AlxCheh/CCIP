import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { BoqService } from './boq.service';
import { CreateBoqDto } from './dto/create-boq.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BoqController {
  constructor(private readonly boqService: BoqService) {}

  @Post('objects/:objectId/boq')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Body() dto: CreateBoqDto,
    @Request() req: AuthRequest,
  ) {
    return this.boqService.createInitial(
      parseInt(req.user.id, 10),
      objectId,
      dto,
    );
  }

  @Get('objects/:objectId/boq/active')
  @Roles('director', 'sc', 'admin')
  getActive(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Request() req: AuthRequest,
  ) {
    return this.boqService.getActive(parseInt(req.user.id, 10), objectId);
  }

  @Get('objects/:objectId/boq-versions')
  @Roles('director', 'sc', 'admin')
  listVersions(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Request() req: AuthRequest,
  ) {
    return this.boqService.listVersions(parseInt(req.user.id, 10), objectId);
  }
}
