-- ============================================================
-- CCIP — Intelligent Construction Management Platform
-- PostgreSQL 16 Schema  |  Concept v1.5  |  Algorithm v1.3
-- Fixes applied: P-01…P-32
--   P-01..P-18 — критические + важные + архитектурные
--   P-19       — version counter для офлайн-конфликтов          (ADR-003)
--   P-20       — mv_refresh_log + is_stale флаг                 (ADR-004)
--   P-21       — refresh_tokens: хранение для revocation        (ADR-009)
--   P-22       — boq_item_lineage_links: split/merge поддержка  (ADR-006)
--   P-23       — расширение триггера версии на все офлайн-поля  (ADR-003)
--   P-24       — защита sla_events от DELETE                    (ADR-005)
--   P-25       — REVOKE UPDATE/DELETE на period_facts/audit_log (ADR-007)
--   P-26       — organizations: корневая таблица тенанта        (ADR-012)
--   P-27       — organization_id в users и objects              (ADR-012)
--   P-28       — system_config per-tenant PK (organization_id, key) (ADR-012)
--   P-29       — audit_log.organization_id (денорм.)            (ADR-012)
--   P-30       — periods: поля PDF-отчёта                       (ADR-013)
--   P-31       — objects: поля сводного отчёта                  (ADR-013)
--   P-32       — device_tokens для FCM push                     (ADR-014)
-- ============================================================


-- ─────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────

-- Required for gen_random_uuid() used in boq_items.work_lineage_id
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─────────────────────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────────────────────

CREATE TABLE users (
    id         SERIAL      PRIMARY KEY,
    email      VARCHAR(255) UNIQUE NOT NULL,
    name       VARCHAR(255) NOT NULL,
    role       VARCHAR(50)  NOT NULL CHECK (role IN ('stroycontrol', 'director', 'admin')),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────
-- LEVEL 0 — System Configuration (admin-only parameters)
-- P-08: value split into value_numeric / value_text with type discriminator
-- ─────────────────────────────────────────────────────────

CREATE TABLE system_config (
    key           VARCHAR(100) PRIMARY KEY,
    value_type    VARCHAR(10)  NOT NULL DEFAULT 'numeric'
                      CHECK (value_type IN ('numeric', 'text', 'boolean')),
    value_numeric NUMERIC,
    value_text    TEXT,
    description   TEXT,
    updated_at    TIMESTAMPTZ,
    updated_by    INTEGER      REFERENCES users(id),

    -- Ensure only the correct value column is populated for each type
    CONSTRAINT chk_system_config_value CHECK (
        (value_type = 'numeric' AND value_numeric IS NOT NULL AND value_text IS NULL) OR
        (value_type = 'text'    AND value_text    IS NOT NULL AND value_numeric IS NULL) OR
        (value_type = 'boolean' AND value_numeric IN (0, 1)   AND value_text IS NULL)
    )
);

INSERT INTO system_config (key, value_type, value_numeric, description) VALUES
    ('N_flag_threshold',              'numeric', 3,    'Min Type-2 discrepancies to trigger systemic flag'),
    ('M_flag_window',                 'numeric', 5,    'Look-back window (periods) for systemic flag'),
    ('weight_threshold',              'numeric', 0.10, 'Min weight_coef requiring cross-verification'),
    ('forecast_gap_alert',            'numeric', 2,    'Gap in periods triggering gap flag on dashboard'),
    ('tolerance_threshold',           'numeric', 5,    'Overrun % — warning only'),
    ('overrun_warning_limit',         'numeric', 20,   'Overrun % — hard block threshold'),
    ('avg_pace_periods',              'numeric', 5,    'WMA window size for pace calculation'),
    ('decay_factor',                  'numeric', 0.9,  'Exponential decay factor for WMA'),
    ('spike_threshold',               'numeric', 2.0,  'Multiplier vs WMA to classify as spike'),
    ('zero_report_alert_days',        'numeric', 5,    'Days after connection_date before 0-report alert fires'),
    ('baseline_correction_threshold', 'numeric', 5,    'Correction % requiring Director approval vs Admin-only');


-- ─────────────────────────────────────────────────────────
-- LEVEL 1 — Object Passport (immutable after creation)
-- ─────────────────────────────────────────────────────────

CREATE TABLE objects (
    id                 SERIAL      PRIMARY KEY,
    name               VARCHAR(500) NOT NULL,
    object_class       VARCHAR(100),
    address            TEXT,
    permit_number      VARCHAR(100),
    permit_date        DATE,
    construction_start DATE,
    -- Triggers the zero_report_alert_days countdown
    connection_date    DATE,
    status             VARCHAR(50)  NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'completed', 'suspended')),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by         INTEGER      REFERENCES users(id) ON DELETE RESTRICT
);

-- GP and other participants — SCD Type 2 (history of GP changes)
-- P-01: uniqueness enforced via partial index below (replaces EXCLUDE USING gist)
-- P-12: ON DELETE RESTRICT on object_id
CREATE TABLE object_participants (
    id               SERIAL      PRIMARY KEY,
    object_id        INTEGER     NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
    participant_role VARCHAR(50) NOT NULL CHECK (participant_role IN (
                         'general_contractor', 'developer', 'designer', 'stroycontrol_org')),
    org_name         VARCHAR(500) NOT NULL,
    contact_person   VARCHAR(255),
    contact_email    VARCHAR(255),
    valid_from       DATE        NOT NULL,
    valid_to         DATE,         -- NULL = currently active
    is_current       BOOLEAN     NOT NULL DEFAULT TRUE,
    changed_reason   TEXT,
    changed_at       TIMESTAMPTZ,
    changed_by       INTEGER     REFERENCES users(id)
);

