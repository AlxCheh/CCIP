-- M-11 W4: planned-pause marking for periods (E-04 — window_clean exclusion in WorkPace calc).
-- Hand-written (not via `prisma migrate dev`): shadow-DB validation fails because the
-- pg_cron extension used by an earlier migration (0002_audit_log_partman) can only be
-- created in the database configured via cron.database_name, not a throwaway shadow DB.
-- See docs/project-state.md B-02 for the established precedent (forecast_reason column).
ALTER TABLE "periods" ADD COLUMN "planned_pause" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "periods" ADD COLUMN "pause_reason" VARCHAR(100);
