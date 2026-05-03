import { Controller, Post, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('refresh-dashboard')
  @Roles('admin')
  @HttpCode(200)
  refreshDashboard() {
    return this.adminService.refreshDashboard();
  }
}
