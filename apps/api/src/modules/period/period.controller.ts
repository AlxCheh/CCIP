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
import { SubmitGpDto } from './dto/submit-gp.dto';
import { UpsertPeriodFactDto } from './dto/upsert-period-fact.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string; organizationId: string };
}

@Controller('periods')
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post('open')
  @Roles('stroycontrol', 'admin')
  open(@Body() dto: OpenPeriodDto, @Request() req: AuthRequest) {
    return this.periodService.openPeriod(
      dto.objectId,
      parseInt(req.user.id, 10),
    );
  }

  @Get(':id')
  @Roles('director', 'stroycontrol', 'admin')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthRequest,
  ) {
    return this.periodService.findById(id, parseInt(req.user.id, 10));
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

  // Public endpoint — authenticated by GP token embedded in URL
  @Post('gp/submit/:token')
  submitGp(@Param('token') token: string, @Body() dto: SubmitGpDto) {
    return this.periodService.submitGp(token, dto.gpSubmittedByName, dto.items);
  }

  @Patch(':id/facts/:boqItemId')
  @Roles('stroycontrol', 'admin')
  upsertFact(
    @Param('id', ParseIntPipe) id: number,
    @Param('boqItemId', ParseIntPipe) boqItemId: number,
    @Body() dto: UpsertPeriodFactDto,
    @Request() req: AuthRequest,
  ) {
    return this.periodService.upsertPeriodFact(
      id,
      boqItemId,
      dto.scVolume,
      parseInt(req.user.id, 10),
    );
  }
}
