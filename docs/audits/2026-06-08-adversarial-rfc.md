# Adversarial Architectural RFC — CCIP
**Дата аудита:** 2026-06-08
**Аудитор:** red-team-auditor (Principal Architect + Runtime Systems Engineer + Red Team + Chaos Engineering + Security Researcher)
**Методология:** Red Team Review · Adversarial Architecture Review · FMEA · STRIDE · Fault Tree Analysis · Chaos Engineering Analysis · Runtime Governance Audit · Formal Invariant Review · Semantic Drift Detection

---

## 1. Executive Summary

**Пять ключевых находок:**

1. **Все governance-инварианты типа `block` находятся в shadow-режиме.** `INV-AGENT-BUDGET`, `INV-SECURITY-COAGENT`, `INV-READING-DISCIPLINE` — все три в `governance-manifest.json` имеют `"status":"shadow"`. Система документирует enforcement, но реально не блокирует ничего. Архитектурная ложь уровня **CRITICAL**.

2. **State Update контракт не enforced машинно.** `missing_state_update:true` — observability-only сигнал без consequence. Контракт §15 использует слово MUST; реальность — агент может молча пропустить блок навсегда без блокировки. `contract_debt=2` при `observations:[]` означает что долг накоплен, но детекция потеряна.

3. **`fallback-profiles.json` содержит профиль только для одного агента** (`ccip-backend-core`). Все остальные backup-агенты из таблицы CLAUDE.md (9 пар) деградируют на `general-purpose` без domain-context injection. Fallback path семантически сломан для 8 из 9 специалистов.

4. **`session-state.json` в production-состоянии имеет `task:""`, `intents:[]`, `observations:[]`, `status:"planning"`** при `contract_debt:2` и 4 governance-alerts типа `silent_state_degradation`. Orphan state.

5. **`ccip-architect` ссылается на `ADR-001..ADR-016`**, но `docs/decisions/index.md` содержит ADR-018. Дрейф на 2 ADR.

**Общий вердикт:** Архитектура находится на уровне "observability theatre" — наблюдаемость построена, enforcement объявлен, но реально не включён. Уровень зрелости **Level 2 из 5** (Defined, but not Managed).

---

## 2. Общая оценка зрелости архитектуры

Высокая концептуальная зрелость: правильные паттерны атомарных записей, idempotent flush, circuit breaker для resume, DFS cycle detection в DAG, multi-layer telemetry. Задокументированные инварианты точно отражают намерения. Однако между слоями документация → декларация → реализация → enforcement существует систематический дрейф: каждый следующий слой слабее предыдущего. Система умеет **наблюдать** нарушения, но не умеет их **предотвращать**.

---

## 3–11. Scorecard

| Dimension | Score | Ключевая причина |
|-----------|-------|-----------------|
| **Architecture** | **58/100** | Концептуальная модель сильна; enforcement сломан |
| **Runtime Governance** | **35/100** | Все 3 block-инварианта в shadow-режиме |
| **Enforcement Coverage** | **20/100** | 0 из 12 инвариантов в статусе `"enforced"` |
| **Observability** | **62/100** | Signals работают, observations флашатся с потерей context |
| **Reliability** | **55/100** | Atomic writes есть; failure-detectors без fsync+lock |
| **Scalability** | **40/100** | `governance_alerts[]` unbounded, no events.jsonl filtering |
| **Maintainability** | **63/100** | Хорошая модульность; manifest без auto-gen валидации |
| **Semantic Integrity** | **45/100** | "Machine-Enforced" в ADR-018 ≠ `"status":"shadow"` в manifest |
| **Security** | **48/100** | `sanitizeHandoff()` отсутствует в live-session path |
| **Среднее** | **47/100** | |

---

## 12. Таблица дефектов

