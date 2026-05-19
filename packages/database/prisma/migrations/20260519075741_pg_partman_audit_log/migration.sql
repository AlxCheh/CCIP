-- Migration: pg_partman_audit_log
-- Purpose: Activate pg_partman + pg_cron extensions and configure monthly
--          RANGE partitioning for audit_log per ADR-010.
--
-- ROLLBACK PLAN:
--   SELECT cron.unschedule('partman-maint');
--   SELECT partman.undo_partition(p_parent_table := 'public.audit_log', p_keep_table := true, p_interval := 'monthly');
--   DROP EXTENSION IF EXISTS pg_partman CASCADE;
--   DROP EXTENSION IF EXISTS pg_cron CASCADE;
--   -- WARNING: undo_partition moves rows back to parent; verify audit_log_default before drop.
--
-- PRODUCTION NOTE:
--   If audit_log already contains rows before this migration runs, pass p_start_partition
--   to align with the earliest record's month, e.g.:
--     p_start_partition := '2026-01-01'
--   Without it, partman starts from the current month and rows in earlier months
--   remain in audit_log_default. On a fresh (empty) table this is not needed.

-- Step 1: Install extensions
-- pg_partman requires its own schema (standard convention: "partman").
-- The schema must exist before CREATE EXTENSION ... SCHEMA partman.
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

-- pg_cron installs into the "cron" schema by default; no schema override needed.
-- shared_preload_libraries='pg_cron' is already set in postgresql.conf (see Dockerfile line 12).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Configure monthly partitioning on audit_log
-- pg_partman 5.x signature change vs 4.x:
--   p_interval is now 3rd positional arg (was 4th in 4.x)
--   p_type    is now 4th positional arg (was 3rd in 4.x)
-- Using named parameters to be explicit and forward-compatible.
--
-- p_default_table=false: audit_log_default was already created by the initial
-- migration (0001_initial). Passing true would cause partman to try creating
-- a second DEFAULT partition, which would fail with a duplicate error.
SELECT partman.create_parent(
    p_parent_table  := 'public.audit_log',
    p_control       := 'performed_at',
    p_interval      := '1 month',   -- pg_partman 5.x: 'monthly' removed; use PG interval syntax
    p_type          := 'range',
    p_premake       := 3,
    p_default_table := false
);

-- Step 3: Schedule daily maintenance via pg_cron
-- Runs at 01:00 every night; creates upcoming partitions and enforces premake=3.
-- cron.schedule() operates in the context of cron.database_name ('ccip'),
-- which is already set in postgresql.conf by 00-cron-database.sh.
SELECT cron.schedule(
    'partman-maint',
    '0 1 * * *',
    $$CALL partman.run_maintenance_proc()$$
);
