# Task Routing Index

Этот каталог определяет маршрутизацию рабочих задач проектного агента.

Цель:

* классифицировать задачи;
* определить минимально необходимый контекст;
* исключить загрузку нерелевантных документов;
* уменьшить постоянную нагрузку на контекст.

Основной принцип:

> Перед выполнением задачи агент проходит цепочку §0: Task Type → Phase → Agent → Context. Каждый шаг однозначен и не требует чтения лишних документов.

---

## 0. Unified Routing Chain

Полная цепочка принятия решений для любой задачи — **одна точка входа**:

```
Задача
  → [0] Объявить уровень контекста             L1 / L2 / L3 / L4  (§5 CLAUDE.md)
         └─ Если задача создаёт > 3 файлов → делегировать general-purpose весь блок
  → [0.5] Прочитать Project State              (project-state.md, limit:25)
         └─ §1: текущая фаза, блокеры, open feedbacks
  → [1] Определить Task Type                    (§1)
  → [2] Определить модуль → Фаза               (§1.5)
         ├─ Прочитать phase file секцию        (offset + limit:60 из §1.5)
         └─ Извлечь Priority задачи            ([H]🔴 / [H] / [M] / [L] → §0.4)
  → [3] Definition of Ready                    (definition-of-ready.md + §0.4)
         ├─ Набор чеков определяется Priority  (P1: все; P2: Phase+Dep+Schema; P3: Phase+Dep; P4: Phase)
         ├─ Phase ready?
         ├─ Dependency ready?        (P1, P2, P3)
         ├─ ADR approved?            (P1, P2)
         ├─ Schema ready?            (P1, P2)
         └─ Acceptance Criteria?     (P1)
  → [4] Назначить агента + сформировать Handoff  (agent-handoff.md)
         ├─ Decision tree §1: task_type → fixed agent OR module agent
         ├─ Co-agent conditions §2: priority / DoR result / cross-module
         └─ Заполнить Handoff Bundle §4 перед делегированием
  → [5] Загрузить технический контекст         (arch module + ADR, по §0.1 + T-level §0.3)
  → [6] Проверить межмодульные зависимости     (bounded-context-deps.md §2–§3)
  ══ ВЫПОЛНЕНИЕ ЗАДАЧИ ══
  → [7] Implementation Feedback                (feedback-loop.md)
         ├─ Отметить завершение задачи         (feedback-loop.md §4)
         ├─ При отклонении → классифицировать  (feedback-loop.md §1)
         ├─ Routing: arch / delivery / both    (feedback-loop.md §2)
         └─ Создать FEEDBACK-XXX запись        (feedback-loop.md §3)
```

> Priority (§0.4) определяется на шаге [2] из маркера phase file — до DoR и выбора агента.  
> P1-CRITICAL: все DoR-чеки обязательны; блокер → немедленная эскалация ccip-architect.  
> P4-OPTIONAL: выполнять только после завершения всех P1/P2 модулей.  
> Шаг [6] обязателен если `change_impact = HIGH/CRITICAL`.  
> Шаг [7] обязателен всегда — минимум отметка завершения (§4).

---

### §0.1 Контекст по Task Type × Phase Group

> Агент назначается через `agent-handoff.md §1–§3`. Эта таблица — reference для T-level и обязательных документов.

| Task Type | Phase Group | Execution Agent | T-level | Обязательные документы |
|-----------|-------------|-----------------|---------|------------------------|
| Feature Implementation | 1–3 Foundation | из §1.5 по модулю | T2 | `phase-1-3` + arch module |
| Feature Implementation | 4–7 Backend | из §1.5 по модулю | T2 | `phase-4-7` + arch module + ADR |
| Feature Implementation | 8–13 Infra/Web | из §1.5 по модулю | T2 | `phase-8-13` + arch module |
| Feature Implementation | Mobile | `ccip-mobile` | T2 | `phase-mobile` + arch module |
| Refactoring | любая | из §1.5 по модулю | T2 | phase file + arch module |
| Bug Fix | любая | из §1.5 по модулю | T3 | phase file + error log + arch module |
| Architecture Change | любая | `ccip-architect` | T4 | `core-platform.md` + ADR (обязательно) |
| Research Task | любая | `ccip-architect` | T2 | phase file + arch module |
| Documentation Update | любая | `ccip-doc-writer` | T1 | только редактируемый документ |
| Performance Optimization | любая | из §1.5 по модулю | T2 | phase file + arch module + infra ADR |
| Security Update | любая | `ccip-security` | T3 | phase file + `auth-security.md` + security ADR |

---

### §0.2 Правила разрешения агента

> Полный decision tree — `agent-handoff.md §1–§3`.  
> Краткая справка:

