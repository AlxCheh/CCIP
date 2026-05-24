import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DisputeSlaService } from './dispute-sla.service';
import { DisputeSlaWorker } from './dispute-sla.worker';

const workerProviders = process.env.ROLE === 'worker' ? [DisputeSlaWorker] : [];

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sla' }),
    PrismaModule,
  ],
  providers: [DisputeSlaService, ...workerProviders],
  exports: [DisputeSlaService],
})
export class DisputeSlaModule {}
