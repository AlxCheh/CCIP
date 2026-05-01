# CLAUDE.md — Project Orchestration Guide

## 1. Project Context

CCIP (Construction Control & Intelligence Platform) — интеллектуальная платформа контроля строительства.

Назначение системы:

- фиксировать верифицированный факт выполнения работ,
    
- обеспечивать прозрачный контроль прогресса строительства,
    
- предоставлять достоверную аналитику по объекту.
    

Главный принцип:

> Минимизировать загрузку контекста, читать только необходимую информацию, делегировать крупные задачи специализированным агентам.

---

## 2. Global Execution Rules

1. Не читать документы полностью без необходимости.
    
2. Читать только релевантный раздел документа.
    
3. Не изменять архитектурные решения без нового ADR.
    
4. При конфликте источников приоритет имеют ADR.
    
5. Все найденные ошибки и противоречия фиксировать в `docs/errors/errors_log.md`.
    
6. Крупные задачи делегировать субагентам.
    
7. Минимизировать постоянную нагрузку на основной контекст.

8. Перед началом задачи объявить уровень контекста (L1–L4) и загрузить только соответствующий набор документов.
    

---

## 3. Document Routing Map

Определять источник контекста по типу задачи:

- **состояние проекта** → `docs/project-state.md` ← читать первым (limit:25)
- маршрутизация задач → `docs/tasks/index.md`

- архитектура системы → `docs/architecture_v1_0.md`

- архитектурные модули → `docs/architecture/*.md` (индекс: `docs/architecture/index.md`)
    
- бизнес-логика → `docs/concept_oks_v1_5.md`
    
- алгоритмы → `docs/algorithm_v1_3.md`
    
- схема данных → `packages/database/prisma/schema.prisma`
    
- архитектурные решения → `docs/decisions/ADR-*.md` (индекс: `docs/decisions/index.md`)
    
- ошибки и инциденты → `docs/errors/index.md`
    
- общий план разработки → `docs/delivery_plan_v1_0.md`
    
- фазовые этапы реализации → `docs/delivery/*.md`
    

---

## 4. Section Read Policy

При любом запросе на изменение документа:

1. определить нужный раздел,
    
2. читать только этот раздел,
    
3. читать только связанные ADR,
    
4. не читать документ целиком без необходимости.
    

### Техника чтения файлов > 100 строк

Для любого документа длиннее 100 строк:

1. Read с `limit: 30` — увидеть структуру заголовков;
2. определить нужный раздел по заголовкам;
3. Read с `offset` + `limit` — читать только этот раздел.

> Запрещено открывать файл целиком, если нужен один раздел.  
> Экономия: 60–80% токенов на каждом крупном документе.

### Чтение routing-файлов

- `docs/decisions/index.md` — читать с `limit: 80`; §ADR по модулям достаточен для маршрутизации
- `docs/tasks/index.md` — читать только нужную категорию задачи (`offset` + `limit`)

### Запрещено:

- читать полный файл при локальном изменении раздела;
    
- читать архитектуру целиком при задаче по конкретному этапу;
    
- читать все ADR вместо конкретного решения.
    

---

## 5. Context Loading Levels

### L1 — Routing Context

Использовать только `CLAUDE.md`

Для:

- маршрутизации,
    
- определения источников,
    
- локальных правок.
    

---

### L2 — Task Context

Использовать:

- `CLAUDE.md`
    
- релевантный phase file / document section
    

Для:

- выполнения конкретной задачи,
    
- работы в рамках одного этапа.
    

---

### L3 — Architecture Context

Использовать:

- `CLAUDE.md`
    
- phase file
    
- section architecture
    
- связанный ADR
    

Для:

- задач, зависящих от архитектуры.
    

---

### L4 — Full Investigation

Использовать полный набор документов только для:

- cross-module изменений,
    
- архитектурного аудита,
    
- поиска противоречий,
    
- комплексного рефакторинга.
    

---

## 6. Delivery Routing Rules

**Routing engine:** `docs/tasks/index.md §1.5` — единственный авторитетный источник связи модуль → phase file → секция (offset) → агент.

**Policy:**
- Delivery plan (phase files) — первичный источник AC, инвариантов и критериев перехода.
- Architecture docs — источник технических деталей реализации.
- `delivery_plan_v1_0.md` не читать — использовать только phase files через §1.5.

