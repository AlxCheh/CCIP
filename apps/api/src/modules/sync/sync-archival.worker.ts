import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { PrismaService } from '../../common/prisma/prisma.service';

// Runtime — bull (@nestjs/bull): repeat принимает { cron }. Типы bullmq в
// проекте описывают { pattern } — используем минимальный локальный интерфейс.
interface ArchivalQueue {
  add(
    name: string,
    data: object,
    opts: { repeat: { cron: string }; jobId: string },
  ): Promise<unknown>;
}

const ARCHIVE_STATUSES = ['applied', 'rejected', 'escalated'];
const RETENTION_DAYS = 30;

@Processor('sync.archival')
@Injectable()
export class SyncArchivalWorker implements OnModuleInit {
  constructor(
    @InjectQueue('sync.archival') private readonly queue: ArchivalQueue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sync.archive',
      {},
      { repeat: { cron: '0 3 * * *' }, jobId: 'sync-archival-daily' },
    );
  }

  @Process('sync.archive')
  async process(): Promise<void> {
    // conflict не удаляется: нерешённый конфликт не должен исчезнуть
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const { count } = await this.prisma.syncQueue.deleteMany({
      where: {
        status: { in: ARCHIVE_STATUSES },
        serverReceivedAt: { lt: cutoff },
      },
    });
    if (count > 0) {
      console.log(`[Sync Archival] deleted ${count} archived sync_queue rows`);
    }
  }
}
