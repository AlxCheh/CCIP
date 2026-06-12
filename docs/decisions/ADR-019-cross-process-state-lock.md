---
adr: ADR-019
status: Принято
impl_anchors:
  - .claude/runtime/state-lock.js
  - .claude/runtime/state-io.js
  - .claude/runtime/contract-exempt.js
  - .claude/runtime/post-agent-hook.js
  - .claude/runtime/governance-manifest.json
related:
  - ADR-018
  - ADR-017
---

# ADR-019 — Cross-Process State Lock + Honest Contract Promotion

**Статус:** Принято 2026-06-11
**Reviewer:** live-сессия sign-off (human-in-the-loop), ветка `feat/cross-process-state-lock`
**Связано:** ADR-018 (machine-enforced runtime governance), ADR-017 (State Update observability), CLAUDE.md §15 State Contract, CLAUDE.md §18 (ограничения enforcement); закрывает HA-2, E-2 residual race.

## Контекст

`session-state.json` мутируют 8 hook-скриптов, каждый в СВОЁМ процессе (post-agent-hook, flush-state, execute-dag, pre-agent-gate, gate-fail-open, governance-reactor, failure-detectors, audit-session-reset). Каждый write был атомарен по отдельности (tmp+fsync+rename) с HA-3 «re-read before write», но read-modify-write **не был атомарен МЕЖДУ процессами**: два хука, сработавшие конкурентно, оба читали состояние, оба мутировали, и последний rename затирал мутацию первого — потеря обновления (lost update).

`writeLock` в execute-dag.js был in-process Promise-цепочкой и не покрывал хуки в других процессах (CLAUDE.md §18 фиксировала это как «Одиночный процесс assumed»). Это был ведущий accepted known-risk класса HA-2 и источник E-2 residual concurrency race.

Параллельно: инвариант `INV-STATE-CONTRACT` (агент обязан завершать вывод блоком `## State Update`) держался в статусе `observed` (signal). Его доминирующее «нарушение» в feedback-loop §5 — всегда `ccip-session-optimizer`, который по жёсткому relay-правилу CLAUDE.md эмитит Bootstrap дословно и НЕ выдаёт `## State Update` by design. То есть FPR этого сигнала был ≈100% ложным — он не годился к enforce без предварительной точной настройки.

## Решение

1. **Единый locked путь записи.** Все мутации `session-state.json` идут через `updateStateLocked` (`state-io.js`) под blocking cross-process локом (`state-lock.js`). Лок построен по модели проверенного `tools/audit/_lib/serial-guard.js` (атомарный `fs.openSync('wx')` + PID-stale-reclaim), но blocking-acquire-with-backoff вместо throw-on-held. Read-modify-write становится атомарным между процессами — HA-2 / E-2 закрыты.

2. **Наблюдаемый fail-open.** При таймауте acquire (зависший холдер) write проходит БЕЗ лока (никогда не дедлочим hook), но факт фиксируется durable-логом и `state_lock_failed_open` алертом, который governance-reactor surface'ит следующим ходом. Это повторяет паттерн наблюдаемого fail-open из E-6 (gate-fail-open).

3. **Корректность лока.** Unparseable/пустой holder трактуется как lock в процессе создания (между `openSync('wx')` и записью PID), а НЕ как stale — иначе конкурент удалял бы чужой лок и входил в критическую секцию. Реклейм только при позитивном доказательстве: мёртвый PID или истёкший TTL.

4. **Честная градация контракта.** `INV-STATE-CONTRACT` повышен `signal → enforced` ПОСЛЕ сведения FPR к нулю через явный реестр `contract-exempt.js`: relay-агенты (ccip-session-optimizer) освобождены от требования блока. С FPR=0 каждый non-exempt промах — истинное нарушение, поэтому эскалация `state_contract_degraded` происходит немедленно (порог 1), а не отложенно.

## Последствия

- CLAUDE.md §18 строка про `writeLock` single-process снята: мутации теперь cross-process safe (machine-enforced), остаточный риск — только наблюдаемый fail-open под экстремальной контенцией.
- Потолок Reliability / Scalability / State Management / Contract Enforcement поднят; один signal-инвариант стал enforced **честно** — за счёт точности (exemption), а не фабрикации (CLAUDE.md §17). Остальные 8 signal/advisory инвариантов остаются signal by design (ADR-018, recert 2026-06-11 §6) — это корректно, не штрафуется.
- `.lock` / `.bak` / `.tmp` артефакты session-state — в .gitignore.
- Новый артефакт-канал: `state_lock_failed_open` в governance_alerts (kind в governance-reactor DIRECTIVES).