**Порядок при запросах на реализацию:**

1. `docs/project-state.md` (limit:25) — текущая фаза и блокеры;
1.5. если задача затрагивает ≥ 2 доменов → применить **§7.0 Intent Classification**; результат заменяет шаги 2–4.
2. `docs/tasks/index.md §1.5` — найти модуль → phase file → секция (offset);
3. читать phase file секцию: `offset:<N> limit:60`;
4. arch context подключать только при необходимости (шаг [5] цепочки §0).

### Правило:

> Таблица маршрутизации живёт в `docs/tasks/index.md §1.5`.  
> `delivery_plan_v1_0.md` читать запрещено — он заменён phase files с точными section anchors.

---

## 7. Subagent Orchestration

Для снижения нагрузки использовать специализированных субагентов.
Все CCIP-агенты определены в `.claude/agents/`.

### Fast Path (проверять первым — до §7.0–7.7)

| Условие | Действие |
|---|---|
| 1 intent + risk=`LOW` + agent NOMINAL (или нет записей в feedback-loop.md) | прямой route к specialist, пропустить §7.0–7.7 |
| всё остальное | полный pipeline: §7.3 → §7.0 → §7.7 → fallthrough §7.1–7.4 |

Примеры fast path: исправить текст UI, добавить поле в документацию, прочитать логи, обновить конфиг.

> Fast path — short-circuit для ~60–70% простых задач. Устраняет overhead полного pipeline там, где он не нужен.

---

### Architecture Pipeline

    User Task
     ↓
    [0] Fast Path ──────────────────→ trivial: прямой route, минуя все слои
     ↓ non-trivial
    [1] Intent Classifier (§7.0) ── intents + risk classification
     ↓
    [2] Planner Agent (§7.5) ─────── light mode (HIGH) или full DAG (MEDIUM/LOW)
     ↓
    [3] Routing Policy Engine (§7.7) AND-условия → candidate agents
     ↓
    [4] Agent Scoring (§7.1+§7.2+§7.4) confidence + coverage + cost → final selection
     ↓
    [5] Execution DAG ─────────────── параллельные и последовательные шаги
     ↓
    [6] Feedback Metrics (§7.3+§7.6) наблюдения → агрегация
     ↓
    [7] Routing Optimizer (§7.8) ─── метрики → обновление политик

---

### 7.0 — Intent Classification Layer

**Intent taxonomy используется во всём pipeline §7.1–7.7. Классифицировать intents для любой задачи, не прошедшей fast path — включая однодоменные (нужны для policy match в §7.7).**

Схема:

    User Task → Intent Classifier → [ARCH][SCHEMA][PERF][SECURITY]... → Multi-route Planner → Parallel Agents

**Intent taxonomy:**

| Intent | Агент |
|---|---|
| `ARCH` | `ccip-architect` (лид при наличии) |
| `SCHEMA` | `ccip-dba` |
| `BACKEND_CORE` | `ccip-backend-core` |
| `BACKEND_AUX` | `ccip-backend-aux` |
| `FRONTEND` | `ccip-frontend` |
| `MOBILE` | `ccip-mobile` |
| `DEVOPS` | `ccip-devops` |
| `QA` | `ccip-qa` |
| `SECURITY` | `security-reviewer` (co-agent, всегда параллельно) |
| `ORCHESTRATION` | `ccip-session-optimizer` / `ccip-navigator-optimizer` |
| `PRODUCT` | `ccip-product-owner` |
| `DOC` | `ccip-doc-writer` |

**Правила планировщика:**

- 1 intent → одиночный агент (стандартный routing §1.5)
- 2+ intents → параллельные агенты; `ccip-architect` координирует при наличии `ARCH`
- `SECURITY` intent → `security-reviewer` запускается co-agent независимо
- `ARCH` intent → `ccip-architect` всегда лид

**Выход классификатора:**

```json
{
  "task": "<краткое описание>",
  "intents": ["ARCH", "ORCHESTRATION", "PERF"],
  "confidence": "MEDIUM",
  "lead_agent": "ccip-architect",
  "parallel_agents": ["ccip-session-optimizer", "ccip-devops"],
  "routing": "multi-agent"
}
```

**Когда НЕ применять:** задача однодоменная; L1-routing; агент задан явно.

---

### 7.1 — Confidence-Based Routing

> Числовые score [0,1] ненадёжны для LLM: используется 3-tier категориальная система по структурным признакам.

