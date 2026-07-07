import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Lightweight self-check — does NOT touch Postgres/Redis.
  // Deliberate deviation from the literal ADR-005 text ("checkBoth() for both probes") —
  // see docs/plans/specs/2026-06-24-m12-k8s-scaffold-design.md §6/§11: checkBoth() on
  // liveness would make kubelet kill the sla-worker on a transient DB blip.
  checkLive(): Promise<{ alive: true }> {
    return Promise.resolve({ alive: true });
  }

  async checkReady(): Promise<{ postgres: boolean; redis: boolean }> {
    await this.prisma.$queryRaw`SELECT 1`;

    const redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      // lazyConnect: true — ping() triggers the connection implicitly.
      // (Do NOT call redis.connect() explicitly here: the test double only
      // stubs ping()/disconnect(), matching ioredis's lazyConnect contract.)
      await redis.ping();
    } finally {
      redis.disconnect();
    }

    return { postgres: true, redis: true };
  }
}
