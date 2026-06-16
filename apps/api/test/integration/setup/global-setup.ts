// apps/api/test/integration/setup/global-setup.ts
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { TEST_DB_URL } from './env';

export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB_URL;

  // Ensure DB exists (create if not). We connect to maintenance DB 'postgres' for CREATE DATABASE.
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.replace(/^\//, '');
  const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const { rowCount } = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [dbName],
  );
  if (rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  // Apply Prisma migrations to test DB
  execSync('pnpm --filter @ccip/database migrate:deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });

  // Verify required extensions
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  const required = ['pg_partman', 'pg_cron'];
  for (const ext of required) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM pg_extension WHERE extname = $1`,
      [ext],
    );
    if (rowCount === 0) {
      throw new Error(
        `Required extension "${ext}" not installed in test DB. ` +
          `Use the T-22 ghcr.io/<repo>/ccip-postgres image, not stock postgres:16-alpine.`,
      );
    }
  }
  await client.end();
}
