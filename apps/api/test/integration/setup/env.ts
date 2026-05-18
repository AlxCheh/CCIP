// apps/api/test/integration/setup/env.ts
export const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip_test';

export const TEST_JWT_SECRET =
  process.env.JWT_SECRET_TEST ?? 'test-jwt-secret-not-for-prod';

export const FAST_CHECK_RUNS = Number(process.env.FC_RUNS ?? (process.env.CI ? 25 : 100));

export const FAST_CHECK_SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
