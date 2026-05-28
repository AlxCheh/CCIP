import { Module } from '@nestjs/common';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DisputeSlaModule } from '../dispute-sla/dispute-sla.module';
import { DisputeService } from './dispute.service';
import { DisputeFlagService } from './dispute-flag.service';
import { DisputeController } from './dispute.controller';

@Module({
  imports: [PrismaModule, AuditLogModule, DisputeSlaModule],
  controllers: [DisputeController],
  providers: [DisputeService, DisputeFlagService],
  exports: [DisputeService, DisputeFlagService],
})
export class DisputeModule {}