-- P-01: only one current participant per role per object
CREATE UNIQUE INDEX uq_object_participants_current
    ON object_participants (object_id, participant_role)
    WHERE is_current = TRUE;


-- ─────────────────────────────────────────────────────────
-- LEVEL 2 — Project Documentation (versioned)
-- ─────────────────────────────────────────────────────────

-- File references for SSR, RDC, calendar plan
CREATE TABLE l2_documents (
    id          SERIAL      PRIMARY KEY,
    object_id   INTEGER     NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
    doc_type    VARCHAR(50) NOT NULL CHECK (doc_type IN ('ssr', 'rdc', 'calendar_plan', 'other')),
    version     VARCHAR(20) NOT NULL,
    file_path   TEXT        NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by INTEGER     REFERENCES users(id)
);

-- BoQ version envelope
-- P-05: uniqueness of active version enforced via partial index below
-- P-12: ON DELETE RESTRICT on object_id
CREATE TABLE boq_versions (
    id             SERIAL      PRIMARY KEY,
    object_id      INTEGER     NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
    version_number VARCHAR(20) NOT NULL,   -- '1.0', '1.1', ...
    change_type    VARCHAR(50) NOT NULL DEFAULT 'initial'
                       CHECK (change_type IN ('initial', 'volume', 'cost', 'structural')),
    change_reason  TEXT,
    change_document TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     INTEGER     REFERENCES users(id),
    approved_at    TIMESTAMPTZ,
    approved_by    INTEGER     REFERENCES users(id),
    is_active      BOOLEAN     NOT NULL DEFAULT FALSE,

    UNIQUE (object_id, version_number)
);

-- P-05: only one active BoQ version per object at a time
CREATE UNIQUE INDEX uq_boq_versions_active
    ON boq_versions (object_id)
    WHERE is_active = TRUE;

-- BoQ line items (≤50 per version enforced at application layer)
-- P-15: work_lineage_id — stable UUID across BoQ version bumps, enables cross-version queries
-- P-12: ON DELETE RESTRICT on boq_version_id
CREATE TABLE boq_items (
    id                  SERIAL      PRIMARY KEY,
    boq_version_id      INTEGER     NOT NULL REFERENCES boq_versions(id) ON DELETE RESTRICT,
    -- Stable identifier for this work across all BoQ versions
    -- Inherited from predecessor_item; set to gen_random_uuid() only for v1.0 items
    work_lineage_id     UUID        NOT NULL DEFAULT gen_random_uuid(),
    work_code           VARCHAR(100) NOT NULL,
    name                TEXT        NOT NULL,
    unit                VARCHAR(50),
    plan_volume         NUMERIC     NOT NULL CHECK (plan_volume > 0),
    contract_value      NUMERIC     NOT NULL CHECK (contract_value >= 0),
    -- Auto-computed by fn_recalc_weight_coef trigger; do not set manually
    weight_coef         NUMERIC     CHECK (weight_coef > 0 AND weight_coef <= 1),
    is_critical         BOOLEAN     NOT NULL DEFAULT FALSE,
    -- 'excluded_from_scope' used instead of deletion when fact > 0 (structural change)
    status              VARCHAR(50) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'excluded_from_scope')),
    predecessor_item_id INTEGER     REFERENCES boq_items(id),

    UNIQUE (boq_version_id, work_code)
);

-- P-15: enables efficient cross-version fact aggregation without recursive CTE
CREATE INDEX idx_boq_items_lineage ON boq_items (work_lineage_id);

-- P-06: auto-recompute weight_coef for all active items in a version when
-- contract_value or status changes. No recursion: UPDATE only touches weight_coef,
-- which is not in the OF column list.
CREATE OR REPLACE FUNCTION fn_recalc_weight_coef()
RETURNS TRIGGER AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT SUM(contract_value) INTO v_total
    FROM boq_items
    WHERE boq_version_id = COALESCE(NEW.boq_version_id, OLD.boq_version_id)
      AND status = 'active';

    IF v_total IS NULL OR v_total = 0 THEN
        RETURN NEW;
    END IF;

    UPDATE boq_items
    SET weight_coef = contract_value / v_total
    WHERE boq_version_id = COALESCE(NEW.boq_version_id, OLD.boq_version_id)
      AND status = 'active';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_boq_items_weight_coef
    AFTER INSERT OR UPDATE OF contract_value, status ON boq_items
    FOR EACH ROW EXECUTE FUNCTION fn_recalc_weight_coef();


-- ─────────────────────────────────────────────────────────
-- LEVEL 3 — Current Status
-- ─────────────────────────────────────────────────────────

-- 0-Report (baseline; hard-blocks first period if not approved)
-- P-02: only one *approved* zero report per object (allows re-submission after rejection)
-- P-12: ON DELETE RESTRICT on object_id
CREATE TABLE zero_reports (
    id             SERIAL      PRIMARY KEY,
    object_id      INTEGER     NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
    boq_version_id INTEGER     NOT NULL REFERENCES boq_versions(id),
    status         VARCHAR(50) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
    submitted_at   TIMESTAMPTZ,
    submitted_by   INTEGER     REFERENCES users(id),
    approved_at    TIMESTAMPTZ,
    approved_by    INTEGER     REFERENCES users(id),
    alert_sent_at  TIMESTAMPTZ,
    notes          TEXT
);

