# Spec: Формальная модель инвариантов CCIP (TLA+ / #8)

**Дата:** 2026-06-15  
**Задача:** §XII #8 — Формальная модель ключевых инвариантов  
**Инструмент:** TLA+ / PlusCal + TLC model checker  
**Статус:** approved

---

## Цель

Закрыть `§I «нет формальной верификации [ОТСУТ.]»` в capability-assessment через machine-checked доказательство свойств четырёх block-инвариантов. Верификатор запускается в CI headless, exit code = 0 ↔ все свойства выполнены.

---

## Scope

4 инварианта из governance-manifest, одно ключевое свойство каждый:

| Инвариант | Тип | Проверяемое свойство |
|---|---|---|
| INV-AGENT-BUDGET | block/enforced | Safety: `agent_count ≤ MAX_AGENTS` всегда |
| INV-STATE-CONTRACT | signal/enforced | Safety: `completed ∧ ¬exempt ⇒ has_state_update` |
| INV-SECURITY-COAGENT | block/enforced | Safety: `security_surface ⇒ coagent_present` |
| Cross-process lock (ADR-019) | — | Safety: взаимное исключение; Liveness: прогресс |

Все четыре — Safety-свойства; lock дополнительно несёт Liveness (eventual progress для waiting-процессов).

---

## Toolchain

- **TLC model checker:** `tla2tools.jar` (~7 МБ, `tlaplus/tlaplus` GitHub releases)
- **Зависимость:** Java 11+ (в CI — `actions/setup-java@v4`, distribution `temurin`)
- **JAR коммитится** в репо (`tools/formal/tla2tools.jar`) — версия зафиксирована, CI не требует wget
- **Запуск:** `java -jar tools/formal/tla2tools.jar -config tools/formal/MC.cfg tools/formal/ccip-invariants.tla`

---

## Файловая структура

```
tools/
  formal/
    tla2tools.jar          ← TLC, committed
    ccip-invariants.tla    ← PlusCal-модель (все 4 инварианта)
    MC.cfg                 ← TLC-конфигурация (константы + проверяемые свойства)
    MC.tla                 ← auto-generated из PlusCal (добавить в .gitignore)
```

---

## Модель: переменные

```tla
VARIABLES
  agent_count,        \* Nat — активных агентов сейчас
  completed,          \* SUBSET AGENTS — завершили работу
  has_state_update,   \* [AGENTS → BOOLEAN]
  lock_holder,        \* PROCESSES ∪ {"none"}
  proc_state,         \* [PROCESSES → {idle, waiting, critical, done}]
  dispatched_security, \* SUBSET ACTIONS
  coagent_present     \* [ACTIONS → BOOLEAN]
```

---

## Модель: инварианты и свойства

### INV-AGENT-BUDGET

```tla
\* Guard на SpawnAgent: разрешить только если count < MAX_AGENTS
SpawnAgent == agent_count < MAX_AGENTS /\ agent_count' = agent_count + 1 /\ ...

\* Safety-свойство
AgentBudget == agent_count <= MAX_AGENTS
```

TLC проверяет `INVARIANT AgentBudget` — нарушение = контрпример с трейсом.

### INV-STATE-CONTRACT

```tla
\* CompleteAgent(a, has_block): агент a завершается, записывает блок или нет
\* Exempt-агенты (EXEMPT-константа) освобождены от требования

StateContract ==
  \A a \in completed :
    a \notin EXEMPT => has_state_update[a] = TRUE
```

TLC проверяет `INVARIANT StateContract`.

### INV-SECURITY-COAGENT

```tla
\* DispatchAction(a, is_sec, has_coagent): deny если is_sec /\ ~has_coagent
\* Модель отражает pre-agent-gate.js: security-dispatch без co-agent недостижим

SecurityCoagent ==
  \A a \in dispatched_security : coagent_present[a] = TRUE
```

TLC проверяет `INVARIANT SecurityCoagent`.

### Cross-process lock (ADR-019)

