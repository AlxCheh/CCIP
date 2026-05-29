-- W8/B-04: allow 'confirmed' in period_facts.discrepancy_status.
-- Per algorithm_v1_3.md §C3 (rows C-07/D-04) a verified fact with no delta gets
-- status «Подтверждено» (confirmed); PeriodService.upsertPeriodFact writes it.
-- The 0001_initial CHECK omitted 'confirmed' (DB lagged the M-05a code).
ALTER TABLE "period_facts" DROP CONSTRAINT IF EXISTS "period_facts_discrepancy_status_check";
ALTER TABLE "period_facts" ADD CONSTRAINT "period_facts_discrepancy_status_check"
  CHECK ("discrepancy_status" IN ('confirmed', 'open', 'sc_override', 'director_resolved', 'forced_sc_figure', 'cancelled'));
