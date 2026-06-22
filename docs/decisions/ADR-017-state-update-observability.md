---
adr: ADR-017
status: Принято
impl_anchors:
  - .claude/runtime/post-agent-hook.js
  - .claude/runtime/execute-dag.js
  - .claude/runtime/flush-state.js
  - docs/schemas/session-state.schema.json
---

# ADR-017 — State Update Observability

**Статус:** Принято (2026-06-07)
**Связано:** CLAUDE.md §15 State Contract; closes runtime-аудит findings F-RT-02, F-RT-04.

## Контекст

Контракт §15 объявляет блок `## State Update` обязательным, но его отсутствие/битость проходили молча: `post-agent-hook.js` ставил fallback summary без сигнала, `execute-dag.js` писал `outcome:'success'` хардкодом. Деградация routing-качества невидима для машины и человека.

## Решение

Пропуск валидного блока помечается полем `missing_state_update:true` в observation. Поле `outcome` остаётся ортогональным (результат задачи) и НЕ конфлатится с нарушением контракта. Сигнал всплывает по-событийно в stderr и сводной строкой на Stop в feedback-loop.md §4. Observability без enforcement: блок остаётся «allowed» — не блокируем, не ретраим, не корректируем.

## Последствия

- Пропуски контракта машинно-наблюдаемы и заметны человеку.
- `outcome` сохраняет смысл «результат задачи» → корректные routing-сигналы (агент, забывший блок, не выглядит «не справляющимся»).
- Схема `session-state.json` получает опциональное поле — обратно совместимо.
- Задел под пункт 2 (enforcement Feedback-петли) — отдельный цикл.
