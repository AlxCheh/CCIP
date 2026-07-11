import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { PeriodModule } from '../period/period.module';
import { DocumentsModule } from '../documents/documents.module';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncArchivalWorker } from './sync-archival.worker';

// Как в DisputeSlaModule: воркер поднимается только в worker-инстансе
const workerProviders =
  process.env.ROLE === 'worker' ? [SyncArchivalWorker] : [];

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sync.archival' }),
    PrismaModule,
    AuthModule,
    AuditLogModule,
    PeriodModule,
    DocumentsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, ...workerProviders],
})
export class SyncModule {}