| ID | Severity | Likelihood | Компонент | Суть |
|----|----------|------------|-----------|------|
| **D-01** | **CRITICAL** | HIGH | `governance-manifest.json:49`, `pre-agent-gate.js:42` | `INV-AGENT-BUDGET` — `status:"shadow"`, реального deny нет |
| **D-02** | **CRITICAL** | HIGH | `governance-manifest.json:57` | `INV-SECURITY-COAGENT` — `status:"shadow"` |
| **D-03** | **CRITICAL** | HIGH | `governance-manifest.json:74`, `read-gate.js:28` | `INV-READING-DISCIPLINE` — `status:"shadow"` |
| **D-04** | **CRITICAL** | MEDIUM | `post-agent-hook.js:183-187` | `sanitizeHandoff()` вызывается только в DAG-path (`execute-dag.js:107`), не в live-session path. Prompt injection через handoff_notes в live sessions — открытый вектор |
| **D-05** | HIGH | HIGH | `session-state.json:48,51` | `contract_debt:2` при `observations:[]` — причина debt потеряна после flush |
| **D-06** | HIGH | HIGH | `fallback-profiles.json` | Профиль только для `ccip-backend-core`; 8 из 9 специалистов без domain-context |
| **D-07** | HIGH | HIGH | `ccip-architect.md:3` | "ADR-001..ADR-016" — устарело на 2 ADR (есть ADR-018) |
| **D-08** | HIGH | LOW | `failure-detectors.js:95-97` | `writeFileSync` → `renameSync` без fsync и без write-lock (race condition при Stop parallel hooks) |
| **D-09** | HIGH | MEDIUM | `session-state.json:49-78` | `governance_alerts[]` — unbounded growth, нет pruning |
| **D-10** | HIGH | MEDIUM | `pre-agent-gate.js:26-28` | Бюджет считается из `observations.length`, но observations очищаются flush'ом → в новой сессии active=0 всегда |
| **D-11** | MEDIUM | HIGH | `CLAUDE.md:26-27` | Правило "intents==2 → co-agent" декларативное, нет machine-подсчёта intents |
| **D-12** | MEDIUM | HIGH | `CLAUDE.md:116-117` | "agent fails >= 2 → switch to backup" — нет машинного счётчика, routing switch ручной |
| **D-13** | MEDIUM | LOW | `execute-dag.js:101-102` | Cross-script confusable bypass признан unmitigated в комментарии кода |
| **D-14** | MEDIUM | MEDIUM | `aggregate-telemetry.js:38` | `CCR=${ssc}` — CCR алиасирован к SSC, разные метрики, оба равны одному значению |
| **D-15** | MEDIUM | LOW | `flush-state.js:129-143` | На Windows EBUSY при `renameSync` → observations не очищены → дублирование при следующем Stop |
| **D-16** | MEDIUM | MEDIUM | `CLAUDE.md:23` | Ничто не предотвращает вызов planner для 2-intent задачи |
| **D-17** | MEDIUM | HIGH | `quarantine.yaml:15,22,29` | `sessions_in_quarantine: 0` для всех правил — self-learning loop мёртв |
| **D-18** | MEDIUM | MEDIUM | `governance-manifest.json` | Нет audit-suite теста manifest ↔ реализация |
| **D-19** | MEDIUM | MEDIUM | `pre-agent-gate.js:13,32-33` | `SECURITY_RE` проверяет `subagent_type`, не содержимое scope — `ccip-backend-core` обрабатывающий AUTH не триггерит |
| **D-20** | LOW | LOW | `execute-dag.js:79-87` | `writeLock` — in-process, не shared между процессами |
| **D-21** | LOW | LOW | `read-gate.js:12-14` vs `tool-telemetry.js:13-16` | Разные определения `isFullRead` — несоответствие сигналов |
| **D-22** | LOW | LOW | `optimizer-gate.js:15` | Lock TTL 5 мин — при зависании optimizer возможен второй запуск |
| **D-23** | LOW | LOW | `agents-changed.flag` | `red-team-auditor` untracked в git, нет в Intent-таблице CLAUDE.md |

---

## 13. Матрица рисков