| Task Type | Primary Agent | Источник |
|-----------|--------------|---------|
| Architecture Change | `ccip-architect` | agent-handoff §1 |
| Research Task | `ccip-architect` | agent-handoff §1 |
| Security Update | `ccip-security` | agent-handoff §1 |
| Documentation Update | `ccip-doc-writer` | agent-handoff §1 |
| Все остальные | `module_agent(M-ID)` из §1.5 | agent-handoff §1 + §3 |

Co-agent условия и escalation → `agent-handoff.md §2, §5`.

---

### §0.3 Правила разрешения T-level

| T-level | Когда | Что загружается |
|---------|-------|-----------------|
| T1 | Documentation | только целевой документ |
| T2 | Feature, Refactoring, Performance, Research | phase file + arch module |
| T3 | Bug Fix, Security Update | phase file + error log + arch module |
| T4 | Architecture Change | phase file + core-platform + ADR |

> T-level выше необходимого загружать запрещено (§14).

---

### §0.4 Priority Tiers

Приоритет задачи читается из phase file секции на шаге [2] по маркеру задачи.

| Tier | Маркер в phase file | Описание | DoR | Agent override |
|------|---------------------|----------|-----|----------------|
| **P1-CRITICAL** | `[H] 🔴 CRITICAL PATH` | На критическом пути к MVP; задержка = задержка пилота | Все чеки обязательны | +`ccip-architect` review при T3/T4 |
| **P2-BLOCKING** | `[H]` без 🔴 | Блокирует следующий этап; высокий приоритет | Phase + Dep + Schema | Стандартный агент |
| **P3-REQUIRED** | `[M]` | Нужно для MVP; не блокирует critical path | Phase + Dep | Стандартный агент; допустима параллельность |
| **P4-OPTIONAL** | `[L]` | Нужно до production; не блокирует пилот | Phase только | Любой агент; выполнять после P1/P2 |

#### Priority по модулю (M-ID)

| Tier | Модули |
|------|--------|
| **P1-CRITICAL** | M-00, M-01, M-02, M-03, M-04, M-05a, M-05b, M-05c, M-08, M-10, M-11, M-12, M-13 |
| **P2-BLOCKING** | M-07 (Sync API — `[H]`, параллельный путь к Web App) |
| **P3-REQUIRED** | M-06 (Baseline F/G, GC Change — `[M]`, параллельный трек) |
| **P4-OPTIONAL** | M-M (Mobile — отложен после пилота) |

#### Priority-aware правила

**P1-CRITICAL:**
- DoR: все применимые чеки без исключений
- Агент: стандартный + `ccip-architect` уведомляется если сложность T3/T4
- Блокер на P1 → запись в `project-state.md §3` немедленно + эскалация `ccip-architect`
- Нельзя откладывать или выполнять после P2/P3

**P2-BLOCKING:**
- DoR: Phase + Dependency + Schema (AC опционально)
- Агент: стандартный phase agent
- Выполнять после всех P1 текущей фазы завершены

**P3-REQUIRED:**
- DoR: Phase + Dependency (Schema опционально)
- Агент: стандартный; допустима параллельность с другими P3
- Выполнять параллельно с P1/P2 других фаз если нет прямого блокера

**P4-OPTIONAL:**
- DoR: только Phase check (`project-state.md §2` — фаза модуля ≥ текущей)
- Агент: любой подходящий; минимальный контекст T1
- Начинать только после завершения всех P1 и P2 проекта

---

## 1. Task Categories

Все задачи разделяются на категории:

1. Feature Implementation
2. Refactoring
3. Bug Fix
4. Architecture Change
5. Research Task
6. Documentation Update
7. Performance Optimization
8. Security Update

---

## 1.5. Phase Routing Table

**Единственный авторитетный источник** связи модуль → фаза → phase file → секция → агент.  
Читается на шаге [2] цепочки §0. CLAUDE.md §6 ссылается сюда как на engine.

