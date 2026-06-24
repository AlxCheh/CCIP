import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '../../common/guards/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('live')
  async live() {
    return this.health.checkLive();
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      return await this.health.checkReady();
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }
  }
}
