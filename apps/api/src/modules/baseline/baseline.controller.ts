import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { BaselineService } from './baseline.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';
import { ApproveBaselineUpdateDto } from './dto/approve-baseline-update.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BaselineController {
  constructor(private readonly baselineService: BaselineService) {}

  @Post('objects/:objectId/baseline-update-requests')
  @Roles('stroycontrol', 'admin')
  @HttpCode(HttpStatus.CREATED)
  createRequest(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Body() dto: CreateBaselineUpdateRequestDto,
    @Request() req: AuthRequest,
  ) {
    return this.baselineService.createRequest(
      parseInt(req.user.id, 10),
      objectId,
      dto,
    );
  }

  @Post('baseline-update-requests/:id/approve')
  @Roles('admin')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveBaselineUpdateDto,
    @Request() req: AuthRequest,
  ) {
    return this.baselineService.approveRequest(
      parseInt(req.user.id, 10),
      id,
      dto,
    );
  }
}