| M-ID | Модуль / область | Фаза | Phase File | Секция (offset) | Агент(ы) |
|------|-----------------|------|------------|-----------------|----------|
| M-01 | Docker + PostgreSQL + Redis AOF + PgBouncer + Prisma | 1 | `phase-1-3` | `## Этап 1` (offset:9) | `ccip-dba`, `ccip-devops` |
| M-02 | Auth/RBAC, AuditLog, Multi-tenancy middleware | 2 | `phase-1-3` | `## Этап 2` (offset:91) | `ccip-backend-aux` |
| M-03 | Init Module A — Objects, BoQ, weight_coef trigger | 3 | `phase-1-3` | `## Этап 3` (offset:150) | `ccip-backend-core` |
| M-04 | ZeroReport Module B | 4 | `phase-4-7` | `## Этап 4` (offset:11) | `ccip-backend-core` |
| M-05 | PeriodEngine C, DisputeSLA D, Analytics E, BullMQ | 5 | `phase-4-7` | `## Этап 5` (offset:28) | `ccip-backend-core` |
| M-06 | Baseline F/G, GC Change H | 6 | `phase-4-7` | `## Этап 6` (offset:104) | `ccip-backend-core` |
| M-07 | Sync API I | 7 | `phase-4-7` | `## Этап 7` (offset:144) | `ccip-backend-aux` |
| M-08 | Web App — Dashboard, Period Cycle, GP Form | 8 | `phase-8-13` | `## Этап 8` (offset:8) | `ccip-frontend` |
| M-10 | Security / Immutability / RBAC audit | 10 | `phase-8-13` | `## Этап 10` (offset:59) | `ccip-security` |
| M-11 | Testing / SLA Recovery scan | 11 | `phase-8-13` | `## Этап 11` (offset:95) | `ccip-qa` |
| M-12 | Prod Infra / K8s | 12 | `phase-8-13` | `## Этап 12` (offset:133) | `ccip-devops` |
| M-13 | Pilot | 13 | `phase-8-13` | `## Этап 13` (offset:182) | все агенты |
| M-M | Mobile App | post | `phase-mobile` | `## Этап 9` (offset:9) | `ccip-mobile` |

### Правила чтения phase file секции

1. Открыть phase file: `offset:<N> limit:60` — покрывает большинство задач этапа.
2. Если задача не закрылась через 60 строк → читать `offset:<N+60> limit:40`.
3. **Phase file читается обязательно на шаге [2] — до выбора агента и загрузки arch context.**
4. Phase file = источник AC, инвариантов, артефактов и критериев перехода.
5. Arch doc = источник технических деталей реализации (шаг [5]).

### Правило резерва

> Модуль не найден в таблице → `docs/delivery/critical-path.md` (limit:30).  
> Phase file загружается ВМЕСТО `delivery_plan_v1_0.md` — читать delivery_plan запрещено.

---

## 2. Feature Implementation Tasks

Использовать для задач:

* разработка новой функциональности;
* реализация нового use case;
* создание нового workflow;
* добавление новых endpoints.

---

### Required Context:

1. `docs/architecture/index.md`
2. релевантный модуль архитектуры
3. релевантный ADR (если требуется)

---

### Пример:

Если задача:

> добавить новый workflow закрытия периода

читать:

1. `architecture/index.md`
2. `period-engine.md`
3. `ADR-002-period-concurrency.md`

---

## 3. Refactoring Tasks

Использовать для задач:

* улучшение структуры кода;
* изменение внутренней реализации;
* упрощение модулей;
* декомпозиция сервисов.

---

### Required Context:

1. релевантный архитектурный модуль
2. ADR только если затрагивается архитектурный контракт

---

### Правило:

> При refactoring запрещено загружать глобальную архитектуру без необходимости.

---

## 4. Bug Fix Tasks

Использовать для задач:

* исправление ошибок;
* устранение конфликтов;
* исправление некорректного поведения.

---

### Required Context:

1. `docs/errors/index.md`
2. релевантный error log
3. релевантный архитектурный модуль
4. ADR при необходимости

---

### Пример:

Если ошибка:

> конфликт синхронизации

читать:

1. `errors/index.md`
2. `sync-errors.md`
3. `sync-engine.md`
4. `ADR-003-offline-conflict-resolution.md`

---

## 5. Architecture Change Tasks

Использовать для задач:

* изменение архитектурных правил;
* изменение bounded context;
* изменение системных инвариантов.

---

### Required Context:

1. `docs/architecture/core-platform.md`
2. `docs/decisions/index.md`
3. релевантный ADR

---

### Ограничение:

> Архитектурные изменения без чтения ADR запрещены.

---

## 6. Research Tasks

Использовать для задач:

* анализ вариантов решения;
* исследование новых подходов;
* подготовка архитектурных рекомендаций.

---

### Required Context:

1. `core-platform.md`
2. релевантный модуль
3. связанные ADR только при необходимости

---

### Правило:

> Исследовательские задачи не должны загружать error logs без явной необходимости.

---

## 7. Documentation Update Tasks

Использовать для задач:

* обновление документации;
* изменение описаний модулей;
* корректировка ADR;
* обновление инструкций.

---

### Required Context:

1. редактируемый документ
2. связанные документы только по ссылке

---

### Основной принцип:

> При обновлении документа читается только редактируемый раздел документа.

---

## 8. Performance Optimization Tasks

Использовать для задач:

* оптимизация запросов;
* улучшение производительности;
* уменьшение latency;
* ускорение background workers.

---

### Required Context:

1. релевантный архитектурный модуль
2. инфраструктурный ADR
3. error log при наличии проблемы

---

### Пример:

Если задача:

> ускорить sync queue

читать:

1. `sync-engine.md`
2. `ADR-005-sla-scheduler-reliability.md`

---

