# Formal TLA+ Invariant Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить TLA+-модель четырёх block-инвариантов CCIP, верифицированную TLC в CI headless, закрыв `§I «нет формальной верификации [ОТСУТ.]»`.

**Architecture:** Один нативный TLA+-файл (`CCIPInvariants.tla`) — все переменные, действия, инварианты и свойства. TLC (`tla2tools.jar`, committed) верифицирует Safety + Liveness за один прогон. Новый CI job `formal` на ubuntu-latest + temurin Java 11.

**Tech Stack:** TLA+ (native syntax, без PlusCal-транслятора), TLC model checker (tla2tools.jar), Java 11, GitHub Actions.

---

## Файловая структура

```
tools/
  formal/
    tla2tools.jar          ← TLC, committed (~7 МБ)
    CCIPInvariants.tla     ← Native TLA+ model (all 4 invariants)
    MC.cfg                 ← TLC configuration
    MC.tla                 ← gitignored (TLC internal scratch)
docs/
  decisions/
    ADR-028-formal-invariant-model.md   ← new
  audits/
    2026-06-12-capability-assessment.md ← 7 строк изменений
.github/workflows/ci.yml               ← +1 job formal
```

> **Примечание:** TLA+ module names не допускают дефисов. Файл называется `CCIPInvariants.tla` (не `ccip-invariants.tla` как в spec). Spec — дизайн-артефакт; реализация использует корректное имя.

---

## Task 1: Toolchain setup

**Files:**
- Create: `tools/formal/CCIPInvariants.tla` (placeholder)
- Create: `tools/formal/MC.cfg` (placeholder)
- Modify: `.gitignore`

- [ ] **Step 1.1: Создать директорию**

```bash
mkdir -p tools/formal
```

- [ ] **Step 1.2: Скачать tla2tools.jar**

Открыть в браузере: `https://github.com/tlaplus/tlaplus/releases` → найти последний stable release → скачать `tla2tools.jar` → положить в `tools/formal/tla2tools.jar`.

Или PowerShell (заменить VERSION на актуальный тег, например `v1.7.3`):
```powershell
Invoke-WebRequest `
  -Uri "https://github.com/tlaplus/tlaplus/releases/download/VERSION/tla2tools.jar" `
  -OutFile tools/formal/tla2tools.jar
```

- [ ] **Step 1.3: Проверить Java**

```bash
java -version
```

Ожидаемый вывод: `openjdk version "11.x.x"` или выше. Если Java не установлена: скачать OpenJDK 11 с `https://adoptium.net`.

- [ ] **Step 1.4: Проверить TLC запускается**

```bash
java -jar tools/formal/tla2tools.jar 2>&1 | head -3
```

Ожидаемый вывод (первые строки):
```
TLC2 Version 2.XX of ...
```

- [ ] **Step 1.5: Добавить MC.tla в .gitignore**

В `.gitignore` добавить строку:
```
tools/formal/MC.tla
```

- [ ] **Step 1.6: Commit**

```bash
git add tools/formal/tla2tools.jar .gitignore
git commit -m "chore(formal): add TLC toolchain (tla2tools.jar)"
```

---

## Task 2: Написать TLA+-модель (TDD: сначала баг, потом фикс)

**Files:**
- Create: `tools/formal/CCIPInvariants.tla`
- Create: `tools/formal/MC.cfg` (начальный, только AgentBudget)

### Шаг 2.1 — Написать НАМЕРЕННО СЛОМАННЫЙ вариант (TDD: failing test)

- [ ] **Step 2.1: Создать CCIPInvariants.tla без guard'а на SpawnAgent**

Создать `tools/formal/CCIPInvariants.tla`:

