# Known Risks — CCIP Runtime

**Дата фиксации:** 2026-06-08
**Источник:** adversarial audit `docs/audit/2026-06-08-adversarial-rfc.md`
**Статус:** принято как known risk — не требует немедленных action items

Эти 12 пунктов классифицированы как **низкий приоритет** по одному из критериев:
- существует partial mitigation (graceful degrade, explicit warning, auto-recovery)
- вероятность реализации очень низкая (стабильный API, single-process assumption)
- последствия ограничены (quality degradation, не correctness)

---

## Условие пересмотра

Любой пункт ниже переходит в план ремедиации если:
- он реализовался в production инциденте
- появился новый контекст меняющий вероятность/impact
- запланирована крупная рефакторинговая сессия затрагивающая компонент

---

## SPOF-2: feedback-loop.md

**Риск:** единственное хранилище routing history; если файл удалён — история потеряна навсегда.

**Mitigation:** flush-state.js и aggregate-telemetry.js автоматически пересоздают файл при отсутствии. Функциональность не нарушается.

**Принято потому что:** потеря истории — не потеря корректности. Routing продолжает работать.

**Trigger пересмотра:** если history начнёт использоваться для runtime-решений (не только analytics).

---

## SPOF-3: audit-trigger-hook.js / trigger-state.json

**Риск:** если `trigger-state.json` corrupt — `defaultState()` сбрасывает счётчики → T-06..T-10 пропускаются в этой сессии.

**Mitigation:** триггеры advisory — их пропуск не блокирует работу, не ломает данные. `audit-session-reset.js` атомично перезаписывает trigger-state при каждом SessionStart.

**Принято потому что:** триггеры — сигналы, не enforcement. Один missed trigger — не инцидент.

**Trigger пересмотра:** если T-06..T-10 переведут в blocking-режим.

---

## SPOF-4: claude CLI в PATH

**Риск:** если `claude` CLI недоступен — DAG execution невозможен, нет fallback executor.

**Mitigation:** `checkCLI()` в `execute-dag.js` проверяет наличие CLI в самом начале и выдаёт явную ошибку. Не silent failure.

**Принято потому что:** CLI — внешняя зависимость уровня инфраструктуры. Аналог "нет Node.js" — не архитектурный дефект.

**Trigger пересмотра:** переход на containerized deployment где CLI presence не гарантирован.

---

## SPOF-5: js-yaml в verify-evidence-log.js

**Риск:** если пакет отсутствует — L1 (syntactic) YAML-верификация молча не работает, L2/L3 продолжают.

**Mitigation:** `verify-evidence-log.js` явно пишет предупреждение в stderr при отсутствии js-yaml. Partial degrade с явным сигналом.

**Принято потому что:** js-yaml уже является зависимостью проекта и присутствует. Отсутствие возможно только при broken install.

**Trigger пересмотра:** если L1 верификация станет blocking gate в CI.

---

## HA-1: writeLock fn() должна быть синхронной

**Риск:** `writeLock` в `execute-dag.js` предполагает что передаваемая `fn()` не содержит `await`. Если добавить async-мутацию — lock молча перестаёт serializes.

**Mitigation:** комментарий в коде явно документирует constraint. TypeScript не используется в проекте.

**Принято потому что:** `execute-dag.js` — internal module, изменяется редко. Constraint виден в коде.

**Trigger пересмотра:** при рефакторинге execute-dag.js или переходе на TypeScript.

---

## HA-2: single-process assumption

**Риск:** `writeLock` in-process — не работает при двух параллельных процессах execute-dag.js.

**Mitigation:** задокументировано в `CLAUDE.md §18` (план ремедиации Task 15). Архитектура не предполагает параллельных DAG-процессов.

**Принято потому что:** constraint задокументирован. Нарушение требует явного внешнего действия.

**Trigger пересмотра:** при введении параллельного DAG execution.

---

