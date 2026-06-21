-- Schema-drift reconciliation, found by diffing live pg_constraint defs on
-- the long-running local/test container against what the migration files
-- actually produce on a freshly-provisioned database. Each of the three
-- constraints below had been hand-patched directly on that live container
-- at some point, with the fix never captured in a migration — so every
-- fresh database (a new dev machine, CI, prod from scratch) still has the
-- broken, pre-patch definition.

-- periods.status: code (PeriodService) writes 'gp_submitted' / 'verification',
-- but 0001_initial's CHECK only allows 'waiting_gp' / 'verifying'.
ALTER TABLE periods DROP CONSTRAINT IF EXISTS periods_status_check;
ALTER TABLE periods ADD CONSTRAINT periods_status_check CHECK (
  status IN ('open', 'gp_submitted', 'verification', 'closed', 'force_closed')
);

-- period_facts.discrepancy_status: code writes 'confirmed' when GP and SC
-- volumes match (the no-discrepancy, happy-path case) — 0001_initial's
-- CHECK never included it at all.
ALTER TABLE period_facts DROP CONSTRAINT IF EXISTS period_facts_discrepancy_status_check;
ALTER TABLE period_facts ADD CONSTRAINT period_facts_discrepancy_status_check CHECK (
  discrepancy_status IN (
    'open', 'confirmed', 'sc_override', 'director_resolved',
    'forced_sc_figure', 'cancelled'
  )
);

-- audit_log.action: full known superset, including the sibling branches'
-- additions (zero_report_item_corrected, period_fact_input_without_template)
-- — DROP+ADD with the full set converges to the same constraint regardless
-- of which of this/those branches merges first.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (
  action IN (
    'insert', 'update', 'delete', 'admin_correction', 'force_close',
    'period_opened', 'period_closed', 'gp_submitted', 'period_fact_upserted',
    'zero_report_item_corrected',
    'period_fact_input_without_template'
  )
);
