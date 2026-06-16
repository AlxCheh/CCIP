// apps/api/test/integration/helpers/advisory-lock-peek.ts
import type { PrismaClient } from '@ccip/database';

export interface AdvisoryLock {
  pid: number;
  granted: boolean;
  classid: number;
  objid: number;
}

export async function peekAdvisoryLocks(prisma: PrismaClient): Promise<AdvisoryLock[]> {
  return prisma.$queryRaw<AdvisoryLock[]>`
    SELECT pid, granted, classid, objid
    FROM pg_locks
    WHERE locktype = 'advisory'
  `;
}
