import { Module } from '@nestjs/common';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [PeriodController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodModule {}
