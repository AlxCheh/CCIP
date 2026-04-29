# Agent Handoff Protocol

Формализует шаг [4] цепочки §0: условия назначения агента и формат передачи контекста.

---

## 1. Assignment Decision Tree

Выполняется строго сверху вниз. Первое совпавшее условие — результат.

```
IF task_type == "Architecture Change"  OR task_type == "Research Task"
  → primary: ccip-architect
  → co-agent: module_agent(M-ID)  ← для реализации

ELSE IF task_type == "Security Update"
  → primary: ccip-security
  → co-agent: module_agent(M-ID)  ← для контекста модуля

ELSE IF task_type == "Documentation Update"
  → primary: ccip-doc-writer
  → co-agents: none

ELSE
  → primary: module_agent(M-ID)   ← из §1.5 по M-ID
  → apply co-agent conditions §2
```

---

## 2. Co-agent Conditions

Применяются к primary агенту, определённому в §1. Добавляют, не заменяют.

| Условие | Co-agent добавляется | Роль |
|---------|---------------------|------|
| priority = P1 AND t_level ∈ {T3, T4} | `ccip-architect` | reviewer |
| module ∈ {M-05a, M-05b, M-05c} AND priority = P1 | `ccip-architect` | reviewer (критические state machines) |
| DoR выявил `schema-gap` | `ccip-dba` | исправить схему первым |
| DoR выявил `adr-violation` | `ccip-architect` | создать ретроспективный ADR |
| task затрагивает RLS или tenant isolation | `ccip-security` | проверить изоляцию |
| cross-module: модуль обращается к другому bounded context | `ccip-architect` | проверить контракт |

---

## 3. Module → Primary Agent (из §1.5)

| M-ID | Primary Agent | Примечание |
|------|--------------|------------|
| M-00 | `ccip-architect` | ADR-012 — архитектурное решение |
| M-01 | `ccip-dba` + `ccip-devops` | совместно: schema + infra |
| M-02 | `ccip-backend-aux` | Auth/RBAC/multi-tenancy |
| M-03 | `ccip-backend-core` | Init Module A |
| M-04 | `ccip-backend-core` | ZeroReport |
| M-05a | `ccip-backend-core` | PeriodEngine — всегда P1 + ccip-architect review |
| M-05b | `ccip-backend-core` | DisputeSLA — всегда P1 + ccip-architect review |
| M-05c | `ccip-backend-core` | Analytics — всегда P1 + ccip-architect review |
| M-06 | `ccip-backend-core` | Baseline F/G |
| M-07 | `ccip-backend-aux` | Sync API |
| M-08 | `ccip-frontend` | Web App |
| M-10 | `ccip-security` + `ccip-backend-core` | Security + implementation |
| M-11 | `ccip-qa` | Testing |
| M-12 | `ccip-devops` | Prod Infra |
| M-13 | `ccip-architect` | Pilot — координация всех агентов |
| M-M | `ccip-mobile` | Mobile App |

---

## 4. Handoff Bundle Template

Orchestrator передаёт агенту строго этот пакет. Не больше — не меньше.

```md
## HANDOFF — <agent-name>

### Assignment
Module: M-XX — <название модуля>
Task Type: <категория>
Priority: P1-CRITICAL | P2-BLOCKING | P3-REQUIRED | P4-OPTIONAL
Phase: <номер>, section: <heading> (offset:<N>)
Co-agents: <список или none>
Review required: yes (ccip-architect) | no

### Pre-loaded Delivery Context
(Уже прочитано orchestrator на шаге [2] — агент не перечитывает phase file)
- Goal: <цель из phase file>
- AC: <acceptance criteria из phase file>
- Invariants: <инварианты из phase file>
- Artifacts: <пути файлов-артефактов из phase file>
- Transition criterion: <критерий перехода к следующему этапу>

### Agent Must Load (технический контекст — шаг [5])
- Architecture: docs/architecture/<module>.md
- ADR: <список ADR из §1.5 или §0.1>
- Schema: packages/database/prisma/schema.prisma (models: <список>)
- Error log: docs/errors/<module>-errors.md (при Bug Fix / Security)

### Constraints
- ADR violations запрещены: <список применимых ADR>
- Не изменять: <смежные модули, если есть>
- Append-only: <таблицы если ADR-007 применим>

### DoR Status
- Phase ready: ✓ | ✗ <что заблокировано>
- Dependency ready: ✓ | ✗ <какой модуль не готов>
- ADR approved: ✓ | ✗
- Schema ready: ✓ | ✗ <какая модель отсутствует>
- AC defined: ✓ | ✗

### On Completion
Агент обязан вернуть orchestrator:
- Result: completed | completed-with-deviations | blocked
- Deviations: <список FEEDBACK классов если есть>
- Files changed: <список файлов>
```

---

## 5. Escalation Ladder

Если primary агент не может выполнить задачу:

| Ситуация | Эскалация |
|----------|-----------|
| Задача выходит за зону ответственности агента | → `ccip-architect` (перераспределить) |
| Обнаружен `adr-violation` в процессе | → `ccip-architect` (немедленно) |
| Schema требует изменений | → `ccip-dba` (блокирует продолжение) |
| Security-инвариант нарушен | → `ccip-security` + `ccip-architect` |
| Реализация P1 заблокирована > 1 сессии | → `ccip-architect` (critical path risk) |

---

## 6. Conflict Resolution

Когда несколько правил дают разных агентов:

1. **task_type fixed-agent** (§1 строки 1–4) **всегда приоритетнее** module agent
2. **Priority co-agent** добавляется к primary, не заменяет
3. **Cross-module задача**: если затрагивает ≥ 2 bounded contexts → `ccip-architect` становится primary; оба module agent — co-agents
4. **DoR co-agent** добавляется последним и всегда первым выполняет свою часть (например, ccip-dba исправляет schema до начала основной реализации)

---

## 7. Read Policy

Читать при шаге [4] цепочки §0.  
Читать только §1–§2 (decision tree + co-agent conditions) — достаточно для назначения.  
§4 (Handoff Bundle) — заполнять при делегировании субагенту.  
§5–§6 — читать только при конфликте или эскалации.
