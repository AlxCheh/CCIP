import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const MV_NAME = 'mv_object_current_status';
const ADVISORY_LOCK_KEY = 1_234_567_890n;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshDashboard(): Promise<{ refreshedAt: string }> {
    return this.prisma.$transaction(async (tx) => {
      const [lockResult] = await tx.$queryRawUnsafe<[{ acquired: boolean }]>(
        `SELECT pg_try_advisory_xact_lock($1) AS acquired`,
        ADVISORY_LOCK_KEY,
      );

      if (!lockResult.acquired) {
        throw new ConflictException('REFRESH_IN_PROGRESS');
      }

      try {
        await tx.$executeRawUnsafe(
          `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status`,
        );
      } catch {
        throw new InternalServerErrorException('REFRESH_FAILED');
      }

      const now = new Date();

      await tx.mvRefreshLog.upsert({
        where: { viewName: MV_NAME },
        update: { refreshedAt: now, isStale: false, periodId: null },
        create: { viewName: MV_NAME, refreshedAt: now, isStale: false },
      });

      return { refreshedAt: now.toISOString() };
    });
  }
}
