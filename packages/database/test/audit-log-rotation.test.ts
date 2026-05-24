import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FIXTURE_ORG_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  // Required NOT NULL fields without defaults in Organization: id, name, slug.
  await prisma.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, slug)
    VALUES ('${FIXTURE_ORG_ID}', 'partman-rotation-test', 'partman-rotation-test')
    ON CONFLICT (id) DO NOTHING`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${FIXTURE_ORG_ID}'`);
  await prisma.$disconnect();
});

describe('AuditLog partitioning (ADR-010, §10.5 T-22)', () => {
  test('pg_partman extension exists and is v5.x', async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string; extversion: string }>>`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_partman'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].extversion).toMatch(/^5\./);
  });

  test('pg_cron extension exists', async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_cron'`;
    expect(rows).toHaveLength(1);
  });

  test('audit_log is a partitioned table', async () => {
    const rows = await prisma.$queryRaw<Array<{ relkind: string }>>`
      SELECT relkind FROM pg_class WHERE relname = 'audit_log' AND relnamespace = 'public'::regnamespace`;
    expect(rows[0]?.relkind).toBe('p');
  });

  test('audit_log is registered in partman.part_config with monthly interval and premake=3', async () => {
    const rows = await prisma.$queryRaw<Array<{ partition_interval: string; premake: number }>>`
      SELECT partition_interval, premake
      FROM partman.part_config
      WHERE parent_table = 'public.audit_log'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].partition_interval).toBe('1 mon');
    expect(rows[0].premake).toBe(3);
  });

  test('cron job audit-log-partman-maintenance is scheduled', async () => {
    const rows = await prisma.$queryRaw<Array<{ jobname: string; schedule: string; active: boolean }>>`
      SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'audit-log-partman-maintenance'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe('0 3 * * *');
    expect(rows[0].active).toBe(true);
  });
});
