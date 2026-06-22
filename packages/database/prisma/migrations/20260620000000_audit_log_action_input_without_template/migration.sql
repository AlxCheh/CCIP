-- Hand-written (not `prisma migrate dev`): pg_cron's shared_preload_libraries
-- binds to a single database, so the shadow-DB created by `migrate dev` can't
-- host pg_cron (migration 0002_audit_log_partman). See docs/governance/db-setup.md.
--
-- Re-declares audit_log_action_check with the full known set of action
-- literals in use across the codebase, plus the new
-- 'period_fact_input_without_template' value (C-03: SC enters data after the
-- GP submission deadline expired without a template). This branch was cut
-- from main before migration 20260619120000_widen_audit_log_action_check (a
-- sibling, not-yet-merged branch) — that migration's values are included
-- here explicitly so applying both in either merge order converges on the
-- same constraint, instead of one DROP+ADD silently narrowing the other's.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (
  action IN (
    'insert', 'update', 'delete', 'admin_correction', 'force_close',
    'period_opened', 'period_closed', 'gp_submitted', 'period_fact_upserted',
    'zero_report_item_corrected',
    'period_fact_input_without_template'
  )
);
