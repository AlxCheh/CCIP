import { HealthService } from '../health.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let redisInstance: { ping: jest.Mock; disconnect: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redisInstance = {
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn(),
    };
    (Redis as unknown as jest.Mock).mockImplementation(() => redisInstance);

    service = new HealthService(
      prisma as unknown as PrismaService,
      {
        get: (key: string, def?: unknown) =>
          ({
            REDIS_HOST: 'localhost',
            REDIS_PORT: 6379,
            REDIS_PASSWORD: 'test-pass',
          })[key] ?? def,
      } as never,
    );
  });

  it('checkLive() resolves without touching Postgres or Redis', async () => {
    await service.checkLive();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redisInstance.ping).not.toHaveBeenCalled();
  });

  it('checkReady() resolves when both Postgres and Redis respond', async () => {
    await expect(service.checkReady()).resolves.toEqual({
      postgres: true,
      redis: true,
    });
  });

  it('checkReady() rejects when Postgres query throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(service.checkReady()).rejects.toThrow('connection refused');
  });

  it('checkReady() rejects when Redis ping throws', async () => {
    redisInstance.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.checkReady()).rejects.toThrow('ECONNREFUSED');
  });
});
