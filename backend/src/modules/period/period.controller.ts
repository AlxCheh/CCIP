import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { PeriodService } from './period.service';
import { OpenPeriodDto } from './dto/open-period.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('periods')
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post('open')
  @Roles('sc', 'admin')
  open(@Body() dto: OpenPeriodDto, @Request() req: any) {
    return this.periodService.openPeriod(dto.objectId, req.user.id);
  }

  @Patch(':id/close')
  @Roles('sc', 'admin')
  close(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.periodService.closePeriod(id, req.user.id);
  }

  @Get('by-object/:objectId')
  @Roles('director', 'sc', 'gp', 'admin')
  byObject(@Param('objectId', ParseUUIDPipe) objectId: string) {
    return this.periodService.findByObject(objectId);
  }
}