-- P-02: partial unique — only one approved zero report per object
CREATE UNIQUE INDEX uq_zero_reports_approved
    ON zero_reports (object_id)
    WHERE status = 'approved';

-- Baseline entry per BoQ item (source hierarchy: field_measurement > exec_docs > ks2)
CREATE TABLE zero_report_items (
    id             SERIAL      PRIMARY KEY,
    zero_report_id INTEGER     NOT NULL REFERENCES zero_reports(id) ON DELETE RESTRICT,
    boq_item_id    INTEGER     NOT NULL REFERENCES boq_items(id),
    fact_volume    NUMERIC     NOT NULL CHECK (fact_volume >= 0),
    source         VARCHAR(50) NOT NULL CHECK (source IN ('field_measurement', 'exec_docs', 'ks2')),
    -- Cross-verification docs (mandatory when weight_coef ≥ 0.10 or is_critical)
    doc1_value     NUMERIC,
    doc2_value     NUMERIC,
    doc3_value     NUMERIC,
    cross_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    notes          TEXT,

    UNIQUE (zero_report_id, boq_item_id)
);

-- Period header
-- P-13: GP submission token for one-time external form access
-- P-16: period_number assigned by application using pg_advisory_lock(object_id)
--       to prevent race conditions under concurrent requests (UNIQUE catches dupes as fallback)
-- P-12: ON DELETE RESTRICT on object_id
CREATE TABLE periods (
    id                   SERIAL      PRIMARY KEY,
    object_id            INTEGER     NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
    period_number        INTEGER     NOT NULL CHECK (period_number > 0),
    boq_version_id       INTEGER     NOT NULL REFERENCES boq_versions(id),
    status               VARCHAR(50) NOT NULL DEFAULT 'open'
                             CHECK (status IN (
                                 'open',         -- SC opened, template not yet sent
                                 'waiting_gp',   -- template sent, awaiting GP
                                 'verifying',    -- GP submitted, SC doing site visit
                                 'closed',       -- normal close
                                 'force_closed'  -- SLA Scenario A: GP silence day 5
                             )),
    -- SLA timestamps
    opened_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_by            INTEGER     REFERENCES users(id),
    gp_template_sent_at  TIMESTAMPTZ,
    -- P-13: token sent to GP with template link; expires after SLA deadline
    gp_submission_token  UUID        UNIQUE,
    gp_token_expires_at  TIMESTAMPTZ,
    gp_submitted_at      TIMESTAMPTZ,
    gp_submitted_by_name VARCHAR(255),  -- GP name (external, not in users)
    site_visit_at        TIMESTAMPTZ,
    site_visit_by        INTEGER     REFERENCES users(id),
    closed_at            TIMESTAMPTZ,
    closed_by            INTEGER     REFERENCES users(id),
    -- Planned pause: type А zero period — excluded from pace calculation
    is_zero_period       BOOLEAN     NOT NULL DEFAULT FALSE,
    zero_period_reason   VARCHAR(100)
                             CHECK (zero_period_reason IN (
                                 'weather', 'design_change', 'permit_suspension',
                                 'financing_pause', 'force_majeure', 'seasonal'
                             )),

    UNIQUE (object_id, period_number)
);

-- Fact entry per work item per period
-- P-12: ON DELETE RESTRICT on period_id
CREATE TABLE period_facts (
    id                SERIAL     PRIMARY KEY,
    period_id         INTEGER    NOT NULL REFERENCES periods(id) ON DELETE RESTRICT,
    boq_item_id       INTEGER    NOT NULL REFERENCES boq_items(id),
    -- GP submission (incremental volume for this period)
    gp_volume         NUMERIC    CHECK (gp_volume >= 0),
    gp_note           TEXT,
    -- SC verified entry (incremental volume)
    sc_volume         NUMERIC    CHECK (sc_volume >= 0),
    -- Final accepted value: sc_volume for Type 1, gp_volume for Type 2
    accepted_volume   NUMERIC    CHECK (accepted_volume >= 0),
    -- NULL = no discrepancy; denormalized cache (source of truth: discrepancies table)
    discrepancy_type  SMALLINT   CHECK (discrepancy_type IN (1, 2)),
    discrepancy_status VARCHAR(50) CHECK (discrepancy_status IN (
                           'open', 'sc_override', 'director_resolved',
                           'forced_sc_figure', 'cancelled'
                       )),
    -- Overrun: cumulative_fact vs plan_volume at period close
    overrun_pct       NUMERIC,
    overrun_note      TEXT,      -- mandatory when 5% < overrun_pct ≤ 20%
    -- Spike detection
    is_spike          BOOLEAN    NOT NULL DEFAULT FALSE,
    spike_response    VARCHAR(50) CHECK (spike_response IN (
                          'planned_concentration', 'input_error', 'no_reaction'
                      )),
    -- input_error: SC corrects accepted_volume
    -- no_reaction: weight_coef treated as 0.5 in forecast until resolved

    UNIQUE (period_id, boq_item_id)
);