## 9. Security Update Tasks

Использовать для задач:

* изменение access rules;
* усиление защиты;
* изменение токенов;
* обновление security policy.

---

### Required Context:

1. `auth-security.md`
2. security ADR
3. error log при наличии инцидента

---

### Ограничение:

> Security changes без чтения security ADR запрещены.

---

## 10. Task Routing Workflow

Перед началом выполнения задачи агент обязан пройти цепочку **§0**:

**Pre-execution:**

0. Объявить уровень L1/L2/L3/L4 (§5 CLAUDE.md) — первое действие, до любого tool call;
   — если задача потребует создать > 3 новых файлов → делегировать весь блок `general-purpose`;
0.5. `project-state.md` (limit:25) — текущая фаза, блокеры;
1. по §1 — определить Task Type;
2. по §1.5 — найти модуль → прочитать phase file секцию (offset + limit:60);
   — из секции извлечь маркер `[H]🔴 / [H] / [M] / [L]` → Priority tier (§0.4);
   — P4-OPTIONAL: проверить завершены ли все P1/P2; если нет — отложить, выйти;
3. `definition-of-ready.md §0` — чеки по Priority tier (§0.4);
   — P1: все чеки; P2: Phase+Dep+Schema; P3: Phase+Dep; P4: Phase only;
   — BLOCK → запись в project-state §3 + при P1 эскалация ccip-architect;
4. `agent-handoff.md §1–§2` — decision tree: назначить primary + co-agents;
   — заполнить Handoff Bundle (§4) если делегирование субагенту;
5. по §0.3 (T-level) — загрузить технический контекст (arch module + ADR);
6. если `change_impact = HIGH/CRITICAL` → `bounded-context-deps.md §2` (`depended_by`).

**Post-execution (обязательно):**

7. `feedback-loop.md §4` — отметить завершение задачи в phase file и errors_log;
8. при любом отклонении → `feedback-loop.md §1–§3` — классифицировать, routing, FEEDBACK-запись;
9. при arch воздействии → обновить `architecture/<module>.md` или создать ADR;
10. при delivery воздействии → обновить phase file AC / `critical-path.md` / `definition-of-ready.md`.

> Post-execution шаги 7–10 закрывают feedback loop. Без шага 7 задача считается незавершённой.

---

### Основное правило:

> Нельзя загружать архитектуру, ADR и error logs одновременно без подтвержденной необходимости.

---

## 11. Context Loading Matrix

> Phase File всегда загружается первым (шаг 0 Workflow). Остальное — по типу задачи.

### Feature Implementation

* **phase file** (из §1.5)
* architecture module
* optional ADR

---

### Refactoring

* **phase file** (из §1.5)
* architecture module

---

### Bug Fix

* **phase file** (из §1.5)
* error log
* architecture module
* optional ADR

---

### Architecture Change

* **phase file** (из §1.5)
* core platform
* ADR required

---

### Research

* **phase file** (из §1.5)
* architecture module
* optional ADR

---

### Documentation Update

* target document only

---

### Performance Optimization

* **phase file** (из §1.5)
* architecture module
* infra ADR

---

### Security Update

* **phase file** (из §1.5)
* auth module
* security ADR

---

## 12. Task Loading Levels

### T1 — Minimal Context

Для локальных изменений.

Загружается:

* один документ

---

### T2 — Module Context

Для изменений в одном bounded context.

Загружается:

* модуль + ADR

---

### T3 — Diagnostic Context

Для исправления ошибок.

Загружается:

* error log + модуль + ADR

---

### T4 — Cross-Module Context

Для архитектурных изменений.

Загружается:

* core platform + ADR

---

### Правило:

> Загружать уровень контекста выше необходимого запрещено.

---

## 13. Delegation Rules

Если задача превышает допустимую сложность:

1. определить подзадачи;
2. назначить sub-agent;
3. передать только локальный контекст.

---

### Делегировать обязательно для:

* задач > 450 строк реализации;
* cross-module изменений;
* сложных исследований;
* массового refactoring.

---

### Основной принцип:

> Каждый sub-agent получает только контекст своей подзадачи.

---

## 14. Anti-Overload Rules

Запрещено:

1. читать весь каталог архитектуры;
2. читать все ADR;
3. читать все error logs;
4. читать несколько модулей без причины;
5. читать полные документы вместо нужного раздела.

---

### Основной принцип:

> Любая избыточная загрузка контекста считается архитектурным нарушением.

---

## 15. Read Policy

При любой задаче:

1. сначала читать `docs/tasks/index.md`
2. определить категорию задачи
3. определить нужный модуль
4. определить необходимость ADR
5. определить необходимость error log
6. загрузить минимальный контекст

---

## 16. Main Principle

> Task routing должен направлять агента только к минимальному набору документов, необходимому для выполнения конкретной задачи.
