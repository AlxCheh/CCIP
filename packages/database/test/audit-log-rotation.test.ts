import { PrismaClient } from '../src/generated/client';

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

  test('rotation: dropping a non-current partition does not affect data in current partition', async () => {
    await prisma.$executeRawUnsafe(`CALL partman.run_maintenance_proc()`);

    const probeRecordId = BigInt(Date.now());
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO audit_log (table_name, record_id, action, performed_at, organization_id)
        VALUES ('partition_probe', ${probeRecordId}, 'insert', NOW(), '${FIXTURE_ORG_ID}'::uuid)`);

      // Pick the partition with the largest upper bound (furthest in the future).
      // pg_get_expr on relpartbound returns strings like:
      //   FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00')
      //   DEFAULT
      // String-sort by the rendered bound is chronologically correct for monthly partitions
      // (TO ('YYYY-MM-DD ...') sorts lexicographically == chronologically).
      const targets = await prisma.$queryRaw<Array<{ partition_name: string }>>`
        SELECT c.relname AS partition_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'public.audit_log'::regclass
          AND pg_get_expr(c.relpartbound, c.oid) NOT LIKE '%DEFAULT%'
        ORDER BY pg_get_expr(c.relpartbound, c.oid) DESC
        LIMIT 1`;
      expect(targets.length).toBeGreaterThan(0);

      await prisma.$executeRawUnsafe(`DROP TABLE "${targets[0].partition_name}"`);

      const survivors = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM audit_log
        WHERE table_name = 'partition_probe' AND record_id = ${probeRecordId}`;
      expect(Number(survivors[0].count)).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`
        DELETE FROM audit_log WHERE table_name = 'partition_probe' AND record_id = ${probeRecordId}`);
    }
  });
});
