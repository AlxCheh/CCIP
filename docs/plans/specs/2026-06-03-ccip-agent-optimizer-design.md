# ccip-agent-optimizer Design Spec

**Date:** 2026-06-03  
**Status:** Approved

## Goal

Создать агента `ccip-agent-optimizer`, который проактивно проверяет качество тела одного `.claude/agents/<name>.md` файла по внешнему реестру правил, автоматически применяет безопасные структурные правки и выносит смысловые изменения на review пользователя.

## Architecture

Двухфазный агент: **Фаза 1 (анализ)** — читает агент-файл и реестр правил, производит структурированный список находок. **Фаза 2 (действие)** — auto-fixable находки применяет через Edit, остальные пишет в `docs/proposed-agent-changes.md`. Чеклист вынесен во внешний файл `.claude/audit/agent-optimizer/rules.md` — расширяется без правки тела агента.

## Tech Stack

Node.js-совместимый агент (Read, Write, Edit, Glob, Grep). Модель: `claude-sonnet-4-6` — семантический анализ требует Sonnet. Без Bash.

---

## Section 1: Identity and Trigger

**Name:** `ccip-agent-optimizer`  
**Model:** `claude-sonnet-4-6`  
**Tools:** `Read, Write, Edit, Glob, Grep`

**Вызов:** ручной с именем агента как аргументом:
```
ccip-agent-optimizer ccip-backend-core
```

**Триггеры для запуска:**
- Агент систематически нарушает одно и то же правило (3+ раз в `docs/tasks/feedback-loop.md`)
- После создания нового агента — первичный аудит качества
- После крупного рефактора CLAUDE.md — проверка согласованности тел агентов

**Связь с другими агентами:**
- `agent-file-watcher` (PostToolUse хук) — уведомляет об изменении агент-файла; `ccip-agent-optimizer` не запускается из хука, только вручную
- `ccip-claude-md-auditor` — работает с CLAUDE.md; агент-оптимизатор не трогает CLAUDE.md

---

## Section 2: Rules Registry

**Файл реестра:** `.claude/audit/agent-optimizer/rules.md`  
Агент читает его в начале каждого запуска. Только `active` правила применяются. `draft` правила — только диагностика, без auto-fix.

**Жизненный цикл правила:**
```
draft → active → deprecated
```

**Формат правила:**
```markdown
### S-01
**Категория:** structural
**Status:** active
**Auto-fix:** yes
**Проверка:** `summary:` ≤ 200 символов, без переносов строк
**Действие:** обрезать до 200 символов или записать в proposed-changes
**Severity:** warning
```

**Начальный набор правил:**

### Категория S — Структурные (auto-fixable: да)

| ID | Проверка | Действие |
|---|---|---|
| S-01 | `summary:` ≤ 200 символов, без переносов строк | Обрезать / предложить сжатие |
| S-02 | Все ADR-ссылки в теле (`ADR-NNN`) существуют в `docs/decisions/` | Пометить `[DEAD-ADR-REF]` |
| S-03 | Все файловые пути в теле существуют | Пометить `[DEAD-PATH]` |
| S-04 | Блок `## State Update` присутствует в конце тела | Добавить шаблон |

### Категория Q — Качество инструкций (auto-fixable: нет)

| ID | Проверка |
|---|---|
| Q-01 | Размытые формулировки: "делай правильно", "обработай корректно", "при необходимости" без критерия |
| Q-02 | Тело > 200 строк без секционной структуры (`##` заголовки) |
| Q-03 | Отсутствует явный список запрещённых действий для высокорискового агента (ARCH, SECURITY, DBA) |
| Q-04 | Отсутствует секция `## Ключевые ADR` при наличии ADR-ссылок в теле |

### Категория C — Согласованность с CLAUDE.md (auto-fixable: нет)

| ID | Проверка | Severity |
|---|---|---|
| C-01 | `description:` совпадает с описанием в таблице `Intent → Agent` CLAUDE.md | warning |
| C-02 | `tools:` содержит только инструменты, реально нужные агенту | info |
| C-03 | `model:` соответствует сложности задач (Haiku для read-only, Sonnet для write) | info |

---

## Section 3: Output and Actions

### Phase 1 — Analysis (no changes)

Агент производит внутренний список находок в формате:
```json
[
  {
    "rule": "S-02",
    "agent": "ccip-backend-core",
    "location": "line 45: ADR-018",
    "severity": "warning",
    "auto_fixable": true,
    "description": "ADR-018 не существует в docs/decisions/",
    "old": "ADR-018",
    "new": "[DEAD-ADR-REF: ADR-018]"
  }
]
```

### Phase 2 — Action

| Тип находки | Действие |
|---|---|
| `auto_fixable: true`, `status: active` | Edit напрямую в `.claude/agents/<name>.md` |
| `auto_fixable: false` | Append в `docs/proposed-agent-changes.md` |
| `rule status: draft` | Только диагностика, запись в отчёт, без изменений |
| Любая находка | Итоговая строка в `docs/errors/errors_log.md` |

### proposed-agent-changes.md format

```markdown
## <agent-name> — <YYYY-MM-DD>
**Rule:** <ID> · **Severity:** <severity>
**Location:** <line/section>
**Current:** "<текущий текст>"
**Proposed:** "<предлагаемый текст>"
**Status:** PENDING_HUMAN_REVIEW
```

### errors_log.md entry

```markdown
## Agent Optimizer — <agent-name> — <YYYY-MM-DD>
**Rules applied:** <N auto-fixed>
**Pending review:** <N proposed>
**Draft diagnostics:** <N>
**Findings:** [список ID с severity]
```

### State Update (обязательный блок §15)

Агент завершает вывод блоком `## State Update` с JSON summary, artifacts, handoff_notes.

---

## Section 4: Safety Constraints

### Никогда не трогать без PENDING_HUMAN_REVIEW

- `description:` в frontmatter — routing-критичное поле
- `tools:` в frontmatter — определяет возможности агента
- `model:` в frontmatter — влияет на стоимость и качество
- Любую инструкцию, описывающую **что агент НЕ делает** (запреты, ограничения scope)

### Никогда не делать

- Переписывать секции целиком — только точечные Edit
- Применять `draft`-правила — только диагностика
- Запускаться без явного имени агента (нет режима "все агенты")
- Трогать `CLAUDE.md` — зона `ccip-claude-md-auditor`

### Разделение ответственности

| Агент | Зона |
|---|---|
| `ccip-agent-optimizer` | Тела и frontmatter `.claude/agents/*.md` |
| `ccip-claude-md-auditor` | `CLAUDE.md` (routing, таблицы, навигация) |
| `ccip-navigator-optimizer` | Согласованность CLAUDE.md ↔ `docs/tasks/index.md` |

---

## Files Created/Modified

| Действие | Файл |
|---|---|
| Create | `.claude/agents/ccip-agent-optimizer.md` |
| Create | `.claude/audit/agent-optimizer/rules.md` |
| Create | `docs/proposed-agent-changes.md` |
| Modify | `CLAUDE.md` — добавить агент в Auxiliary Agents |

### CLAUDE.md addition (Auxiliary Agents table)

```
| ccip-agent-optimizer | по запросу: 3+ повторных ошибки агента, новый агент, рефактор CLAUDE.md |
```
