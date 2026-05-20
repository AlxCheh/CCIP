// apps/api/test/integration/setup/env.ts
// Default targets the postgres_test container (compose profile "test") on 5434.
// pg_cron is a per-database singleton bound at initdb to POSTGRES_DB, so the
// dev postgres on 5432 (POSTGRES_DB=ccip) cannot host ccip_test — a separate
// container with POSTGRES_DB=ccip_test is required. See docs/governance/db-setup.md.
// connection_limit=20 — ADR-002 invariant runs up to 10 parallel openPeriod
// transactions, each holding a connection through 5s advisory lock waits.
// Default pool (~9) is too small and triggers
// "Unable to start a transaction in the given time" instead of
// PERIOD_LOCK_TIMEOUT.
export const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://ccip_owner:ccip_dev_pass@localhost:5434/ccip_test?connection_limit=20';

export const TEST_JWT_SECRET =
  process.env.JWT_SECRET_TEST ?? 'test-jwt-secret-not-for-prod';

// 25 runs is enough for property soundness on concurrency-heavy invariants
// (each run does TRUNCATE + factories + N parallel ops, ~3s/run worst case).
// Override with FC_RUNS for deeper exploration locally.
export const FAST_CHECK_RUNS = Number(process.env.FC_RUNS ?? 25);

export const FAST_CHECK_SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
