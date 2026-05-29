-- W8/B-03: fix fn_period_facts_bump_version — it referenced NEW.note/OLD.note,
-- but period_facts has no 'note' column (only gp_note / overrun_note). The stale
-- reference raised "column \"new\" does not exist" on every fact update.
-- Bump version on the SC-driven fields that actually exist.
CREATE OR REPLACE FUNCTION public.fn_period_facts_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF (NEW.sc_volume       IS DISTINCT FROM OLD.sc_volume)       OR
       (NEW.discrepancy_type IS DISTINCT FROM OLD.discrepancy_type)
    THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$function$;