**Tier taxonomy:**

| Tier | Условие | Политика |
|---|---|---|
| `HIGH` | 1 intent, агент однозначен из таблицы §7 | direct route → агент |
| `MEDIUM` | 2+ intents ИЛИ агент неочевиден ИЛИ ≥ 2 модуля | route + `ccip-architect` review параллельно |
| `LOW` | `ARCH` intent ИЛИ cross-module ИЛИ изменение ADR/delivery ИЛИ новая фича с рисками | planner escalation: `ccip-architect` лид → декомпозиция → агенты |

**Эскалационная цепочка:**

    HIGH   → agent (прямой вызов)
    MEDIUM → agent + ccip-architect (параллельно)
    LOW    → ccip-architect → декомпозиция → parallel agents

**Правила определения tier (детерминированные):**

- `HIGH`: ровно 1 intent + агент однозначно из таблицы §7
- `MEDIUM`: 2 intent ИЛИ агент неочевиден ИЛИ задача упоминает ≥ 2 модуля
- `LOW`: присутствует `ARCH` intent ИЛИ cross-module ИЛИ затронут ADR/delivery ИЛИ новая фича

**Когда НЕ применять:** L1-routing (только CLAUDE.md, tier не нужен).

---

### 7.2 — Dynamic Agent Selection

> Статический mapping (`PeriodEngine → ccip-backend-core`) игнорирует покрытие доменов задачи. Вместо runtime-метрик (load, cache) используется единственная наблюдаемая метрика — **expertise coverage**.

**Coverage taxonomy:**

| Coverage | Условие | Решение |
|---|---|---|
| `FULL` | агент покрывает все домены задачи | specialist → direct |
| `PARTIAL` | агент покрывает основной домен, но не все | specialist если `HIGH` confidence, иначе `general-purpose` |
| `NONE` | ни один специалист не покрывает primary domain | `general-purpose` |

**Условия выбора `general-purpose` вместо специалиста:**

- 4+ intents без явного лид-домена
- задача требует генерации > 150 строк кода (§7, правило делегирования п.3)
- все matched агенты имеют `MEDIUM` confidence и нет `ARCH` intent
- задача исследовательская (требования неясны, нет AC)

**Условия когда специалист всегда выигрывает:**

- задача затрагивает `ARCH`, `SECURITY` или `SCHEMA` — только профильный агент
- есть явный ADR или delivery impact — `ccip-architect` независимо от coverage

**Порядок выбора агента:**

    1. Определить intents (§7.0)
    2. Определить confidence tier (§7.1)
    3. Проверить coverage specialist-агентов
    4. Применить fallback rules выше
    5. Если coverage PARTIAL + tier MEDIUM → general-purpose

**Когда НЕ применять:** задача с 1 intent и очевидным специалистом (`HIGH` coverage).

---

### 7.3 — Feedback Routing Loop

> `feedback-loop.md` пишется, но на routing не влияет — это tarpipe. §7.3 закрывает цикл: наблюдение → agent status → routing decision.
>
> **Tier 3 — delayed value:** day-1 ценность = 0. Механизм активируется после ≥ 3 наблюдений по агенту. Инвестиция в надёжность, не немедленный эффект.

**Observation format** (писать в `docs/tasks/feedback-loop.md` после каждого reroute или failure):

```json
{
  "agent": "ccip-backend-core",
  "session": "<YYYY-MM-DD>",
  "outcome": "rerouted | success | partial",
  "context_tokens": 14000,
  "reason": "<причина reroute или ошибки>"
}
```

**Agent status taxonomy:**

| Status | Условие | Эффект на routing |
|---|---|---|
| `NOMINAL` | default / success ≥ 3 подряд | стандартный routing §7.0–7.2 |
| `DEGRADED` | reroute наблюдался ≥ 2 раз подряд | добавить `general-purpose` co-agent |
| `SUSPENDED` | reroute ≥ 4 подряд ИЛИ critical failure | `general-purpose` лид, specialist → co-reviewer |

**Threshold rules (детерминированные):**

- reroute ≥ 2 подряд → `DEGRADED`
- reroute ≥ 4 подряд → `SUSPENDED`
- context_tokens > 20 000 систематически (≥ 3 сессии) → флаг для `ccip-session-optimizer`
- success без reroute ≥ 3 подряд → сброс в `NOMINAL`

