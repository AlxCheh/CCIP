import { Controller, Post, Body, Request, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { AdminService } from './admin.service';
import { PeriodService } from '../period/period.service';
import { CorrectFactDto } from './dto/correct-fact.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string; organizationId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly periodService: PeriodService,
  ) {}

  @Post('refresh-dashboard')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  refreshDashboard() {
    return this.adminService.refreshDashboard();
  }

  @Post('correct-fact')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async correctFact(@Body() dto: CorrectFactDto, @Request() req: AuthRequest) {
    await this.periodService.adminCorrectFact(
      dto.factId,
      dto.scVolume,
      dto.accepted,
      parseInt(req.user.id, 10),
      dto.reason,
    );
  }
}
