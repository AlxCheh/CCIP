import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { SystemConfigService } from './system-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  @Roles('director', 'stroycontrol', 'admin')
  list(@Request() req: AuthRequest) {
    return this.systemConfigService.list(parseInt(req.user.id, 10));
  }

  @Patch(':key')
  @Roles('admin')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
    @Request() req: AuthRequest,
  ) {
    return this.systemConfigService.update(parseInt(req.user.id, 10), key, dto);
  }
}