**Протокол сессии:**

1. В начале сессии с изменениями читать `docs/tasks/feedback-loop.md` (limit:20)
2. Проверить статус агентов по threshold rules выше
3. При `DEGRADED` — добавить `general-purpose` co-agent к routing decision
4. При `SUSPENDED` — инвертировать роли: `general-purpose` лид, specialist reviewer
5. После сессии зафиксировать outcome в `feedback-loop.md`

**Когда НЕ применять:** первый вызов агента; нет записей в `feedback-loop.md` по агенту. Для агрегации накопленных наблюдений → §7.6.

---

### 7.4 — Context Cost-Aware Routing

> При эквивалентном покрытии задачи (§7.2) система должна предпочитать агента с меньшим context cost. `quality/token_cost` не вычислим до запуска — используются статические cost tiers по документному профилю агента.

**Agent cost tiers:**

| Tier | Агенты | Типичный контекст |
|---|---|---|
| `LIGHT` | `ccip-session-optimizer`, `ccip-navigator-optimizer`, `ccip-claude-md-auditor` | CLAUDE.md + session logs — 1–5k tokens |
| `MEDIUM` | `ccip-backend-core`, `ccip-backend-aux`, `ccip-dba`, `ccip-frontend`, `ccip-mobile`, `ccip-devops`, `ccip-qa`, `ccip-security`, `ccip-product-owner`, `ccip-doc-writer` | phase file + arch section — 5–15k tokens |
| `HEAVY` | `ccip-architect`, `general-purpose`, `consistency-checker` | cross-module arch + ADRs — 15k+ tokens |

**Tiebreaker rule:**

- два агента с эквивалентным coverage → предпочесть меньший tier
- только `HEAVY` имеет `FULL` coverage → `HEAVY` обязателен
- `ARCH` / `SECURITY` intent → `HEAVY` обязателен независимо от tier (§7.2 override)

**Budget gate — при перегруженной сессии (> 60% context window):**

- `HEAVY` → заменить на `MEDIUM` агент + точный `offset`+`limit`
- `MEDIUM` → добавить явные `offset`+`limit` ограничения на все reads
- `LIGHT` → без изменений

**Связь с §7.3:** если avg_tokens агента систематически > 20 000 (≥ 3 наблюдения в feedback-loop.md) → апгрейд его tier до `HEAVY`.

**Итоговый порядок routing pipeline:**

    Полный pipeline — см. §7.7 (итоговая схема с fast path и policy gate).

**Когда НЕ применять:** только один агент имеет нужное покрытие — cost тогда не влияет на выбор.

---

### 7.5 — Planner Agent (Orchestration Brain)

> §7.0–7.4 — declarative routing: rule → agent. §7.5 добавляет уровень выше: для сложных задач вместо одного agent вызывается planner, который производит execution DAG.

**Planner активируется для всех non-fast-path задач** в одном из двух режимов:

- **Light mode** (HIGH confidence, 1–2 intents): подтвердить intents + risk, вернуть оценку сложности. DAG не строится. Передать в §7.7.
- **Full mode** (MEDIUM/LOW confidence или 3+ intents): полная декомпозиция + execution DAG с зависимостями и retry policy.

**Когда НЕ активировать:** только Fast Path (trivial: 1 intent + LOW risk + NOMINAL agent).

**Execution model:**

    Task → ccip-routing-planner → execution DAG → основной контекст исполняет:
        step 1: sequential agent
        step 2: parallel agents (один Agent-вызов с несколькими субагентами)
        step 3: sequential validator

**Planner производит, не исполняет.** Граф исполняется основным контекстом через параллельные и последовательные вызовы Agent-инструмента.

**Retry policy:**

- `step-level` — при failure перезапускать только упавший шаг
- `full-restart` — только если упал step 1 (архитектурная основа)

**Итоговый routing pipeline с учётом planner:**

    §7.3 feedback → §7.0 intents → §7.1 confidence
        HIGH / MEDIUM (≤2 intents): §7.2 coverage → §7.4 cost → agent
        LOW / 3+ intents:           §7.5 planner → DAG → parallel agents

---

### 7.6 — Routing Observability

> §7.3 собирает наблюдения, но без агрегации данные мертвы. §7.6 — aggregation layer: какие метрики наблюдаемы, как агрегировать, когда и что делать.

**Метрики и наблюдаемость:**

