// apps/api/test/integration/smoke.integration.spec.ts
import { PrismaClient } from '@ccip/database';
import { truncateAll } from './setup/truncate';

describe('integration suite smoke', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('connects to test DB and runs TRUNCATE', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0].ok).toBe(1);
  });

  it('required extensions are installed', async () => {
    const exts = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension
    `;
    const names = exts.map((e) => e.extname);
    expect(names).toContain('pg_partman');
    expect(names).toContain('pg_cron');
  });
});
