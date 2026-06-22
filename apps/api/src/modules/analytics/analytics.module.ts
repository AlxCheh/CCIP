import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { MvStalenessService } from './mv-staleness.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { WorkPaceService } from './work-pace.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AnalyticsController],
  providers: [MvStalenessService, AnalyticsService, WorkPaceService],
  exports: [MvStalenessService, WorkPaceService],
})
export class AnalyticsModule {}