| Метрика | Наблюдаема | Источник |
|---|---|---|
| `reroute_rate` | ✅ | outcome="rerouted" / total в feedback-loop.md |
| `fallback_rate` | ✅ | PARTIAL coverage → general-purpose / total routings |
| `success_rate` | ✅ | outcome="success" / total в feedback-loop.md |
| `avg_cost_tier` | ✅ proxy | распределение LIGHT/MEDIUM/HEAVY вызовов агента |
| `routing_accuracy` | ❌ | требует ретроспективной оценки человеком |
| `agent_latency` | ❌ | не экспонируется в Claude Code |

**Aggregated metrics schema** (per agent, еженедельно):

```json
{
  "agent": "ccip-architect",
  "period": "YYYY-WXX",
  "observations": 12,
  "reroute_rate": 0.25,
  "fallback_rate": 0.08,
  "success_rate": 0.75,
  "dominant_cost_tier": "HEAVY",
  "status": "DEGRADED"
}
```

**Action thresholds:**

| Метрика | Порог | Действие |
|---|---|---|
| `reroute_rate` | > 0.25 | agent status → `DEGRADED` (§7.3) |
| `reroute_rate` | > 0.50 | agent status → `SUSPENDED` (§7.3) |
| `fallback_rate` | > 0.30 | пересмотреть описание агента и routing rules |
| `success_rate` | < 0.60 | флаг для `ccip-routing-planner`: усилить декомпозицию |
| HEAVY доминирует ≥ 3 сессии | — | апгрейд cost tier (§7.4) |

**Reporting protocol:**

1. `ccip-claude-md-auditor` агрегирует наблюдения из `docs/tasks/feedback-loop.md` еженедельно
2. Записывает агрегат в `docs/tasks/feedback-loop.md` (секция `## Metrics`)
3. Применяет action thresholds → обновляет agent status (§7.3)
4. При `fallback_rate > 0.30` — создаёт FEEDBACK-запись для routing review

**Когда НЕ агрегировать:** < 3 наблюдений по агенту — недостаточно для значимых метрик.

---

### 7.8 — Routing Optimizer

> Замыкает архитектурный цикл: §7.6 агрегирует метрики → §7.8 применяет их к обновлению §7.7 policy table и agent scoring rules. Без оптимизатора feedback data накапливается, но система не обучается.

**Входные данные:** агрегированные метрики из §7.6 (reroute_rate, fallback_rate, success_rate, dominant_cost_tier).

**Action table:**

| Сигнал | Действие |
|---|---|
| `reroute_rate > 0.25` по агенту | добавить co-agent или заменить в policy table (§7.7) |
| `fallback_rate > 0.30` по агенту | пересмотреть описание агента в таблице маршрутизации |
| `success_rate < 0.60` по агенту | добавить `ccip-architect` review в policy |
| HEAVY tier доминирует ≥ 3 сессии | апгрейд cost tier (§7.4); добавить budget gate constraint |
| policy match rate < 20% | пересмотреть §7.7 policy table — добавить недостающие условия |

**Кто исполняет:** `ccip-claude-md-auditor` — еженедельно, после §7.6 aggregation.

**Что обновляется:**

- §7.7 policy table — добавление/изменение политик по наблюдениям
- §7.3 agent status — DEGRADED/SUSPENDED по threshold rules
- §7.4 cost tiers — при систематическом HEAVY usage
- `docs/tasks/feedback-loop.md §Metrics` — архив обновлений оптимизатора

**Когда НЕ применять:** < 3 наблюдений; первые 2 недели — данных недостаточно для значимых решений.

---

### 7.7 — Policy-Based Routing

> Rule-based: `if auth → backend-aux`. Policy-based: `when (intent=BACKEND_AUX AND risk=HIGH) → [backend-aux + security-reviewer]`. Разница — AND-условия + risk dimension, которого нет в §7.0–7.4.
>
> **Tier 2 для CCIP:** auth, multi-tenancy, RLS — core домен, не edge cases. Без policy engine HIGH-risk задачи тихо маршрутизируются без `security-reviewer`. Проверять до §7.1–7.4 pipeline.

**Risk taxonomy (определяется по ключевым словам задачи):**

