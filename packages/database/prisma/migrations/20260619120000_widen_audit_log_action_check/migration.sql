-- Hand-written (not `prisma migrate dev`): pg_cron's shared_preload_libraries
-- binds to a single database (cron.database_name), so the shadow-DB created by
-- `migrate dev` can't host the pg_cron extension required by audit_log's
-- partitioning (migration 0002_audit_log_partman). See docs/governance/db-setup.md.
--
-- Closes drift: the live dev/test DB's audit_log_action_check constraint had
-- already been widened out-of-band (manually, outside the migration system) to
-- allow 'period_opened', 'period_closed', 'gp_submitted', 'period_fact_upserted'
-- — none of which appear in any committed migration. This migration codifies
-- that already-deployed state as the source of truth and adds the one new
-- value needed for ZeroReportService's correction audit trail
-- (zero_report_item_corrected, B-06).
--
-- ALTER on the partitioned parent propagates to all existing partitions and is
-- inherited by future ones (PostgreSQL declarative partitioning semantics).
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (
  action IN (
    'insert', 'update', 'delete', 'admin_correction', 'force_close',
    'period_opened', 'period_closed', 'gp_submitted', 'period_fact_upserted',
    'zero_report_item_corrected'
  )
);