-- P-03: ensure period_facts.boq_item_id belongs to the period's boq_version_id
CREATE OR REPLACE FUNCTION fn_check_period_fact_version()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM boq_items bi
        JOIN periods p ON p.boq_version_id = bi.boq_version_id
        WHERE bi.id = NEW.boq_item_id
          AND p.id  = NEW.period_id
    ) THEN
        RAISE EXCEPTION
            'boq_item % does not belong to the boq_version of period %',
            NEW.boq_item_id, NEW.period_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_period_facts_version_check
    BEFORE INSERT OR UPDATE ON period_facts
    FOR EACH ROW EXECUTE FUNCTION fn_check_period_fact_version();

-- P-11: discrepancies as a first-class entity with full workflow history
-- period_facts.discrepancy_type is a denormalized cache for fast filtering
CREATE TABLE discrepancies (
    id               SERIAL      PRIMARY KEY,
    period_fact_id   INTEGER     NOT NULL REFERENCES period_facts(id) ON DELETE RESTRICT,
    type             SMALLINT    NOT NULL CHECK (type IN (1, 2)),
    status           VARCHAR(50) NOT NULL DEFAULT 'open'
                         CHECK (status IN (
                             'open', 'sc_override', 'director_resolved',
                             'forced_sc_figure', 'cancelled'
                         )),
    gp_position      TEXT,
    sc_position      TEXT,
    director_decision TEXT,
    resolved_at      TIMESTAMPTZ,
    resolved_by      INTEGER     REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Photos taken during SC site visit
CREATE TABLE photos (
    id          SERIAL      PRIMARY KEY,
    period_id   INTEGER     NOT NULL REFERENCES periods(id),
    boq_item_id INTEGER     REFERENCES boq_items(id),  -- NULL = general site photo
    file_path   TEXT        NOT NULL,
    taken_at    TIMESTAMPTZ,
    uploaded_by INTEGER     REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────
-- SLA DEADLOCK TRACKING
-- ─────────────────────────────────────────────────────────

CREATE TABLE sla_events (
    id           SERIAL      PRIMARY KEY,
    period_id    INTEGER     NOT NULL REFERENCES periods(id),
    boq_item_id  INTEGER     REFERENCES boq_items(id),  -- NULL = period-level event
    scenario     CHAR(1)     NOT NULL CHECK (scenario IN ('A', 'B')),
    event_type   VARCHAR(60) NOT NULL CHECK (event_type IN (
                     'notify_director_day3',   -- Scenario A: GP silence
                     'force_close_day5',       -- Scenario A: auto-close
                     'director_deadline_day7', -- Scenario B: Director must decide
                     'sc_figure_applied_day14' -- Scenario B: SC figure applied
                 )),
    scheduled_at TIMESTAMPTZ NOT NULL,
    executed_at  TIMESTAMPTZ,
    is_cancelled BOOLEAN     NOT NULL DEFAULT FALSE
);

-- P-09: notification delivery tracking (SLA alerts, gap flags, systemic flags)
CREATE TABLE notifications (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         INTEGER     NOT NULL REFERENCES users(id),
    type            VARCHAR(80) NOT NULL,
    reference_table VARCHAR(100),
    reference_id    BIGINT,      -- FK-agnostic: points to sla_events, periods, objects, etc.
    message         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ
);

CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;


-- ─────────────────────────────────────────────────────────
-- ANALYTICS — Readiness Snapshots & Pace
-- ─────────────────────────────────────────────────────────

-- Snapshot at each period close; Director dashboard reads from here, never recomputes
-- Formula: object_readiness = Σ(MIN(work_pct, 100%) × weight_coef)
-- P-07: object_id kept for dashboard JOIN avoidance; consistency enforced by trigger below
CREATE TABLE readiness_snapshots (
    id                          SERIAL      PRIMARY KEY,
    period_id                   INTEGER     NOT NULL REFERENCES periods(id) UNIQUE,
    object_id                   INTEGER     NOT NULL REFERENCES objects(id),
    object_readiness_pct        NUMERIC     NOT NULL,
    weighted_forecast_date      DATE,
    critical_path_forecast_date DATE,
    gap_flag                    BOOLEAN     NOT NULL DEFAULT FALSE,
    calculated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P-07: ensure readiness_snapshots.object_id is consistent with periods.object_id
CREATE OR REPLACE FUNCTION fn_check_readiness_object_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.object_id != (SELECT object_id FROM periods WHERE id = NEW.period_id) THEN
        RAISE EXCEPTION
            'readiness_snapshots.object_id % does not match periods.object_id for period %',
            NEW.object_id, NEW.period_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_readiness_snapshots_object_check
    BEFORE INSERT OR UPDATE ON readiness_snapshots
    FOR EACH ROW EXECUTE FUNCTION fn_check_readiness_object_id();

-- WMA pace per work item per period
-- weighted_pace = decay * prev_pace + (1 - decay) * (period_volume / plan_volume)
-- P-10: is_excluded flags zero periods so pace queries can filter them out
CREATE TABLE work_pace (
    id              SERIAL   PRIMARY KEY,
    period_id       INTEGER  NOT NULL REFERENCES periods(id),
    boq_item_id     INTEGER  NOT NULL REFERENCES boq_items(id),
    period_volume   NUMERIC  NOT NULL,
    weighted_pace   NUMERIC  NOT NULL,
    -- TRUE when parent period is a planned pause (is_zero_period = TRUE)
    is_excluded     BOOLEAN  NOT NULL DEFAULT FALSE,

    UNIQUE (period_id, boq_item_id)
);


-- ─────────────────────────────────────────────────────────
-- BASELINE UPDATE (UpdateBaseline procedure)
-- Initiated by SC, approved by Admin; blocked when a period is open
-- ─────────────────────────────────────────────────────────

CREATE TABLE baseline_update_requests (
    id                     SERIAL      PRIMARY KEY,
    object_id              INTEGER     NOT NULL REFERENCES objects(id),
    boq_item_id            INTEGER     NOT NULL REFERENCES boq_items(id),
    requested_by           INTEGER     REFERENCES users(id),
    requested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    old_plan_volume        NUMERIC     NOT NULL,
    new_plan_volume        NUMERIC     NOT NULL,
    reason                 TEXT        NOT NULL,
    supporting_document    TEXT,
    status                 VARCHAR(50) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by            INTEGER     REFERENCES users(id),
    reviewed_at            TIMESTAMPTZ,
    review_notes           TEXT,
    -- Set at approval time; new plan_volume applies from the next period after this one
    applies_from_period_id INTEGER     REFERENCES periods(id)
);


-- ─────────────────────────────────────────────────────────
-- P-18: AI / ML READINESS
-- ─────────────────────────────────────────────────────────

-- What-if scenario modeling for Director dashboard
CREATE TABLE forecast_scenarios (
    id              SERIAL       PRIMARY KEY,
    object_id       INTEGER      NOT NULL REFERENCES objects(id),
    scenario_name   VARCHAR(100) NOT NULL,
    -- Override params: decay_factor, avg_pace_periods, assumed_pace_per_item, etc.
    parameters      JSONB        NOT NULL,
    completion_date DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      INTEGER      REFERENCES users(id)
);

-- Feature vectors for predictive models (delay risk, pace forecast, anomaly detection)
CREATE TABLE ml_features (
    id            BIGSERIAL   PRIMARY KEY,
    object_id     INTEGER     NOT NULL REFERENCES objects(id),
    period_id     INTEGER     NOT NULL REFERENCES periods(id),
    -- Feature vector: WMA history, overrun flags, weather, dispute counts, etc.
    feature_set   JSONB       NOT NULL,
    -- Actual outcome (populated after period closes; used for model training)
    label         NUMERIC,
    model_version VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (object_id, period_id, model_version)
);


-- ─────────────────────────────────────────────────────────
-- AUDIT LOG
-- P-04: record_id BIGINT (was INTEGER — sync_queue.id is BIGSERIAL)
-- P-17: PARTITION BY RANGE (performed_at); monthly partitions created by DBA/pg_partman
--       PK is (id, performed_at) — PostgreSQL 16 requires partition key in PK
-- ─────────────────────────────────────────────────────────

CREATE SEQUENCE audit_log_id_seq;

CREATE TABLE audit_log (
    id           BIGINT       NOT NULL DEFAULT nextval('audit_log_id_seq'),
    table_name   VARCHAR(100) NOT NULL,
    record_id    BIGINT       NOT NULL,
    action       VARCHAR(50)  NOT NULL CHECK (action IN (
                     'insert', 'update', 'delete', 'admin_correction', 'force_close'
                 )),
    old_data     JSONB,
    new_data     JSONB,
    performed_by INTEGER      REFERENCES users(id),
    performed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reason       TEXT,

    PRIMARY KEY (id, performed_at)
) PARTITION BY RANGE (performed_at);

-- Default partition catches any rows that fall outside explicit monthly partitions
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

-- Example monthly partition (DBA or pg_partman creates these automatically):
-- CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
--     FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');


-- ─────────────────────────────────────────────────────────
-- OFFLINE SYNC QUEUE
-- P-17 note: sync_queue is a consumed queue; records are short-lived.
--            Archive 'applied'/'rejected' rows older than 30 days via a scheduled job
--            rather than declarative partitioning.
-- ─────────────────────────────────────────────────────────

CREATE TABLE sync_queue (
    id                 BIGSERIAL   PRIMARY KEY,
    device_id          VARCHAR(255) NOT NULL,
    user_id            INTEGER      REFERENCES users(id),
    operation          VARCHAR(80)  NOT NULL CHECK (operation IN (
                           'submit_fact', 'upload_photo', 'submit_gp_template',
                           'add_discrepancy_note', 'open_period', 'close_period'
                       )),
    payload            JSONB        NOT NULL,
    client_timestamp   TIMESTAMPTZ  NOT NULL,
    server_received_at TIMESTAMPTZ,
    status             VARCHAR(50)  NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'applied', 'conflict', 'rejected')),
    -- Populated when status = 'conflict': server state shown to user for manual resolution
    conflict_data      JSONB,
    resolved_at        TIMESTAMPTZ,
    resolved_by        INTEGER      REFERENCES users(id)
);


-- ─────────────────────────────────────────────────────────
-- INDEXES (performance — critical query paths)
-- NOTE: uq_object_participants_current, uq_zero_reports_approved,
--       uq_boq_versions_active already created inline with their tables above.
-- ─────────────────────────────────────────────────────────

-- Period lookups by object
CREATE INDEX idx_periods_object_id       ON periods (object_id, period_number DESC);
CREATE INDEX idx_periods_status          ON periods (status) WHERE status != 'closed';

-- Fact lookups
CREATE INDEX idx_period_facts_period_id  ON period_facts (period_id);
CREATE INDEX idx_period_facts_item_id    ON period_facts (boq_item_id);

-- Type-2 discrepancy monitoring (systemic flag: ≥N in last M periods)
CREATE INDEX idx_period_facts_disputed   ON period_facts (boq_item_id, discrepancy_type)
    WHERE discrepancy_type = 2;

-- SLA scheduler — recovery scan на onModuleInit + BullMQ delayed jobs (ADR-005).
-- Индекс используется при recovery scan: WHERE executed_at IS NULL AND scheduled_at > NOW().
CREATE INDEX idx_sla_events_scheduled   ON sla_events (scheduled_at)
    WHERE executed_at IS NULL AND is_cancelled = FALSE;

-- WMA pace — last N periods per item
CREATE INDEX idx_work_pace_item_period  ON work_pace (boq_item_id, period_id DESC)
    WHERE is_excluded = FALSE;

-- Cross-version fact aggregation (P-15) — idx_boq_items_lineage already created inline above

-- Audit trail lookup by record
CREATE INDEX idx_audit_log_record       ON audit_log (table_name, record_id, performed_at DESC);

-- Sync queue pending items (device poll on reconnect)
CREATE INDEX idx_sync_queue_pending     ON sync_queue (device_id, status)
    WHERE status = 'pending';

-- Readiness dashboard (latest snapshot per object)
CREATE INDEX idx_readiness_object       ON readiness_snapshots (object_id, period_id DESC);


-- ─────────────────────────────────────────────────────────
-- P-14: MATERIALIZED VIEW — Director Dashboard
-- Refreshed CONCURRENTLY after each period close (no read lock)
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW mv_object_current_status AS
SELECT
    o.id                         AS object_id,
    o.name,
    o.status                     AS object_status,
    p.id                         AS current_period_id,
    p.period_number,
    p.status                     AS period_status,
    rs.object_readiness_pct,
    rs.weighted_forecast_date,
    rs.critical_path_forecast_date,
    rs.gap_flag,
    COUNT(pf.id) FILTER (WHERE pf.discrepancy_type = 2
                           AND pf.discrepancy_status = 'open')  AS open_disputes,
    COUNT(pf.id) FILTER (WHERE pf.is_spike = TRUE
                           AND pf.spike_response IS NULL)       AS unresolved_spikes
FROM objects o
JOIN periods p ON p.object_id = o.id
    AND p.period_number = (
        SELECT MAX(period_number) FROM periods WHERE object_id = o.id
    )
LEFT JOIN readiness_snapshots rs ON rs.period_id = p.id
LEFT JOIN period_facts pf        ON pf.period_id = p.id
GROUP BY
    o.id, o.name, o.status,
    p.id, p.period_number, p.status,
    rs.object_readiness_pct, rs.weighted_forecast_date,
    rs.critical_path_forecast_date, rs.gap_flag;

CREATE UNIQUE INDEX ON mv_object_current_status (object_id);

-- Refresh command (call from application after period close):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status;


-- ─────────────────────────────────────────────────────────
-- P-19: VERSION COUNTER ДЛЯ ОФЛАЙН-КОНФЛИКТОВ              (ADR-003)
-- Заменяет client_timestamp как основание детекции конфликтов.
-- Часы мобильного устройства ненадёжны (clock skew) — версия инкрементируется
-- триггером на сервере при каждом UPDATE sc_volume.
-- ─────────────────────────────────────────────────────────

ALTER TABLE period_facts
    ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Триггер инкрементирует version при каждом UPDATE sc_volume.
-- INSERT не затрагивается — новая запись всегда стартует с version = 1.
CREATE OR REPLACE FUNCTION fn_period_facts_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.sc_volume IS DISTINCT FROM OLD.sc_volume THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_facts_bump_version
    BEFORE UPDATE OF sc_volume ON period_facts
    FOR EACH ROW EXECUTE FUNCTION fn_period_facts_bump_version();

-- last_known_version — версия period_facts.version, известная устройству на момент
-- offline-операции. При sync сервер сравнивает её с текущей: несовпадение → конфликт.
-- client_timestamp сохраняется для аудита и UI, но НЕ для детекции конфликтов.
ALTER TABLE sync_queue
    ADD COLUMN last_known_version INTEGER;


-- ─────────────────────────────────────────────────────────
-- P-20: MV REFRESH LOG + STALENESS FLAG                    (ADR-004)
-- refreshed_at невозможно разместить в самом MV: REFRESH заменяет все строки.
-- Отдельная таблица хранит метаданные последнего refresh + is_stale флаг,
-- выставляемый немедленно при exhausted retries (не ждёт threshold).
-- ─────────────────────────────────────────────────────────

CREATE TABLE mv_refresh_log (
    view_name     VARCHAR(100) PRIMARY KEY,
    refreshed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    period_id     INTEGER      REFERENCES periods(id),
    is_stale      BOOLEAN      NOT NULL DEFAULT FALSE
);

-- Начальная запись для дашборда директора.
-- При первом успешном REFRESH сервис обновит refreshed_at и снимет is_stale.
INSERT INTO mv_refresh_log (view_name, refreshed_at, is_stale)
VALUES ('mv_object_current_status', NOW(), FALSE);


-- ─────────────────────────────────────────────────────────
-- P-21: REFRESH TOKENS — хранение для revocation и logout  (ADR-009)
-- JWT Refresh Tokens хранятся хэшированными (SHA-256).
-- Logout = UPDATE revoked_at. Race condition fix: grace period 5s.
-- ─────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,   -- SHA-256 hex от токена
    issued_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,                    -- NULL = активен
    user_agent  TEXT,                           -- для отображения активных сессий
    ip_address  INET
);