```
                    Likelihood
                    LOW          MEDIUM         HIGH
         HIGH    | D-08,D-20   | D-05,D-09    | D-01,D-02,D-03
Impact   MEDIUM  | D-13,D-15   | D-14,D-16    | D-06,D-07,D-10
                 | D-21,D-22   | D-18,D-19    | D-11,D-12,D-17
         LOW     | D-23        |              |
```

Критический квадрант (HIGH/HIGH): **D-01, D-02, D-03** — все три block-инварианта в shadow.

---

## 14. Карты причинно-следственных связей

**Цепочка 1: Shadow-режим → Governance Theatre**
D-01 (INV-AGENT-BUDGET shadow) → лимит 3 агентов не применяется → spawn 4-го агента → нарушение Resource Rules → context overflow → снижение качества routing → накопление в `contract_debt` → D-05 (debt без context)

**Цепочка 2: Fallback path breakdown**
D-06 (8 missing profiles) → деградация на `general-purpose` без domain invariants → мутация period после lock, нет Transactional Outbox → D-07 (ccip-architect не знает ADR-017/018) → deferred production bug

**Цепочка 3: State drift accumulation**
D-09 (governance_alerts unbounded) → `session-state.json` растёт → `readState()` медленнее → write-lock очередь → задержки в DAG

**Цепочка 4: Sanitize asymmetry → Security**
D-04 (no sanitize в live-session) → вредоносный `handoff_notes` → инжектируется в следующий агент через `post-agent-hook` → D-13 (unicode confusables) усиливает эффект

**Цепочка 5: Observations flush → Budget blind**
D-10 (post-flush observations=[]) → pre-agent-gate видит active=0 → бюджет всегда пустой → D-01 усугубляется (даже в enforce-режиме счётчик был бы неверен)

---

## 15. FMEA — Топ-10 Failure Modes

| # | Failure Mode | S | O | D | RPN |
|---|-------------|---|---|---|-----|
| 1 | Все block-инварианты в shadow | 9 | 10 | 3 | **270** |
| 2 | sanitizeHandoff отсутствует в live-session | 9 | 4 | 2 | **72** |
| 3 | 8 из 9 fallback-profiles отсутствуют | 8 | 6 | 5 | **240** |
| 4 | observations[] очищаются, contract_debt сохраняется | 6 | 8 | 4 | **192** |
| 5 | governance_alerts[] unbounded growth | 4 | 10 | 7 | **280** |
| 6 | failure-detectors.js без fsync + write-lock | 7 | 3 | 2 | **42** |
| 7 | ADR-список в ccip-architect.md устарел | 6 | 10 | 6 | **360** |
| 8 | quarantine rules — sessions_in_quarantine всегда 0 | 5 | 10 | 8 | **400** |
| 9 | isFullRead определение различается в read-gate vs telemetry | 4 | 8 | 5 | **160** |
| 10 | contract_debt порог не в governance-manifest | 5 | 7 | 6 | **210** |

> **Наивысший RPN: F-08 = 400** — "self-learning rule lifecycle" декларирован, но не реализован.

---

## 16. Single Points of Failure

**SPOF-1: `session-state.json`** — единственный источник истины (§15). При corrupt: все hooks возвращают `{}` через fail-open → active=0 → governance collapse. DAG-sessions падают fatal; live-sessions продолжают без governance.

**SPOF-2: `feedback-loop.md`** — единственное персистентное хранилище routing observations. Удалён → пересоздаётся, исторические данные потеряны без warning.

**SPOF-3: `audit-trigger-hook.js`** — единственный детектор T-06..T-10. `trigger-state.json` corrupt → defaultState() → сброс счётчиков → пропуск триггеров.

**SPOF-4: `claude` CLI в PATH** — DAG execution невозможен без CLI. Нет degraded path, нет fallback executor.

**SPOF-5: `js-yaml` в `verify-evidence-log.js`** — при отсутствии пакета L1-верификация не работает, L2/L3 продолжают. Partial degrade без явного сигнала.

---

## 17. Hidden Assumptions