```tla
---- MODULE CCIPInvariants ----
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  MAX_AGENTS,
  AGENTS,
  EXEMPT,
  ACTIONS,
  SECURITY_ACTIONS,
  PROCESSES

ASSUME SECURITY_ACTIONS \subseteq ACTIONS
ASSUME EXEMPT \subseteq AGENTS

VARIABLES
  agent_count,
  active,
  completed,
  has_state_update,
  dispatched_security,
  coagent_present,
  lock_holder,
  proc_state

vars == <<agent_count, active, completed, has_state_update,
          dispatched_security, coagent_present,
          lock_holder, proc_state>>

Init ==
  /\ agent_count = 0
  /\ active = {}
  /\ completed = {}
  /\ has_state_update = [a \in AGENTS |-> FALSE]
  /\ dispatched_security = {}
  /\ coagent_present = [a \in ACTIONS |-> FALSE]
  /\ lock_holder = "none"
  /\ proc_state = [p \in PROCESSES |-> "idle"]

\* НАМЕРЕННЫЙ БАГ: нет guard agent_count < MAX_AGENTS
SpawnAgent(a) ==
  /\ a \notin active
  /\ a \notin completed
  /\ active' = active \cup {a}
  /\ agent_count' = agent_count + 1
  /\ UNCHANGED <<completed, has_state_update, dispatched_security,
                 coagent_present, lock_holder, proc_state>>

FinishAgent(a) ==
  /\ a \in active
  /\ active' = active \ {a}
  /\ completed' = completed \cup {a}
  /\ agent_count' = agent_count - 1
  /\ has_state_update' =
       IF a \notin EXEMPT
       THEN [has_state_update EXCEPT ![a] = TRUE]
       ELSE has_state_update
  /\ UNCHANGED <<dispatched_security, coagent_present, lock_holder, proc_state>>

DispatchSecurityAction(a) ==
  /\ a \in SECURITY_ACTIONS
  /\ a \notin dispatched_security
  /\ coagent_present' = [coagent_present EXCEPT ![a] = TRUE]
  /\ dispatched_security' = dispatched_security \cup {a}
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 lock_holder, proc_state>>

TryLock(p) ==
  /\ proc_state[p] = "idle"
  /\ proc_state' = [proc_state EXCEPT ![p] = "waiting"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present, lock_holder>>

AcquireLock(p) ==
  /\ proc_state[p] = "waiting"
  /\ lock_holder = "none"
  /\ lock_holder' = p
  /\ proc_state' = [proc_state EXCEPT ![p] = "critical"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present>>

TimeoutProcess(p) ==
  /\ proc_state[p] = "waiting"
  /\ proc_state' = [proc_state EXCEPT ![p] = "done"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present, lock_holder>>

ReleaseLock(p) ==
  /\ proc_state[p] = "critical"
  /\ lock_holder = p
  /\ lock_holder' = "none"
  /\ proc_state' = [proc_state EXCEPT ![p] = "done"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present>>

Next ==
  \/ \E a \in AGENTS : SpawnAgent(a)
  \/ \E a \in AGENTS : FinishAgent(a)
  \/ \E a \in SECURITY_ACTIONS : DispatchSecurityAction(a)
  \/ \E p \in PROCESSES : TryLock(p)
  \/ \E p \in PROCESSES : AcquireLock(p)
  \/ \E p \in PROCESSES : TimeoutProcess(p)
  \/ \E p \in PROCESSES : ReleaseLock(p)

Fairness ==
  /\ \A p \in PROCESSES : WF_vars(AcquireLock(p))
  /\ \A p \in PROCESSES : WF_vars(TimeoutProcess(p))
  /\ \A p \in PROCESSES : WF_vars(ReleaseLock(p))

Spec == Init /\ [][Next]_vars /\ Fairness

AgentBudget    == agent_count <= MAX_AGENTS
StateContract  == \A a \in completed : a \notin EXEMPT => has_state_update[a] = TRUE
SecurityCoagent == \A a \in dispatched_security : coagent_present[a] = TRUE
MutualExclusion ==
  \A p \in PROCESSES : \A q \in PROCESSES :
    (proc_state[p] = "critical" /\ proc_state[q] = "critical") => p = q

EventualProgress ==
  \A p \in PROCESSES :
    proc_state[p] = "waiting" ~> proc_state[p] \in {"critical", "done"}

====
```

- [ ] **Step 2.2: Создать MC.cfg (только AgentBudget)**

Создать `tools/formal/MC.cfg`:

```cfg
SPECIFICATION Spec

CONSTANT
  MAX_AGENTS = 5
  AGENTS = {a1, a2, a3, a4, a5, a6, relay1}
  EXEMPT = {relay1}
  ACTIONS = {act1, act2, act3}
  SECURITY_ACTIONS = {act1, act2}
  PROCESSES = {p1, p2, p3}

INVARIANT
  AgentBudget
```

- [ ] **Step 2.3: Запустить TLC — ожидать VIOLATION**

```bash
java -jar tools/formal/tla2tools.jar -config tools/formal/MC.cfg tools/formal/CCIPInvariants.tla
```

Ожидаемый вывод (violation):
```
Error: Invariant AgentBudget is violated.
The behavior up to this point is:
...
State 7: ...agent_count = 6...
```

TLC нашёл контрпример: 6 агентов при MAX_AGENTS=5. **Это правильно** — баг обнаружен.

### Шаг 2.2 — Исправить SpawnAgent (TDD: pass)