-- Быстрый lookup активных токенов по пользователю (для logout all devices)
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id)
    WHERE revoked_at IS NULL;

-- Автоочистка истёкших токенов: pg_cron или приложение удаляет WHERE expires_at < NOW()
-- Не партиционируется: объём невелик (1 токен per сессия per пользователь).


-- ─────────────────────────────────────────────────────────
-- P-22: BOQ ITEM LINEAGE LINKS — split/merge поддержка     (ADR-006)
-- Расширяет scalar work_lineage_id для случаев split и merge позиций BoQ.
-- При простом rename: boq_item_lineage_links пуста (backward compatible).
-- При split: второстепенные наследники регистрируются с весом.
-- При merge: объединённая позиция регистрирует дополнительные lineage_id.
-- ─────────────────────────────────────────────────────────

CREATE TABLE boq_item_lineage_links (
    source_item_id  INTEGER       NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    lineage_id      UUID          NOT NULL,
    weight          DECIMAL(6,5)  NOT NULL DEFAULT 1.0
                        CHECK (weight > 0 AND weight <= 1),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_item_id, lineage_id)
);

-- Быстрый lookup: все позиции, участвующие в lineage_id (для getCumulativeFact)
CREATE INDEX idx_lineage_links_lineage ON boq_item_lineage_links (lineage_id);


