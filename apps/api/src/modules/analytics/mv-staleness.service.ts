import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const MV_NAME = 'mv_object_current_status';
const STALE_MINUTES = 30;

export type StalenessMeta = {
  isStale: boolean;
  refreshedAt: string | null;
  staleReason: 'mv_refresh_failed' | 'older_than_30min' | null;
};

@Injectable()
export class MvStalenessService {
  constructor(private readonly prisma: PrismaService) {}

  async getStalenessMeta(): Promise<StalenessMeta> {
    const log = await this.prisma.mvRefreshLog.findUnique({
      where: { viewName: MV_NAME },
      select: { isStale: true, refreshedAt: true },
    });

    if (!log) {
      return { isStale: false, refreshedAt: null, staleReason: null };
    }

    if (log.isStale) {
      return {
        isStale: true,
        refreshedAt: log.refreshedAt.toISOString(),
        staleReason: 'mv_refresh_failed',
      };
    }

    const diffMs = Date.now() - log.refreshedAt.getTime();
    if (diffMs > STALE_MINUTES * 60 * 1000) {
      return {
        isStale: true,
        refreshedAt: log.refreshedAt.toISOString(),
        staleReason: 'older_than_30min',
      };
    }

    return {
      isStale: false,
      refreshedAt: log.refreshedAt.toISOString(),
      staleReason: null,
    };
  }
}