| Risk | Признаки | Примеры |
|---|---|---|
| `HIGH` | auth, JWT, RLS, tenant_id, immutability, ADR, breaking migration, new feature | изменить Auth flow, добавить RLS policy |
| `MEDIUM` | schema, state machine, API endpoint, sync, period transition | новый endpoint, изменение schema |
| `LOW` | analytics, report, docs, config, read-only, dashboard | обновить UI, читать логи |

**Policy table** (первая совпавшая policy выигрывает — сортировка по приоритету):

| Policy | when.intents | when.risk | when.confidence | Routing |
|---|---|---|---|---|
| `multi-tenant-critical` | BACKEND_AUX + SECURITY | HIGH | any | ccip-backend-aux + ccip-architect + security-reviewer |
| `auth-high` | BACKEND_AUX | HIGH | any | ccip-backend-aux + security-reviewer (co) |
| `immutability-guard` | BACKEND_CORE | HIGH | any | ccip-backend-core + ccip-architect (review) |
| `schema-guarded` | SCHEMA | MEDIUM–HIGH | any | ccip-dba + ccip-architect (review) |
| `arch-lead` | ARCH | any | any | ccip-architect (lead) + domain specialist |
| `new-feature-risky` | any | HIGH | LOW | §7.5 planner |
| `cross-module-medium` | 3+ intents | MEDIUM | any | §7.5 planner |
| `readonly-direct` | any | LOW | HIGH | domain specialist, без co-agent |

**Matching algorithm:**

1. Определить intents (§7.0) и risk level (таблица выше)
2. Пройти policy table сверху вниз — взять первое совпадение
3. Policy определяет candidate agents; §7.3 статус проверяется — DEGRADED/SUSPENDED заменяется
4. Если ни одна policy не совпала → полный agent pool передаётся в Agent Scoring (§7.1+7.2+7.4)
5. При policy match → Agent Scoring (§7.1+7.2+7.4) применяется для валидации и cost check

**Итоговый routing pipeline (полный):**

    §7.0 Intent Classifier → §7.5 Planner → §7.7 Policy Engine
        ↓ candidate agents
    Agent Scoring: §7.1 confidence + §7.2 coverage + §7.4 cost → final selection
        ↓
    Execution DAG → §7.3 Feedback → §7.8 Optimizer

**Расширение:** добавить новую policy = добавить строку в таблицу выше. Менять pipeline не нужно.

---

### Таблица маршрутизации

| Агент | Когда использовать |
|---|---|
| `ccip-architect` | ADR review, архитектурные решения, code review PeriodEngine/Auth/Analytics |
| `ccip-backend-core` | PeriodEngine, DisputeSLA, Analytics, BullMQ workers, state machine |
| `ccip-backend-aux` | Auth/RBAC, multi-tenancy, AuditLog, Sync API, Notifications |
| `ccip-dba` | Prisma schema, миграции, pg_partman, MV refresh, PgBouncer, RLS |
| `ccip-frontend` | React Web App — дашборд, цикл периода, карточка верификации |
| `ccip-mobile` | React Native, офлайн-режим, WatermelonDB, sync, фотофиксация |
| `ccip-devops` | Docker/K8s, CI/CD, SLA Worker конфиг, Redis AOF, observability |
| `ccip-qa` | Тесты A-01..I-03, Jest, Playwright E2E, RBAC матрица, performance |
| `ccip-security` | RBAC аудит, multi-tenancy изоляция, immutability check, pen-test prep |
| `security-reviewer` | Параллельный co-agent при любых изменениях M-02 (Auth/RBAC/multi-tenancy): JWT, RLS, RBAC guards, tenant isolation |
| `ccip-product-owner` | Бизнес-логика, acceptance criteria, трансляция Концепции в задачи |
| `ccip-doc-writer` | Документация, ADR, user guides, обновление delivery docs |
| `ccip-claude-md-auditor` | Еженедельный аудит CLAUDE.md — актуальность ссылок, синхронизация агентов, дедупликация |
| `ccip-navigator-optimizer` | Синхронизация навигационного слоя — согласованность L1–L4 и T1–T4, покрытие task categories, routing loops, дублирование между CLAUDE.md и tasks/index.md |
| `ccip-session-optimizer` | Аудит сессии — избыточные reads, широкие Glob, нарушения §10, пропущенный параллелизм |
| `ccip-routing-planner` | Orchestration Planner — универсальный для всех non-fast-path задач: light mode (HIGH confidence, без DAG) или full mode (MEDIUM/LOW, 3+ intents, полный DAG). Слой [2] в Architecture Pipeline |

