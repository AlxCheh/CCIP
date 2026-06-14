---
adr: ADR-020
status: Принято
impl_anchors:
  - tools/audit/_lib/token-estimate.js
  - .claude/runtime/tool-telemetry.js
  - .claude/runtime/aggregate-telemetry.js
  - docs/schemas/event.schema.json
related:
  - ADR-016
  - ADR-018
---

# ADR-020 — Heuristic Token Estimate for Tool-I/O (partial closure of ADR-016 blind spot)

**Статус:** Принято 2026-06-12
**Reviewer:** live-сессия sign-off (human-in-the-loop), ветка `feat/main-agent-token-estimate`
**Связано:** ADR-016 (token-efficiency-auditor + main-agent token-blindness как accepted blind spot), ADR-018 (telemetry-плоскость, `events.jsonl`), CLAUDE.md §15 (Inline-session scope), roadmap §XII.5.

## Контекст

ADR-016 зафиксировал: raw transcript и reasoning/output-токены **главного** агента хукам недоступны — нет API для raw token attribution. `tool-telemetry.js` (PostToolUse, RFC R2) уже пишет per-tool событие в `events.jsonl` с полем `bytes` — но `bytes` явно объявлено прокси объёма, НЕ токенами.

§XII.5 capability-assessment рекомендует «token-attribution через доступный канал, даже грубую per-tool оценку». Канал данных (`events.jsonl`) готов; не хватало оценки токенов поверх объёма. При этом корпус CCIP преимущественно кириллический, а кириллица токен-дороже на байт (UTF-8 2 байта/символ, но дробится в больше токенов на единицу содержания) — плоский делитель `bytes/4` систематически занижал бы кириллический объём.

## Решение

1. **Чистый эвристический эстиматор** (`tools/audit/_lib/token-estimate.js`): `tokens ≈ bytes / K(r)`, где `r` = доля не-ASCII символов (`nonAsciiRatio`). `K(r) = K_ASCII − (K_ASCII − K_CYR)·r`: при `r=0` делитель `K_ASCII=4`, при `r=1` → `K_CYR=3` (кириллица упаковывает больше токенов на байт). Калибровка через env `CCIP_TOK_K_ASCII` / `CCIP_TOK_K_CYR` или per-call opts.

2. **Event-time атрибуция.** `buildEvent` в `tool-telemetry.js` добавляет `non_ascii_ratio` + `est_tokens` к каждому событию (оценка по `tool_response`). `event.schema.json` (`additionalProperties:false`) расширена двумя полями.

3. **Session-level поверхность.** `aggregate-telemetry.js` (Stop hook, RFC R5) суммирует `est_tokens` за ТЕКУЩУЮ сессию (тот же session-filter, что и для `tool_calls`) и выводит `est_tokens=` в §5 metrics-строку `feedback-loop.md`.

## Граница (честно)

Оценивается **только** объём РЕЗУЛЬТАТОВ инструментов — то, что Read/Bash/Grep вернули в контекст. Reasoning- и output-токены главного агента по-прежнему **невидимы** (ADR-016 не отменяется). Калибровка `K` — эвристическая, не верифицирована против реального токенайзера Claude. Поэтому метка возможности — **[ЧАСТ.]**, не [ПОДТВ.]: tool-I/O token-blindness частично закрыта, reasoning-blindness сохраняется. Путь к уточнению (верификация K против токенайзера, либо внешний counting-API) — отдельный механизм.

## Последствия

- ADR-016 остаётся в силе и не редактируется (immutability) — ADR-020 дополняет, фиксируя частичное закрытие одного из двух классов слепоты.
- `events.jsonl` получает два новых поля; старые события без них валидны (поля опциональны в схеме) и аккумулируются как `est_tokens=0`.
- capability-assessment строки token-attribution промоутнуты [НЕДОК.]→[ЧАСТ.] с доказательством (тесты + impl_anchors), без overclaim.
- Калибровочные константы — env-tunable, не machine-enforced (CLAUDE.md §18 класс «Конфигурация»).
