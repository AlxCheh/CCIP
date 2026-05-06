import {
  Body,
  Controller,
  Get,
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
import { ZeroReportService } from './zero-report.service';
import { CreateZeroReportDto } from './dto/create-zero-report.dto';
import { UpsertZeroReportItemDto } from './dto/upsert-zero-report-item.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ZeroReportController {
  constructor(private readonly zeroReportService: ZeroReportService) {}

  @Post('objects/:objectId/zero-report')
  @Roles('site_engineer', 'admin')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Body() dto: CreateZeroReportDto,
    @Request() req: AuthRequest,
  ) {
    return this.zeroReportService.create(parseInt(req.user.id, 10), objectId, dto);
  }

  @Get('objects/:objectId/zero-report')
  @Roles('director', 'site_engineer', 'admin')
  getByObject(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Request() req: AuthRequest,
  ) {
    return this.zeroReportService.getByObject(parseInt(req.user.id, 10), objectId);
  }

  @Post('objects/:objectId/zero-report/items')
  @Roles('site_engineer', 'admin')
  @HttpCode(HttpStatus.OK)
  upsertItem(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Body() dto: UpsertZeroReportItemDto,
    @Request() req: AuthRequest,
  ) {
    return this.zeroReportService.upsertItem(parseInt(req.user.id, 10), objectId, dto);
  }

  @Post('objects/:objectId/zero-report/submit')
  @Roles('site_engineer', 'admin')
  @HttpCode(HttpStatus.OK)
  submit(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Request() req: AuthRequest,
  ) {
    return this.zeroReportService.submit(parseInt(req.user.id, 10), objectId);
  }

  @Post('objects/:objectId/zero-report/approve')
  @Roles('director')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Request() req: AuthRequest,
  ) {
    return this.zeroReportService.approve(parseInt(req.user.id, 10), objectId);
  }
}