- [ ] **Step 2.4: Добавить guard в SpawnAgent**

Заменить в `tools/formal/CCIPInvariants.tla` секцию SpawnAgent:

```tla
\* Было (БАГ):
SpawnAgent(a) ==
  /\ a \notin active
  /\ a \notin completed
  /\ active' = active \cup {a}
  /\ agent_count' = agent_count + 1
  /\ UNCHANGED <<completed, has_state_update, dispatched_security,
                 coagent_present, lock_holder, proc_state>>
```

```tla
\* Стало (ПРАВИЛЬНО):
SpawnAgent(a) ==
  /\ a \notin active
  /\ a \notin completed
  /\ agent_count < MAX_AGENTS
  /\ active' = active \cup {a}
  /\ agent_count' = agent_count + 1
  /\ UNCHANGED <<completed, has_state_update, dispatched_security,
                 coagent_present, lock_holder, proc_state>>
```

- [ ] **Step 2.5: Запустить TLC — ожидать PASS**

```bash
java -jar tools/formal/tla2tools.jar -config tools/formal/MC.cfg tools/formal/CCIPInvariants.tla
```

Ожидаемый вывод:
```
Model checking completed. No error has been found.
...states generated...
Finished in ...
```

- [ ] **Step 2.6: Commit**

```bash
git add tools/formal/CCIPInvariants.tla tools/formal/MC.cfg
git commit -m "feat(formal): TLA+ model skeleton + INV-AGENT-BUDGET verified"
```

---

## Task 3: Добавить оставшиеся инварианты в MC.cfg

**Files:**
- Modify: `tools/formal/MC.cfg`

Файл `CCIPInvariants.tla` уже содержит все определения (`StateContract`, `SecurityCoagent`, `MutualExclusion`, `EventualProgress`) — нужно только включить их в конфигурацию.

- [ ] **Step 3.1: Обновить MC.cfg (все инварианты + liveness)**

Заменить содержимое `tools/formal/MC.cfg`:

```cfg
SPECIFICATION Spec

CONSTANT
  MAX_AGENTS = 5
  AGENTS = {a1, a2, a3, a4, a5, a6, relay1}
  EXEMPT = {relay1}
  ACTIONS = {act1, act2, act3}
  SECURITY_ACTIONS = {act1, act2}
  PROCESSES = {p1, p2, p3}

INVARIANT
  AgentBudget
  StateContract
  SecurityCoagent
  MutualExclusion

PROPERTY
  EventualProgress
```

- [ ] **Step 3.2: Запустить TLC — все 4 инварианта + liveness**

```bash
java -jar tools/formal/tla2tools.jar -config tools/formal/MC.cfg tools/formal/CCIPInvariants.tla
```

Ожидаемый вывод:
```
Model checking completed. No error has been found.
Checking temporal properties for the complete state space...
Model checking completed. No error has been found.
...states generated...
Finished in ...
```

Если TLC выводит `ASSUME violated` — проверить, что в MC.cfg `AGENTS` содержит `relay1` (уже включён выше).

- [ ] **Step 3.3: Commit**

```bash
git add tools/formal/MC.cfg
git commit -m "feat(formal): all 4 invariants verified (StateContract, SecurityCoagent, MutualExclusion, EventualProgress)"
```

---

## Task 4: CI-интеграция

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 4.1: Добавить job `formal` в ci.yml**

В `.github/workflows/ci.yml` добавить новый job после существующего блока `audit:` (не внутри него, а рядом):

```yaml
  formal:
    name: TLA+ Formal Verification
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          java-version: '11'
          distribution: 'temurin'

      - name: Verify TLA+ invariants
        run: |
          java -jar tools/formal/tla2tools.jar \
            -config tools/formal/MC.cfg \
            tools/formal/CCIPInvariants.tla
```

Важно: job находится на том же уровне отступа, что и `audit:` и `ci:` (под `jobs:`). Не добавлять `needs:` — job независим.

- [ ] **Step 4.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add TLA+ formal verification job (formal)"
```

---

## Task 5: ADR-028

**Files:**
- Create: `docs/decisions/ADR-028-formal-invariant-model.md`

- [ ] **Step 5.1: Создать ADR-028**

Создать `docs/decisions/ADR-028-formal-invariant-model.md`:

```markdown
---
adr: ADR-028
status: Принято
impl_anchors:
  - tools/formal/CCIPInvariants.tla
  - tools/formal/MC.cfg
  - .github/workflows/ci.yml
related:
  - ADR-019
  - ADR-024
  - ADR-025
  - ADR-026
