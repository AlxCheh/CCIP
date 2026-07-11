-- M-07 Sync API (ADR-003 / ADR-008)

-- 1. Идемпотентность: клиентский UUID операции (sync-engine §8).
--    Естественный ключ по client_timestamp отвергнут — clock skew (ADR-003).
ALTER TABLE sync_queue ADD COLUMN client_op_id VARCHAR(64);
ALTER TABLE sync_queue ADD CONSTRAINT uq_sync_queue_device_op
    UNIQUE (device_id, client_op_id);

-- 2. DDL-дрейф: ADR-003 требует статус 'escalated', 0001_initial его не включил.
ALTER TABLE sync_queue DROP CONSTRAINT sync_queue_status_check;
ALTER TABLE sync_queue ADD CONSTRAINT sync_queue_status_check CHECK (
    status IN ('pending', 'applied', 'conflict', 'rejected', 'escalated')
);

-- 3. ADR-003 «запись discrepancies типа offline_conflict_in_closed_period»:
--    type 3 = офлайн-конфликт в закрытом периоде (1/2 — бизнес-типы из Концепции).
ALTER TABLE discrepancies DROP CONSTRAINT discrepancies_type_check;
ALTER TABLE discrepancies ADD CONSTRAINT discrepancies_type_check CHECK (
    type IN (1, 2, 3)
);
