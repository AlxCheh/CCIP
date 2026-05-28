import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';

@Module({
  imports: [AuditLogModule, BullModule.registerQueue({ name: 'analytics' })],
  controllers: [PeriodController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodModule {}