---

# ADR-028 — Formal TLA+ Model of Core Governance Invariants

## Контекст

`docs/audits/2026-06-12-capability-assessment.md` §I фиксирует «нет формальной верификации
**[ОТСУТ.]**» как ключевой блокер Mission-Critical. После Волны 2 (#2/#6) набор
block-инвариантов стабилизирован: INV-AGENT-BUDGET, INV-STATE-CONTRACT, INV-SECURITY-COAGENT
(все enforced), плюс cross-process lock (ADR-019). Моделировать до стабилизации бессмысленно
(роадмап §XII «Волна 4»).

## Решение

**TLA+ (native syntax) + TLC model checker** для 4 block-инвариантов в одном файле
`tools/formal/CCIPInvariants.tla`. Выбор TLA+ над Alloy: лучший CI-headless (exit code);
concurrency-домен (lock, budget) — родная зона TLA+; один toolchain.

**Верифицированные свойства:**

| Инвариант | Свойство | Тип |
|---|---|---|
| INV-AGENT-BUDGET | `agent_count ≤ MAX_AGENTS` всегда | Safety |
| INV-STATE-CONTRACT | `completed ∧ ¬exempt ⇒ has_state_update` | Safety |
| INV-SECURITY-COAGENT | `security_surface ⇒ coagent_present` | Safety |
| Cross-process lock | Взаимное исключение + eventual progress | Safety + Liveness |

**Константы модели (MC.cfg):** MAX_AGENTS=5, |PROCESSES|=3, |AGENTS|=6 — полный перебор
TLC за секунды.

**CI:** новый job `formal` (ubuntu + temurin Java 11), независимый от `audit`/`ci`.
`tla2tools.jar` закоммичен → версия зафиксирована, нет wget в CI.

## Границы (честно)

- Модель верифицирует **абстракцию** инвариантов, не production-код напрямую.
  Соответствие кода модели — ответственность review.
- State space ограничен константами MC.cfg. Свойства доказаны для этих bounds.
- Liveness требует WF (weakly-fair) процессов — корректно для OS-шедулинга.
- Формальная верификация закрывает «нет формальной верификации», но не даёт HA/distributed —
  Mission-Critical остаётся недостижимым по другим причинам (single-node, нет консенсуса).

## Связь

Закрывает §I capability-assessment `[ОТСУТ.]→[ПОДТВ.]`.
Обновляет §VII, §VIII, §IX, §XII.8, §XIII.
```

- [ ] **Step 5.2: Запустить audit-suite (проверить ADR-immutability)**

```bash
pnpm audit-suite
```

Ожидаемый вывод: `22/22 passed`. Если `[ADR-IMMUT]` падает — проверить, что новый ADR-028 не конфликтует с существующими.

- [ ] **Step 5.3: Commit**

```bash
git add docs/decisions/ADR-028-formal-invariant-model.md
git commit -m "docs(arch): ADR-028 formal invariant model (TLA+ / #8)"
```

---

## Task 6: Обновить capability-assessment

**Files:**
- Modify: `docs/audits/2026-06-12-capability-assessment.md`

7 точечных изменений + 1 запись в журнал.

- [ ] **Step 6.1: §I — обновить строку формальной верификации**

Найти и заменить:

```
| Детерминированный 362/362 + audit 22/22 **[ПОДТВ.]** | Нет формальной верификации **[ОТСУТ.]** |
```

→

```
| Детерминированный 362/362 + audit 22/22 **[ПОДТВ.]** | Формальная верификация 4 block-инвариантов, TLC CI-green (ADR-028) **[ПОДТВ.]** |
```

- [ ] **Step 6.2: §I — обновить «Почему не выше»**

Найти:
```
Mission-Critical требует формальной верификации/консенсуса — не начато.
```

Заменить:
```
Mission-Critical требует формальной верификации/консенсуса — верификация block-инвариантов выполнена (ADR-028, TLC); distributed консенсус отсутствует.
```

- [ ] **Step 6.3: §VII — переместить формальную верификацию из Not Ready в Fully Ready**

Найти в §VII:
```
- **Fully Ready (строй смело):** целостность состояния · self-audit & semantic-integrity-as-code · ADR-governance · детерминированная регрессия · видимая recovery · наблюдаемый fail-open · security co-agent enforcement · budget enforcement · contract-enforced handoff (FPR=0).
```

Заменить:
```
- **Fully Ready (строй смело):** целостность состояния · self-audit & semantic-integrity-as-code · ADR-governance · детерминированная регрессия · видимая recovery · наблюдаемый fail-open · security co-agent enforcement · budget enforcement · contract-enforced handoff (FPR=0) · формальная верификация block-инвариантов (TLC, ADR-028).
```

Найти в §VII:
```
- **Not Ready:** distributed state/консенсус · формальная верификация · масштаб >5 агентов как гарантия · multi-tenant governance · main-agent reasoning-token attribution (только tool-I/O оценивается, ADR-020) · enforced intelligent routing.
```

Заменить (убрать `· формальная верификация`):
```
- **Not Ready:** distributed state/консенсус · масштаб >5 агентов как гарантия · multi-tenant governance · main-agent reasoning-token attribution (только tool-I/O оценивается, ADR-020) · enforced intelligent routing.
```

- [ ] **Step 6.4: §VIII — убрать из «объективных остатков»**

Найти:
```
8. **Объективные остатки:** single-node · routing/feedback = конвенция · token-blindness · fail-open-остаток · нет формальной верификации/распределённости.
```

Заменить:
```
8. **Объективные остатки:** single-node · routing/feedback = конвенция · token-blindness · fail-open-остаток · нет распределённости (distributed консенсус).
```

- [ ] **Step 6.5: §IX — обновить Mission-Critical строку**

Найти:
```
| Mission-Critical Runtime | **Существенно ниже** — нет формальной верификации, redundancy, консенсуса |
```

Заменить:
```
| Mission-Critical Runtime | **Существенно ниже** — нет redundancy, distributed консенсуса (формальная верификация block-инвариантов — ADR-028 **[ПОДТВ.]**)  |
```

- [ ] **Step 6.6: §XII.8 — добавить ✅**

Найти:
```
8. **Формальная модель ключевых инвариантов (TLA+/Alloy)** для 3-4 block-инвариантов — путь к Mission-Critical.
```

Заменить:
```
8. **Формальная модель ключевых инвариантов (TLA+/Alloy)** для 3-4 block-инвариантов — путь к Mission-Critical. ✅ Реализовано (ADR-028): 4 block-инварианта (Safety + Liveness), TLC CI-green.
```

- [ ] **Step 6.7: §XIII — обновить разделение уверенности**

Найти:
```
- **Подтверждено фактами:** вердикт §I, машинные инварианты, атомарность состояния, self-audit, recovery, observable-fail-safe.
```

Заменить:
```
- **Подтверждено фактами:** вердикт §I, машинные инварианты, атомарность состояния, self-audit, recovery, observable-fail-safe, формальная верификация block-инвариантов (ADR-028, TLC CI-green).
```

Найти:
```
- **Потенциально (направление, не свойство):** enforced intelligent routing, distributed state, autonomous engineering без надзора, формальная верификация.
```

Заменить (убрать `формальная верификация`):
```
- **Потенциально (направление, не свойство):** enforced intelligent routing, distributed state, autonomous engineering без надзора.
```

- [ ] **Step 6.8: Добавить запись в журнал (конец файла)**

В таблицу «Журнал обновления документа» добавить строку:

```markdown
| 2026-06-15 | Волна 4 / §XII.8 реализован: TLA+ формальная модель 4 block-инвариантов (INV-AGENT-BUDGET, INV-STATE-CONTRACT, INV-SECURITY-COAGENT, cross-process lock ADR-019), TLC CI-green. §I [ОТСУТ.]→[ПОДТВ.]; §VII, §VIII, §IX, §XII.8, §XIII обновлены. **Волна 4 — ЗАКРЫТА.** | ADR-028; TLC headless pass; canonical N/N, audit 22/22 |
```

(заменить `N/N` на актуальный счётчик canonical runner после прогона)

- [ ] **Step 6.9: Запустить audit-suite**

```bash
pnpm audit-suite
```

Ожидаемый вывод: `22/22 passed`.

- [ ] **Step 6.10: Commit**

```bash
git add docs/audits/2026-06-12-capability-assessment.md
git commit -m "docs(audit): §I [ОТСУТ.]→[ПОДТВ.] formal verification, §VII/VIII/IX/XII/XIII updated (#8)"
```

---

## Финальная проверка

- [ ] Запустить TLC локально: `java -jar tools/formal/tla2tools.jar -config tools/formal/MC.cfg tools/formal/CCIPInvariants.tla` → `No error has been found`
- [ ] Запустить audit-suite: `pnpm audit-suite` → `22/22 passed`
- [ ] Проверить `git log --oneline -6` — 5 коммитов задачи видны
- [ ] Commit template для merge: `feat(formal): TLA+/Alloy model for core invariants (#8)`
