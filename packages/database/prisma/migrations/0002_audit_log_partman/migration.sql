-- ADR-010 — Audit Log: pg_partman + pg_cron operational setup
-- Depends on: 0001_initial (audit_log PARTITION BY RANGE (performed_at) + audit_log_default placeholder)
-- §10.5 T-22 — closes ADR-010 schema contract

BEGIN;

-- ─── 0. Pre-flight guard ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF current_setting('shared_preload_libraries', true) IS NULL
     OR position('pg_cron' IN current_setting('shared_preload_libraries')) = 0 THEN
    RAISE EXCEPTION 'pg_cron not in shared_preload_libraries'
    USING DETAIL = 'Postgres cluster was initialised without pg_cron preloaded.',
          HINT   = 'Local dev: `docker compose down -v && docker compose up -d postgres` to reinit. CI: rebuild ccip-postgres-test image.';
  END IF;
END $$;

-- ─── 1. Extensions ────────────────────────────────────────────────────────────
-- pg_partman requires its target schema to exist first; WITH SCHEMA does not
-- create it (PostgreSQL: "The named schema must already exist").
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 2. Reset placeholder default ─────────────────────────────────────────────
ALTER TABLE audit_log DETACH PARTITION audit_log_default;
DROP TABLE audit_log_default;

-- ─── 3. Register partman-managed parent (ADR-010: monthly, premake=3) ─────────
SELECT partman.create_parent(
    p_parent_table          := 'public.audit_log',
    p_control               := 'performed_at',
    p_interval              := '1 month',
    p_default_table         := true,
    p_automatic_maintenance := 'on',
    p_premake               := 3
);

-- ─── 4. Daily maintenance via pg_cron (ADR-010) ───────────────────────────────
SELECT cron.schedule_in_database(
    job_name := 'audit-log-partman-maintenance',
    schedule := '0 3 * * *',
    command  := 'CALL partman.run_maintenance_proc()',
    database := current_database()
);

COMMIT;
