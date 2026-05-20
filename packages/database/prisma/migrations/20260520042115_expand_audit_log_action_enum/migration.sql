-- Migration: expand_audit_log_action_enum
-- Purpose: Extend audit_log.action CHECK constraint with period-domain
--          events. The original 0001_initial constraint only covered CRUD
--          verbs ('insert','update','delete','admin_correction','force_close');
--          PeriodService emits semantic events ('period_opened',
--          'period_closed','gp_submitted','period_fact_upserted') which the
--          old constraint rejected. The mismatch was hidden by mocked
--          unit tests and only surfaced via the ADR-002 integration suite.
--
-- ROLLBACK PLAN:
--   ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
--   ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
--     CHECK (action IN ('insert','update','delete','admin_correction','force_close'));
--
-- NOTES:
--   * audit_log is RANGE-partitioned (ADR-010). ALTER TABLE on the parent
--     propagates to all attached partitions in PG ≥ 11 declarative
--     partitioning, so no per-partition fix is required.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    -- CRUD primitives (0001_initial baseline)
    'insert',
    'update',
    'delete',
    'admin_correction',
    'force_close',
    -- Period domain events (PeriodService)
    'period_opened',
    'period_closed',
    'gp_submitted',
    'period_fact_upserted'
  ));