### Общие агенты

- `general-purpose` — задача > 150 строк кода / генерация большого документа
- `doc-optimizer` — оптимизация и дедупликация документации
- `consistency-checker` — поиск противоречий между architecture, ADR, schema, delivery docs

### Правила делегирования

1. Задача в рамках одного модуля → профильный CCIP-агент.
2. Cross-module задача → `ccip-architect` + профильный агент.
3. Документация > 200 строк → `ccip-doc-writer` или `general-purpose`.
4. Создание серии файлов (> 3 штук или > 200 строк суммарно) → `general-purpose`.
5. Противоречия между docs → `consistency-checker`.

---

## 8. Weekly CLAUDE.md Audit

Каждый понедельник в 09:00 автоматически запускается `ccip-claude-md-auditor`.

**Триггер полного аудита** — за прошедшие 7 дней появились:
- новый ADR в `docs/decisions/`
- новый агент в `.claude/agents/`
- изменения в `docs/delivery/` или `docs/architecture/`

**Триггер быстрой проверки** — изменений не было, только дедупликация и dead links.

Результат каждого запуска фиксируется в `docs/errors/errors_log.md`.

Цель:

> поддерживать `CLAUDE.md` минимальным, актуальным и синхронизированным с реальным состоянием проекта.

---

## 9. Error Log Protocol

В начале любой сессии с изменениями:

1. открыть `docs/errors/errors_log.md` с `limit: 30` — убедиться в отсутствии актуальных ошибок по области.

Перед внесением изменений:

1. открыть соответствующий раздел `docs/errors/errors_log.md`;
    
2. проверить известные ошибки по области.
    

После внесения изменений:

1. добавить запись в `docs/errors/errors_log.md` с описанием задачи и внесённых изменений.

При обнаружении новой ошибки:

1. зафиксировать проблему,
    
2. указать контекст,
    
3. указать решение или статус.
    

Любые:

- противоречия,
    
- архитектурные расхождения,
    
- найденные ошибки
    

обязательно фиксируются в `docs/errors/errors_log.md`.

При наличии архитектурного или delivery воздействия — дополнительно:

> `docs/tasks/feedback-loop.md` — классификация находки, routing к arch/delivery агенту, создание FEEDBACK-записи.

---

## 10. Forbidden Actions

Запрещено:

1. читать полный документ без необходимости;
    
2. менять ADR без нового ADR;
    
3. изменять нерелевантные разделы;
    
4. игнорировать `errors_log.md`;
    
5. генерировать большие документы в основном контексте;
    
6. подключать архитектурный контекст без необходимости;
    
7. загружать полный delivery plan вместо phase file;
    
8. создавать серию файлов (> 3 штук или > 200 строк суммарно) в основном контексте без делегирования субагенту.

9. открывать любой файл > 100 строк без `limit:30` в первом вызове — сначала структура, потом `offset`+`limit` по нужному разделу.

10. начинать задачу без объявления уровня контекста L1/L2/L3/L4 — уровень объявляется первой строкой до любого tool call.


---

## 11. Main Operational Principle

Основной принцип работы:

> Загружать минимально необходимый контекст для выполнения задачи.

Порядок действий:

1. определить тип задачи;
    
2. выбрать минимальный источник;
    
3. загрузить только нужный раздел;
    
4. делегировать крупные задачи субагенту;
    
5. зафиксировать найденные ошибки.
    

---

## 12. Context Hierarchy

Последовательность загрузки контекста:

`CLAUDE.md`  
→ `phase file`  
→ `architecture section`  
→ `ADR`  
→ `full docs`

### Правило:

> Не переходить на следующий уровень без необходимости.

---

## 13. Efficiency Target

Цель orchestration layer:

- уменьшать расход контекста;
    
- ускорять выполнение задач;
    
- предотвращать избыточное чтение документации;
    
- централизовать маршрутизацию задач;
    
- делегировать тяжелые операции специализированным агентам.
    

Главный KPI:

> максимальная точность при минимальном объеме загруженного контекста.

---

## 14. Verification

Перед началом любой задачи:

1. Сформулировать, **как будет проверен результат** — конкретный критерий или команда.
2. Озвучить способ проверки пользователю до начала работы.
3. Если способ проверки придумать невозможно — **сообщить об этом и попросить уточнить задачу** перед тем, как приступать.