-- ─────────────────────────────────────────────────────────
-- P-23: РАСШИРЕНИЕ ТРИГГЕРА ВЕРСИИ НА ВСЕ ОФЛАЙН-ПОЛЯ     (ADR-003 rev 2)
-- P-19 инкрементировал version только при UPDATE sc_volume.
-- SC может редактировать офлайн также discrepancy_type и note —
-- конфликты по этим полям не детектировались. Исправлено.
-- ─────────────────────────────────────────────────────────

-- Пересоздаём функцию с расширенным условием
CREATE OR REPLACE FUNCTION fn_period_facts_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.sc_volume        IS DISTINCT FROM OLD.sc_volume)        OR
       (NEW.discrepancy_type  IS DISTINCT FROM OLD.discrepancy_type) OR
       (NEW.note              IS DISTINCT FROM OLD.note)
    THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

-- Пересоздаём триггер: снимаем ограничение OF sc_volume → реагирует на любой UPDATE
DROP TRIGGER IF EXISTS trg_period_facts_bump_version ON period_facts;

CREATE TRIGGER trg_period_facts_bump_version
    BEFORE UPDATE ON period_facts
    FOR EACH ROW EXECUTE FUNCTION fn_period_facts_bump_version();

-- Добавляем поле boq_version_number в sync_queue для BoQ version gating (ADR-008)
ALTER TABLE sync_queue
    ADD COLUMN IF NOT EXISTS boq_version_number VARCHAR(20);

