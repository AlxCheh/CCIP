---
status: Draft (под ревью)
relates_to: ADR-016
date: 2026-05-23
scope: hook-wiring триггеров T-02..T-10 для token-efficiency-auditor
---

# Token-Efficiency Auditor — Hook Architecture (design)

> Design-документ под ревью. T-01 (`/token-audit`) уже реализован командой
> `.claude/commands/token-audit.md`. Здесь — wiring автоматических триггеров.

## 1. Ограничения runtime (проверено по факту)

| # | Ограничение | Источник | Следствие |
|---|---|---|---|
| C1 | Хук **не может** запустить субагента | Claude Code hook API | Хук только детектирует условие и *подсказывает* запуск (флаг + инъекция контекста) |
| C2 | Схема `session-state.json` закрыта (`additionalProperties:false`) | `docs/schemas/session-state.schema.json` | Trigger-state — в отдельном файле `.claude/audit/trigger-state.json`, НЕ в session-state |
| C3 | PostToolUse payload содержит только `tool_name` / `tool_input` / `tool_response` | `.claude/runtime/post-agent-hook.js` | Per-message/per-turn токены ассистента недоступны → T-03/04/05 неисполнимы |
| C4 | Оценка токенов = `len/4` только для tool_response | `post-agent-hook.js:120` | Метрики «токены на turn» — приблизительные, не точные |
| C5 | Граница «turn» не экспонируется в PostToolUse | hook API | Аппроксимировать через `UserPromptSubmit` hook (сброс per-turn счётчиков, инкремент turn_index) |
| C6 | Аудитор сам использует Read/Bash | `.claude/agents/token-efficiency-auditor.md` | Нужен guard `audit_in_progress`, иначе self-trigger петля |

## 2. Маппинг триггер → hook event

| Триггер | Hook event | matcher | Источник данных | Исполнимо |
|---|---|---|---|---|
| T-02 session-end | `Stop` | — | `session-state.json` + optimizer artifacts | да |
| T-06 повторный Read | `PostToolUse` | `Read` | `tool_input.file_path` + `offset`; счётчик в trigger-state | да |
| T-07 burst tool-calls | `PostToolUse` | `*` (все) | per-turn счётчик; сброс на UserPromptSubmit | да |
| T-08 ExitPlanMode | `PostToolUse` | `ExitPlanMode` | факт вызова | да |
| T-09 каждые 20 turns | `UserPromptSubmit` | — | turn_index в trigger-state | да |
| T-10 каскад сбоев | `Stop` / `PostToolUse:Agent` | `Agent` | `observations[].outcome` за окно 5 | да |
| T-03 context ≥ 70% | — | — | размер окна в реальном времени | **нет (нет API)** |
| T-04 token-spike turn | — | — | per-turn токены ассистента | **нет (только оценка)** |
| T-05 long message | — | — | токены одного сообщения | **нет (только оценка)** |

## 3. Механизм сигнализации (hook → запуск аудитора)

Хук не вызывает агента (C1). Двухчастная схема:

1. **Запись флага.** Хук при срабатывании добавляет в `.claude/audit/trigger-state.json`:
   ```json
   { "pending_audit": [ { "trigger": "T-06", "reason": "docs/x.md:0 прочитан 3×", "ts": "..." } ] }
   ```
2. **Инъекция подсказки.** Хук эмитит `hookSpecificOutput.additionalContext` (PostToolUse / UserPromptSubmit поддерживают) одной строкой:
   `⚡ Token-audit trigger T-06 met → запусти /token-audit`.
   Оркестратор (или пользователь) видит подсказку и решает.

**Без авто-запуска агента из хука.** Это сознательно: сохраняет human/orchestrator-in-the-loop и совместимо с C1. Авто-запуск возможен только на `Stop` (T-02) — там оркестратор уже завершает сессию, и chaining `optimizer → auditor` детерминирован.

## 4. Persistent state: `.claude/audit/trigger-state.json`

Отдельный файл (C2), не подчинён session-state схеме. Предлагаемая структура:

```json
{
  "session_id": "2026-05-23-1200",
  "turn_index": 0,
  "tool_calls_this_turn": 0,
  "read_counts": { "docs/x.md:0": 2 },
  "agent_failures_window": ["success", "failed"],
  "audit_in_progress": false,
  "pending_audit": [],
  "cooldowns": { "T-06": 0, "T-07": 0 }
}
```

- Атомарная запись по образцу `post-agent-hook.js` (tmp + rename + fsync).
- Сброс per-turn полей (`tool_calls_this_turn`, частично `read_counts`) на `UserPromptSubmit`.
- Опционально git-ignored как runtime-артефакт (открытый вопрос Q3).

## 5. Guard от self-trigger + debounce

- `audit_in_progress: true` ставится, когда оркестратор запускает аудитора; снимается в `post-agent-hook.js` при `agent === "token-efficiency-auditor"`. Пока true — trigger-хуки no-op.
- Per-trigger `cooldowns` — после срабатывания T-NN не повторять N tool-calls / до следующего turn. Иначе одна и та же сессия завалит `pending_audit`.

## 6. Новые файлы и правки settings.json

| Файл | Event | Назначение |
|---|---|---|
| `.claude/runtime/audit-trigger-hook.js` | PostToolUse `*` | Счётчики + детекция T-06/T-07/T-08/T-10 |
| `.claude/runtime/audit-turn-hook.js` | UserPromptSubmit | turn_index++ (T-09), сброс per-turn |
| правка `.claude/runtime/post-agent-hook.js` | PostToolUse `Agent` | снять `audit_in_progress` после аудитора |
| правка `.claude/runtime/flush-state.js` | Stop | T-02 chaining + проверка `pending_audit` |