### Примеры критериев проверки:

- код → тест проходит / компилируется;
- документ → раздел присутствует с нужным содержимым;
- миграция → схема соответствует ожидаемой структуре;
- API → endpoint возвращает корректный ответ.

### Запрещено:

- начинать задачу без озвученного критерия проверки;
- считать задачу выполненной без фактической проверки результата.

---

## 15. Runtime State Protocol

**Уровень применения:** L2+ (любая сессия с вызовом ≥ 2 агентов).

State file: `CCIP/.claude/runtime/session-state.json`
Схема и протокол: `CCIP/.claude/runtime/state-protocol.md`

### Два режима исполнения

| Режим | Когда | Execution |
|---|---|---|
| **Manual** | fast-path, 1 агент, LOW risk | Основной контекст вызывает `Agent` напрямую |
| **Automated** | planner DAG, 2+ агентов, MEDIUM/LOW confidence | `node execute-dag.js` — LLM не в execution loop |

### Жизненный цикл

| Шаг | Когда | Действие |
|---|---|---|
| **INIT** | Перед любым multi-agent execution | Заполнить: `session_id`, `task`, `intents`, `risk`, `confidence`, `routing`, `dag[]`, `started_at`, `status→planning` |
| **EXECUTE** | После INIT (routing=planner) | `node CCIP/.claude/runtime/execute-dag.js` — запускает все шаги DAG автоматически |
| **UPDATE** | После каждого шага (автоматически) | PostToolUse hook + executor записывают `agent_outputs[name]` + `observations[]` |
| **FLUSH** | Stop hook (автоматически) | `flush-state.js` переносит `observations[]` → `feedback-loop.md §4` |

### Automated execution — порядок действий

```
1. Классифицировать intents (§7.0)
2. Вызвать ccip-routing-planner → получить DAG JSON
3. Записать в session-state.json:
   - session_id, task, intents, risk, confidence, routing="planner"
   - dag: [...] (из planner output)
   - started_at, status="planning"
4. node CCIP/.claude/runtime/execute-dag.js
   ↳ executor обходит dag[] волнами (parallel → sequential)
   ↳ каждый шаг: claude --print subprocess с полным доступом к tools
   ↳ state обновляется после каждого шага
5. Проверить session-state.json → status="done"
```

```bash
# Запустить все шаги:
node CCIP/.claude/runtime/execute-dag.js

# Dry-run — проверить план без запуска агентов:
node CCIP/.claude/runtime/execute-dag.js --dry-run

# Resume — пропустить done-шаги, сбросить failed/running → pending, продолжить:
node CCIP/.claude/runtime/execute-dag.js --resume

# Preview что будет resumed без запуска:
node CCIP/.claude/runtime/execute-dag.js --resume --dry-run
```

### Checkpoint / Resume — поведение по статусам

| Статус шага | Без флагов | `--resume` |
|---|---|---|
| `done` | пропускается | пропускается |
| `pending` | выполняется | выполняется |
| `failed` | пропускается (не ретраится) | сбрасывается → `pending`, выполняется |
| `running` | выполняется заново | сбрасывается → `pending`, выполняется |

> Если `status: "done"` у сессии и нет `--resume` → executor завершается без запуска. Для полного перезапуска — сбросить `session-state.json` к шаблону.

### Обязательный блок Session Context (инъекция в Agent prompt)

```
## Session Context
Task: <state.task>
Intents: <state.intents>
Risk: <state.risk> | Routing: <state.routing>
Previous agents: <state.agent_outputs — summary + handoff_notes>
Your step: <state.dag[current_step].scope>  ← если routing=planner
```

### Формат agent_output (писать после каждого агента)

```json
{
  "summary": "≤ 3 предложения о сделанном",
  "artifacts": ["path/to/changed/file"],
  "handoff_notes": "Что нужно знать следующему агенту"
}
```

### Формат observation (писать после каждого агента)

```json
{
  "agent": "ccip-architect",
  "outcome": "success | rerouted | partial",
  "context_tokens": 14000,
  "reason": ""
}
```

### Запрещено

- Вызывать 2+ агентов без инициализации state (`session_id` пустой → INIT обязателен).
- Игнорировать `handoff_notes` предыдущего агента.
- Запускать `flush-state.js` вручную — Stop hook делает это автоматически.
