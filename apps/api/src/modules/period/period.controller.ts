import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}
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
  open(@Body() dto: OpenPeriodDto, @Request() req: AuthRequest) {
    return this.periodService.openPeriod(
      dto.objectId,
      parseInt(req.user.id, 10),
    );
  }

  @Patch(':id/close')
  @Roles('sc', 'admin')
  close(@Param('id', ParseIntPipe) id: number, @Request() req: AuthRequest) {
    return this.periodService.closePeriod(id, parseInt(req.user.id, 10));
  }

  @Get('by-object/:objectId')
  @Roles('director', 'sc', 'gp', 'admin')
  byObject(@Param('objectId', ParseIntPipe) objectId: number) {
    return this.periodService.findByObject(objectId);
  }
}
