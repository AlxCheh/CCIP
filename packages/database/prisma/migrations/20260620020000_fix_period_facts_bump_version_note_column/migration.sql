-- 0001_initial's P-23 rev-2 redefinition of fn_period_facts_bump_version()
-- references NEW.note / OLD.note, a column that has never existed on
-- period_facts (the real columns are gp_note and overrun_note). Because the
-- trigger fires BEFORE UPDATE ON period_facts with no column restriction,
-- this breaks every UPDATE to the table on a freshly-provisioned database
-- (42703: record "new" has no field "note") — masked locally only because
-- the long-running dev/test containers already carry a hand-patched,
-- never-committed version of this function using gp_note.
CREATE OR REPLACE FUNCTION fn_period_facts_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.sc_volume        IS DISTINCT FROM OLD.sc_volume)        OR
       (NEW.discrepancy_type  IS DISTINCT FROM OLD.discrepancy_type) OR
       (NEW.gp_note           IS DISTINCT FROM OLD.gp_note)
    THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;