| ID | Предположение | Где задокументировано | Машинная гарантия |
|----|--------------|----------------------|------------------|
| HA-1 | `fn()` в write-lock синхронный (no await inside) | Только комментарий в коде | Нет — нет TypeScript assertion |
| HA-2 | Один процесс execute-dag.js | Нигде | Нет |
| HA-3 | Hook execution order в Stop гарантирован | Порядок в JSON-массиве | Неизвестно — зависит от Claude Code runtime |
| HA-4 | `tool_name === 'Agent'` для всех субагентов | `post-agent-hook.js:151` | Нет — API может измениться |
| HA-5 | `subagent_type` надёжно доставляется в payload | `post-agent-hook.js:75` | Нет |
| HA-6 | LLM всегда соблюдает verbatim relay | `CLAUDE.md:65-67` | Нет — только CLAUDE.md инструкция |
| HA-7 | `intents[]` — значения из закрытого enum | `state-protocol.md:34` | Только через audit tool, не runtime |
| HA-8 | ADR immutability до коммита | MEMORY.md | Нет — pre-commit проходит для правки accepted-ADR |

---

## 18. Unknown Unknowns

**UU-1:** Семантика Claude Code при параллельных Stop hooks — serialized или concurrent? Если concurrent: failure-detectors и flush-state могут читать state одновременно до взаимного обновления.

**UU-2:** Поведение `process.stdin` в Windows PowerShell hook — piping семантика отличается. Ни один тест не проверяет Windows-специфичное поведение.

**UU-3:** `aggregate-telemetry.js` читает весь `events.jsonl` без фильтрации по `session_id` — старые события агрегируются с новыми.

**UU-4:** `extractUpdate()` regex с `[\s\S]*?` — если агент эмитит nested JSON с закрывающей `}` внутри строки → regex берёт первый `}`, не последний → parse failure при корректном блоке.

**UU-5:** При двух `## State Update` блоках `.match()` берёт первый — первый может быть инжектированным, второй легитимным.

---

## 19. Prioritized Roadmap

### Quick Wins (≤ 1 день)

| QW | Дефект | Файл | Действие |
|----|--------|------|---------|
| QW-1 | D-07 | `ccip-architect.md:3` | "ADR-001..ADR-016" → "актуальный список — docs/decisions/index.md" |
| QW-2 | D-09 | `audit-session-reset.js` | Pruning `governance_alerts[]` — обрезать до последних N=10 при SessionStart |
| QW-3 | D-14 | `aggregate-telemetry.js:38` | Переименовать `CCR` или убрать дубль |
| QW-4 | D-21 | `read-gate.js:12-14` | Унифицировать `isFullRead` — добавить проверку `offset == null` |
| QW-5 | D-06 | `fallback-profiles.json` | Добавить профили для 9 агентов |

### Medium (≤ 1 неделя)

| M | Дефект | Файл | Действие |
|---|--------|------|---------|
| M-1 | D-04 | `post-agent-hook.js:183-187` | Перенести `sanitizeHandoff()` в `sanitize-utils.js`, применить в live-session path |
| M-2 | D-08 | `failure-detectors.js:95-97` | Добавить fsync + write-lock (паттерн из flush-state.js) |
| M-3 | D-10 | `pre-agent-gate.js:26-28` | Считать бюджет из `agent_outputs`, не из `observations` |
| M-4 | D-19 | `pre-agent-gate.js:13,32-33` | Расширить `SECURITY_RE` — проверять scope шага DAG |
| M-5 | D-17 | `quarantine.yaml` | Реализовать инкремент `sessions_in_quarantine` через `audit-session-reset.js` |
| M-6 | D-18 | новый тест | `governance-manifest-integrity.test.js` — enforcement anchors существуют в коде |
| M-7 | D-01/02/03 | `CLAUDE.md` | Явное предупреждение: все block-инварианты в shadow с датой планируемого включения |

### Long-Term (≥ 1 месяц)

