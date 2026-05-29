-- W8/B-01: align periods.status CHECK with the canonical period state machine.
-- Source of truth: docs/architecture/period-engine.md §4 and the PeriodService code —
--   open -> gp_submitted -> verification -> closed | force_closed.
-- The 0001_initial constraint carried stale names (waiting_gp, verifying) that the
-- code/architecture never used, so the live period cycle failed with check violation 23514.
ALTER TABLE "periods" DROP CONSTRAINT IF EXISTS "periods_status_check";
ALTER TABLE "periods" ADD CONSTRAINT "periods_status_check"
  CHECK ("status" IN ('open', 'gp_submitted', 'verification', 'closed', 'force_closed'));