-- Добавляем поле is_syncing для reconciliation при рестарте приложения (ADR-008)
ALTER TABLE sync_queue
    ADD COLUMN IF NOT EXISTS is_syncing BOOLEAN NOT NULL DEFAULT FALSE;


-- ─────────────────────────────────────────────────────────
-- P-24: ЗАЩИТА SLA_EVENTS ОТ DELETE                        (ADR-005)
-- sla_events — источник истины для recovery scan.
-- Случайный DELETE = потеря SLA-истории и orphaned events.
-- Для "отмены" события используется UPDATE executed_at = NOW().
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_sla_events_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'sla_events: DELETE запрещён. Для отмены события используйте UPDATE executed_at = NOW().';
END;
$$;

CREATE TRIGGER trg_sla_events_no_delete
    BEFORE DELETE ON sla_events
    FOR EACH ROW EXECUTE FUNCTION fn_sla_events_no_delete();


-- ─────────────────────────────────────────────────────────
-- P-25: REVOKE UPDATE/DELETE — DB-уровень защиты           (ADR-007)
-- App-level assertPeriodEditable() защищает period_facts от изменений.
-- Прямой psql / новый сервис может обойти app-проверку.
-- Второй слой: REVOKE прав у роли приложения ccip_app.
-- Изменение period_facts — только через SECURITY DEFINER fn_admin_correct_fact().
-- Изменение audit_log   — запрещено полностью (append-only).
-- ─────────────────────────────────────────────────────────

-- Создаём роль приложения если не существует
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ccip_app') THEN
        CREATE ROLE ccip_app LOGIN;
    END IF;
END;
$$;

-- Стандартные права для ccip_app
GRANT SELECT, INSERT        ON period_facts  TO ccip_app;
GRANT SELECT, INSERT        ON audit_log     TO ccip_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ccip_app;
-- Отзываем UPDATE/DELETE именно с period_facts и audit_log
REVOKE UPDATE, DELETE ON period_facts FROM ccip_app;
REVOKE UPDATE, DELETE ON audit_log    FROM ccip_app;