## HA-4: tool_name === 'Agent' предполагается стабильным

**Риск:** `post-agent-hook.js:151` фильтрует по `tool_name !== 'Agent'`. Если Claude Code API переименует инструмент — hook молча не срабатывает.

**Mitigation:** Claude Code API стабилен; это public contract продукта.

**Принято потому что:** вероятность breaking change в tool_name крайне низкая.

**Trigger пересмотра:** при обновлении Claude Code с breaking changes.

---

## HA-5: subagent_type ненадёжен при ambiguous mentions

**Риск:** fallback resolver в `post-agent-hook.js:80-83` возвращает null при >1 упоминании агента в описании.

**Mitigation:** primary path — `subagent_type` поле, которое Claude Code передаёт надёжно. Fallback через regex — только для edge cases.

**Принято потому что:** primary path работает корректно. Ambiguous case → null → тихий skip, не corruption.

**Trigger пересмотра:** если статистика показывает частые null-resolve.

---

## HA-6: LLM verbatim relay (optimizer bootstrap)

**Риск:** `CLAUDE.md` требует verbatim relay `ccip-session-optimizer` bootstrap, но нет machine-check. LLM может пересказать вместо relay.

**Mitigation:** правило задокументировано в CLAUDE.md и в MEMORY.md (`feedback_relay_optimizer_bootstrap.md`).

**Принято потому что:** это quality concern, не correctness. Bootstrap работает даже при парафразе — просто менее точно.

**Trigger пересмотра:** при переходе на machine-verifiable relay механизм.

---

## HA-7: intents[] — значения из enum не валидируются в runtime

**Риск:** если в `intents` записать произвольную строку — нет runtime rejection.

**Mitigation:** `node tools/audit/session-state.js` валидирует schema при каждом запуске. `intents.json` содержит закрытый список.

**Принято потому что:** интенты формирует LLM-оркестратор, не внешний user input. Audit tool покрывает.

**Trigger пересмотра:** при открытии intents для внешнего ввода.

---

## UU-1: Stop hooks parallel/serial — не верифицировано

**Риск:** Claude Code может выполнять Stop hooks конкурентно, что при конкурентной записи в session-state.json приведёт к state corruption.

**Mitigation:** частично снято Task 18 плана ремедиации (HA-3): `failure-detectors.js` теперь делает re-read before write. Дополнительно: если hooks sequential — проблемы нет.

**Принято потому что:** Task 18 обеспечивает защиту при любом порядке выполнения.

**Trigger пересмотра:** если появится документация Claude Code о concurrent Stop hooks с гарантиями.

---

## UU-3: events.jsonl агрегируется без фильтрации по session_id

**Риск:** `aggregate-telemetry.js` читает весь `events.jsonl` при каждом Stop — события из прошлых сессий попадают в метрики текущей.

**Mitigation:** метрики используются только для routing quality analysis (feedback-loop.md §5), не для runtime-решений. Небольшое завышение `tool_calls` не критично.

**Принято потому что:** analytics accuracy — не correctness. Ротация файла при >5MB ограничивает накопление.

**Trigger пересмотра:** при использовании метрик для принятия автоматических решений (напр. gate на основе tool_calls).

---

## Re-evaluation — 2026-06-16

Плановый пересмотр по итогам `docs/plans/2026-06-09-known-risks-closure.md`.

| Риск | Статус | Закрыт в |
|------|--------|----------|
| UU-3 | **CLOSED** | `1d98846` — filter events.jsonl by session_id |
| HA-7 | **CLOSED** | `validateIntents()` в `flush-state.js` + 2 теста |
| HA-1 | **CLOSED** | thenable-guard в `execute-dag.js#updateState` + 1 тест |
| SPOF-3 | **CLOSED** | `validateTriggerState()` в обоих audit-hook + 2 теста |

Все четыре риска устранены. Файл остаётся историческим артефактом; новые риски фиксировать в следующем аудите.