| LT | Дефект | Действие |
|----|--------|---------|
| LT-1 | D-01/02/03 | Включить enforcement: `CCIP_GATE_ENFORCE=1`, `CCIP_READGATE_ENFORCE=1` — после integration тестов |
| LT-2 | D-13 | Unicode confusable detection в `sanitizeHandoff()` |
| LT-3 | HA-3 | Верифицировать/задокументировать гарантии порядка Stop hooks в Claude Code runtime |
| LT-4 | UU-3 | Фильтровать `events.jsonl` по `session_id` при чтении в aggregate-telemetry.js |
| LT-5 | UU-4/5 | Стек-based JSON parsing вместо regex в `extractUpdate()` |
| LT-6 | D-06 | Audit-suite тест: для каждого backup-агента из CLAUDE.md существует profile в fallback-profiles.json |

---

## Архитектурные лжи

> **"Machine-Enforced Runtime Governance"** (ADR-018, заголовок)
> Реальность: `governance-manifest.json:49,57,74` — `"status":"shadow"` для всех block-инвариантов. Deny-протокол существует в коде, но не активирован.

> **"each agent MUST end its output with"** (CLAUDE.md:151)
> Реальность: `post-agent-hook.js:133-136` — при пропуске блока: stderr + continue. ADR-017:22: "Observability без enforcement". MUST = SHOULD.

> **"Inject-safety: handoff_notes [...] agents must not copy"** (CLAUDE.md:166)
> Реальность: `sanitizeHandoff()` — только в `execute-dag.js:184`. В `post-agent-hook.js:183-187` — нет. Половина injection-path не защищена.

> **"self-learning rule lifecycle (quarantine→active→deprecated)"** (token-efficiency-auditor)
> Реальность: `quarantine.yaml:15,22,29` — `sessions_in_quarantine: 0` для всех. Self-learning loop декларирован, не реализован.

> **"ADR-001..ADR-016 (актуальный список — docs/decisions/index.md)"** (`ccip-architect.md:3`)
> Реальность: `docs/decisions/index.md` содержит ADR-018. Агент-архитектор не знает о двух последних решениях.

---

## 20. Переоценка после устранения

При устранении всех Critical + High findings (D-01..D-12):

| Dimension | Текущий | После устранения |
|-----------|---------|-----------------|
| Architecture | 58/100 | **74/100** |
| Runtime Governance | 35/100 | **72/100** |
| Enforcement Coverage | 20/100 | **75/100** |
| Observability | 62/100 | **74/100** |
| Reliability | 55/100 | **70/100** |
| Scalability | 40/100 | **58/100** |
| Maintainability | 63/100 | **70/100** |
| Semantic Integrity | 45/100 | **68/100** |
| Security | 48/100 | **70/100** |
| **Среднее** | **47/100** | **70/100** |

Потолок без LT-задач — ~72/100.

---

## Результаты Chaos-сценариев

**C1: `session-state.json` отсутствует** → TOTAL GOVERNANCE COLLAPSE. DAG-sessions падают fatal. Live-sessions продолжают без governance (fail-open во всех hooks).

**C2: `feedback-loop.md` удалён** → PASS с потерей истории. Пересоздаётся при следующем Stop.

**C3: Новый агент без регистрации в CLAUDE.md** → PARTIAL. `agents-changed.flag` сигнализирует, но через Intent-таблицу недостижим. Прямой spawn по имени — работает.

**C4: `ccip-routing-planner` вызван для 2-intent задачи** → OVERENGINEERED, not broken. Нет защиты от misrouting.

**C5: `general-purpose` как fallback для `ccip-backend-core`** → DEGRADE. Для ccip-backend-core профиль есть — контекст инжектируется. Для остальных 8 — полный семантический fallback failure.

---

## Итог

**23 дефекта.** 4 CRITICAL. 8 HIGH. 9 MEDIUM. 2 LOW.
**Architecture Score: 58/100 → 70/100** после устранения.

Главный вывод: система находится в состоянии **observability theatre** — infrastructure наблюдаемости построена, но enforcement выключен. Всё выглядит управляемым, ничто не управляется машинно.

**План ремедиации:** `docs/plans/2026-06-08-defect-remediation.md`