-- SECURITY DEFINER функция для admin-correction (единственный легальный путь UPDATE period_facts)
-- Вызывается из adminCorrectFact транзакции (ADR-007). Выполняется с правами владельца схемы.
CREATE OR REPLACE FUNCTION fn_admin_correct_fact(
    p_fact_id      INTEGER,
    p_sc_volume    NUMERIC,
    p_accepted     NUMERIC,
    p_admin_id     INTEGER,
    p_reason       TEXT
) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE period_facts
    SET sc_volume = p_sc_volume, accepted_volume = p_accepted
    WHERE id = p_fact_id;

    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, reason, performed_by)
    SELECT
        'period_facts',
        p_fact_id,
        'admin_correction',
        jsonb_build_object('sc_volume', sc_volume, 'accepted_volume', accepted_volume),
        jsonb_build_object('sc_volume', p_sc_volume, 'accepted_volume', p_accepted),
        p_reason,
        p_admin_id
    FROM period_facts WHERE id = p_fact_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_admin_correct_fact TO ccip_app;


-- ─────────────────────────────────────────────────────────
-- P-26: ORGANIZATIONS — корневая таблица тенанта           (ADR-012)
-- Все tenant-owned ресурсы ссылаются на organizations.id.
-- ─────────────────────────────────────────────────────────

CREATE TABLE organizations (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    slug       TEXT        UNIQUE NOT NULL,
    plan       TEXT        NOT NULL DEFAULT 'starter',
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dev seed: детерминированный UUID для локальной разработки и начальных миграций
INSERT INTO organizations (id, name, slug, plan, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'starter', TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO ccip_app;


-- ─────────────────────────────────────────────────────────
-- P-27: organization_id В USERS И OBJECTS                  (ADR-012)
-- ─────────────────────────────────────────────────────────

ALTER TABLE users
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE users
    SET organization_id = '00000000-0000-0000-0000-000000000001'
    WHERE organization_id IS NULL;

ALTER TABLE users
    ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE objects
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE objects
    SET organization_id = '00000000-0000-0000-0000-000000000001'
    WHERE organization_id IS NULL;

ALTER TABLE objects
    ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_users_org   ON users   (organization_id);
CREATE INDEX idx_objects_org ON objects (organization_id);


-- ─────────────────────────────────────────────────────────
-- P-28: SYSTEM_CONFIG — PER-TENANT КОНФИГУРАЦИЯ            (ADR-012)
-- PK (key) → составной PK (organization_id, key).
-- Seed-строки (INSERT выше) backfill-ятся через UPDATE.
-- ─────────────────────────────────────────────────────────

ALTER TABLE system_config
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE system_config
    SET organization_id = '00000000-0000-0000-0000-000000000001'
    WHERE organization_id IS NULL;

ALTER TABLE system_config
    ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE system_config DROP CONSTRAINT system_config_pkey;
ALTER TABLE system_config ADD PRIMARY KEY (organization_id, key);

CREATE INDEX idx_system_config_org ON system_config (organization_id);


-- ─────────────────────────────────────────────────────────
-- P-29: AUDIT_LOG — ДЕНОРМАЛИЗОВАННЫЙ organization_id      (ADR-012)
-- Для per-tenant запросов без JOIN к objects/users.
-- Партиционированная таблица: ALTER propagates на все партиции.
-- ─────────────────────────────────────────────────────────

ALTER TABLE audit_log
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE audit_log
    SET organization_id = '00000000-0000-0000-0000-000000000001'
    WHERE organization_id IS NULL;

ALTER TABLE audit_log
    ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_audit_log_org ON audit_log (organization_id, performed_at DESC);


-- ─────────────────────────────────────────────────────────
-- P-30: PERIODS — ПОЛЯ PDF-ОТЧЁТА                          (ADR-013)
-- ─────────────────────────────────────────────────────────

ALTER TABLE periods
    ADD COLUMN report_url               TEXT,
    ADD COLUMN report_generated_at      TIMESTAMPTZ,
    ADD COLUMN report_generation_failed BOOLEAN NOT NULL DEFAULT FALSE;


-- ─────────────────────────────────────────────────────────
-- P-31: OBJECTS — ПОЛЯ СВОДНОГО ОТЧЁТА                     (ADR-013)
-- ─────────────────────────────────────────────────────────

ALTER TABLE objects
    ADD COLUMN summary_report_url          TEXT,
    ADD COLUMN summary_report_generated_at TIMESTAMPTZ;


-- ─────────────────────────────────────────────────────────
-- P-32: DEVICE TOKENS ДЛЯ FCM PUSH-УВЕДОМЛЕНИЙ             (ADR-014)
-- ADR-014 указывает user_id UUID — исправлено на INTEGER
-- (users.id SERIAL; см. errors_log.md #BUG-003).
-- ─────────────────────────────────────────────────────────

CREATE TABLE device_tokens (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token     TEXT        NOT NULL,
    platform      TEXT        NOT NULL CHECK (platform IN ('android', 'ios')),
    device_id     TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_device_tokens_user_active
    ON device_tokens (user_id) WHERE is_active = TRUE;

CREATE UNIQUE INDEX uq_device_tokens_device
    ON device_tokens (device_id) WHERE device_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON device_tokens TO ccip_app;