```tla
\* AcquireLock(p): p переходит waiting → critical (атомарно, если lock free)
\* ReleaseLock(p): p → done, lock_holder = "none"
\* Timeout(p): p не дождался → done без critical (fail-open), lock не взят

\* Safety: взаимное исключение
MutualExclusion ==
  \A p, q \in PROCESSES :
    (proc_state[p] = "critical" /\ proc_state[q] = "critical") => p = q

\* Liveness: каждый waiting-процесс рано или поздно выходит (critical или timeout)
EventualProgress ==
  \A p \in PROCESSES :
    proc_state[p] = "waiting" ~> (proc_state[p] = "critical" \/ proc_state[p] = "done")
```

TLC проверяет `INVARIANT MutualExclusion` + `PROPERTY EventualProgress` (требует fair scheduling — `FAIRNESS` в MC.cfg).

---

## Константы MC.cfg

```cfg
CONSTANTS
  MAX_AGENTS = 5
  PROCESSES  = {p1, p2, p3}
  AGENTS     = {a1, a2, a3, a4, a5, a6}
  EXEMPT     = {relay1}
  ACTIONS    = {act1, act2, act3}

SPECIFICATION Spec   \* Spec включает Init /\ [][Next]_vars /\ Fairness

INVARIANTS
  AgentBudget
  StateContract
  SecurityCoagent
  MutualExclusion

PROPERTIES
  EventualProgress

\* Symmetry-оптимизация (опц.): если определить Symmetry в .tla,
\* добавить строку: SYMMETRY Symmetry
```

---

## CI-интеграция

Новый job `formal` в `.github/workflows/ci.yml`, параллельно с `audit`:

```yaml
formal:
  name: TLA+ Formal Verification
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6

    - name: Set up Java
      uses: actions/setup-java@v4
      with:
        java-version: '11'
        distribution: 'temurin'

    - name: Verify TLA+ invariants
      run: |
        java -jar tools/formal/tla2tools.jar \
          -config tools/formal/MC.cfg \
          tools/formal/ccip-invariants.tla
```

Job не зависит от `audit` (независимый путь). Не требует pnpm, postgres, Node.

---

## Артефакты задачи #8

| Файл | Тип | Действие |
|---|---|---|
| `tools/formal/tla2tools.jar` | binary | new (committed) |
| `tools/formal/ccip-invariants.tla` | TLA+/PlusCal | new |
| `tools/formal/MC.cfg` | TLC config | new |
| `.gitignore` | config | `tools/formal/MC.tla` в ignore |
| `docs/decisions/ADR-028-formal-invariant-model.md` | ADR | new |
| `docs/audits/2026-06-12-capability-assessment.md` | doc | §I + §IX + §XIII (3 строки) |
| `.github/workflows/ci.yml` | CI | +1 job `formal` |

Commit: `feat(formal): TLA+/Alloy model for core invariants (#8)`

---

## ADR-028 (структура)

```
Title:   Formal model of core governance invariants (TLA+)
Status:  Accepted
Context: capability-assessment §I: «нет формальной верификации [ОТСУТ.]»
         4 block-инварианта стабилизированы после Волны 2 (#2/#6)
Decision: TLA+/PlusCal + TLC; один spec-файл; 4 инварианта;
          CI headless (ubuntu-latest + temurin Java 11)
Consequences:
  - §I [ОТСУТ.] → [ПОДТВ.] при CI-green
  - §IX, §XIII: формальная верификация снята из блокеров Mission-Critical
  - tla2tools.jar (~7 МБ) добавлен в репо
```

---

## Ограничения модели (честные)

- Модель верифицирует **абстракцию** инвариантов, не production-код напрямую. Соответствие кода модели — ответственность review'а ADR-028.
- State space ограничен константами MC.cfg (PROCESSES=3, AGENTS=6). Свойства доказаны для этих bounds.
- Liveness (EventualProgress) требует fair scheduling — модель предполагает weakly-fair процессы, что соответствует OS-гарантиям.