`settings.json` дельта (концептуально):
```json
{ "PostToolUse": [ { "matcher": "*", "hooks": [ { "type": "command", "command": "node .claude/runtime/audit-trigger-hook.js" } ] } ],
  "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "node .claude/runtime/audit-turn-hook.js" } ] } ] }
```

> Внимание: matcher `*` на PostToolUse запускает хук на КАЖДЫЙ tool-call. Хук
> обязан быть дешёвым (read+write одного JSON, ранний выход при `audit_in_progress`)
> и fail-silent (exit 0), по образцу `post-agent-hook.js:133`.

## 7. Итог исполнимости

- **T-01** — готово (команда).
- **T-02, T-06, T-07, T-08, T-09, T-10** — исполнимы предложенной схемой.
- **T-03, T-04, T-05** — остаются задокументированным контрактом; хук-стабы no-op до появления token-window API в hook payload.

## 8. Решения по открытым вопросам (зафиксировано 2026-05-23)

1. **Q1 — авто-запуск vs nudge → РЕШЕНО: только nudge.** Хук не может спавнить агента (C1), включая Stop. Все триггеры, в т.ч. T-02, = `pending_audit` флаг + инъекция подсказки; реальный запуск — следующим действием оркестратора/пользователя.
2. **Q2 — стоимость PostToolUse `*` → РЕШЕНО: широкий matcher `*`.** Хук фигурирует на каждом tool-call; T-07 (burst) входит в объём. Обязательное требование: ранний выход при `audit_in_progress` и при невалидном payload, fail-silent (exit 0) по образцу `post-agent-hook.js:133`. Хук = один read+write JSON, без тяжёлых операций.
3. **Q3 — git-tracking → РЕШЕНО: смешанно.** Коммитим `.claude/audit/rules/` (обучение должно переживать между машинами) и `.claude/audit/metrics/history.jsonl`. В `.gitignore`: `.claude/audit/trigger-state.json`, `.claude/audit/reports/`, `.claude/audit/evidence/` (пер-сессионный шум). `metrics/rolling-30.json` — производный, тоже в `.gitignore`.
4. **Q4 — turn_index при компакции → РЕШЕНО: допустимо.** T-09 периодический и приблизительный по дизайну; рассинхронизация при компакции не критична.

## 9. План реализации (по фазам)

- **Фаза 1 — ✅ DONE (2026-05-23):** `trigger-state.json` + `docs/schemas/trigger-state.schema.json` + `audit-trigger-hook.js` (PostToolUse `*`: счётчики + T-06/T-07/T-08/T-10) + `settings.json` wiring + guard для self-trigger (auditor-call очищает `pending_audit`) + `.gitignore`. Покрыто 17 standalone-тестами хука.
- **Фаза 2 — ✅ DONE (2026-05-23):** `audit-turn-hook.js` (UserPromptSubmit: T-09 каждые 20 turns + сброс per-turn счётчика для T-07).
- **Фаза C — ✅ DONE (2026-05-24):** детектор фразы T-02 внутри `audit-turn-hook.js`: SESSION_END_RE (case-insensitive) по 4 фразам → pending_audit[T-02] + nudge «(1) ccip-session-optimizer → (2) token-efficiency-auditor». T-02 и T-09 могут сработать одновременно (nudges.join). 9 тестов в `__tests__/audit-turn-hook.test.js`.
- **Отложено (заблокировано):** T-03/04/05 — до появления token-window API в hook payload.

> **Деталь реализации vs дизайн:** guard `audit_in_progress` упрощён — `post-agent-hook.js` НЕ модифицировался (снижение риска для критичного хука). Вместо этого `audit-trigger-hook.js` сам распознаёт Agent-вызов `token-efficiency-auditor` и очищает `pending_audit`. Subagent-internal tool-calls не доходят до parent PostToolUse, поэтому полный in-progress флаг не требуется.

## 10. Code review (2026-05-23) — итог и фиксы

Высокоуровневое ревью диффа (recall mode). Live-wiring подтверждён эмпирически: хук срабатывает (`total_calls` инкрементируется), а `additionalContext` на `PostToolUse` **реально доходит до модели** (проверено форсированием T-06 — nudge `⚡` surfaced).

**Исправлено:**
- **#1/#2 — cross-session накопление state.** `trigger-state` скоупится по `session_id`, но он часто `""` → in-hook reset не срабатывал → счётчики/`read_counts`/`turn_index` копились между сессиями. Фикс: новый `SessionStart` hook `.claude/runtime/audit-session-reset.js` сбрасывает state в начале каждой сессии (надёжно, без зависимости от `session_id`) + cap `MAX_READ_KEYS=400` в `audit-trigger-hook.js` prune'ит синглтоны. Покрыто 10 тестами.
- **#4 — доставка nudge.** Проверено: работает (REFUTED). Дополнительно: durable-сигнал — `pending_audit` в файле; `additionalContext` — best-effort поверх него.

**Known-limitations (приняты, не чиним):**
- **#3 — гонка при параллельных tool-calls.** matcher `*` → конкурентные процессы хука делают read-modify-write без локов → возможна потеря инкрементов (undercount, пропуск T-06/T-07). Для nudge-эвристики допустимо; последовательные вызовы не затронуты.
- **Harness dedup.** Идентичные повторные Read'ы гасятся harness'ом (но хук всё равно срабатывает). Следствие: T-06 ловит в основном re-reads с другим offset или после правки файла.
- **#5** — `process.exit(0)` сразу после `stdout.write` может усечь nudge на части платформ (на практике surfaced корректно). **#6** — `audit_in_progress` vestigial (всегда false). **#7** — cooldown T-07 на `total_calls` может подавить легитимный burst в следующем turn.
