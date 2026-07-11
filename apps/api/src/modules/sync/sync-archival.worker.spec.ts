import { SyncArchivalWorker } from './sync-archival.worker';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SyncArchivalWorker', () => {
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  let prisma: jest.Mocked<PrismaService>;
  let worker: SyncArchivalWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      syncQueue: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    } as unknown as jest.Mocked<PrismaService>;
    worker = new SyncArchivalWorker(
      queue as never,
      prisma,
    );
  });

  it('registers the daily repeatable job on init', async () => {
    await worker.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(
      'sync.archive',
      {},
      expect.objectContaining({
        repeat: { cron: '0 3 * * *' },
        jobId: 'sync-archival-daily',
      }),
    );
  });

  it('deletes terminal rows older than 30 days, keeping conflicts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-10T03:00:00Z'));

    await worker.process();

    expect(prisma.syncQueue.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['applied', 'rejected', 'escalated'] },
        serverReceivedAt: { lt: new Date('2026-06-10T03:00:00Z') },
      },
    });

    jest.useRealTimers();
  });
});
