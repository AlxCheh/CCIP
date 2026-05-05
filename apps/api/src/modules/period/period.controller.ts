import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { Roles } from '../../common/guards/roles.decorator';
import { PeriodService } from './period.service';
import { OpenPeriodDto } from './dto/open-period.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string; organizationId: string };
}

@Controller('periods')
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post('open')
  @Roles('stroycontrol', 'admin')
  open(@Body() dto: OpenPeriodDto, @Request() req: AuthRequest) {
    return this.periodService.openPeriod(dto.objectId, parseInt(req.user.id, 10));
  }

  @Patch(':id/close')
  @Roles('stroycontrol', 'admin')
  close(@Param('id', ParseIntPipe) id: number, @Request() req: AuthRequest) {
    return this.periodService.closePeriod(id, parseInt(req.user.id, 10));
  }

  @Get('by-object/:objectId')
  @Roles('director', 'stroycontrol', 'admin')
  byObject(@Param('objectId', ParseIntPipe) objectId: number) {
    return this.periodService.findByObject(objectId);
  }
}
