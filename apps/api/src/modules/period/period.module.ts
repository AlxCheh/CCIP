import { Module } from '@nestjs/common';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AuditLogModule, AnalyticsModule],
  controllers: [PeriodController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodModule {}
