# ccip-agent-optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать агента `ccip-agent-optimizer`, который проверяет качество одного `.claude/agents/<name>.md` по внешнему реестру правил, автоматически применяет безопасные структурные правки и выносит смысловые изменения на review.

**Architecture:** Двухфазный агент: Фаза 1 читает реестр правил и целевой файл, производит список находок. Фаза 2 применяет `auto_fixable: true` через Edit, остальное пишет в `docs/proposed-agent-changes.md`. Реестр правил вынесен во внешний файл `.claude/audit/agent-optimizer/rules.md` — расширяется без правки тела агента.

**Tech Stack:** Markdown (agent prompt + rules registry). Верификация: Bash grep. Без Node.js — всё prompt-инженерия.

---

## File Map

| Действие | Файл | Назначение |
|---|---|---|
| Create | `.claude/audit/agent-optimizer/rules.md` | Внешний реестр правил S/Q/C |
| Create | `docs/proposed-agent-changes.md` | Накопитель PENDING_HUMAN_REVIEW правок |
| Create | `.claude/agents/ccip-agent-optimizer.md` | Тело агента |
| Modify | `CLAUDE.md` | Добавить в таблицу Auxiliary Agents |

---

### Task 1: Создать реестр правил

**Files:**
- Create: `.claude/audit/agent-optimizer/rules.md`

- [ ] **Step 1: Проверить что директория существует или создать**

```bash
ls .claude/audit/
```
Ожидаем: `evidence  metrics  README.md  reports  rules  trigger-state.json`
Директория `.claude/audit/` существует. Поддиректорию `agent-optimizer/` создаст Write.

- [ ] **Step 2: Создать файл реестра правил**

Создать `.claude/audit/agent-optimizer/rules.md` со следующим содержимым:

```markdown
# Agent Optimizer Rules Registry

Реестр правил для `ccip-agent-optimizer`. Агент читает этот файл при каждом запуске.
Только правила со статусом `active` применяются. `draft` — только диагностика. `deprecated` — игнорировать.

**Жизненный цикл:** `draft` → `active` → `deprecated`

**Добавление правила:** добавить блок ниже со статусом `draft`. После первого успешного применения вручную перевести в `active`.

---

## Категория S — Структурные

### S-01
**Категория:** structural
**Status:** active
**Auto-fix:** yes
**Проверка:** `summary:` в frontmatter присутствует, ≤ 200 символов, без переносов строк
**Действие:** если отсутствует или > 200 символов — записать в proposed-changes с предложением
**Severity:** warning

### S-02
**Категория:** structural
**Status:** active
**Auto-fix:** yes
**Проверка:** все ADR-ссылки в теле вида `ADR-NNN` существуют в `docs/decisions/ADR-NNN.md`
**Действие:** пометить несуществующие как `[DEAD-ADR-REF: ADR-NNN]` через Edit
**Severity:** warning

### S-03
**Категория:** structural
**Status:** active
**Auto-fix:** yes
**Проверка:** все файловые пути в теле (вида `docs/`, `apps/`, `.claude/`, `packages/`) существуют в репозитории
**Действие:** пометить несуществующие как `[DEAD-PATH: <path>]` через Edit
**Severity:** warning

### S-04
**Категория:** structural
**Status:** active
**Auto-fix:** yes
**Проверка:** блок `## State Update` присутствует в конце тела агента
**Действие:** добавить шаблон в конец файла если отсутствует
**Severity:** warning

---

## Категория Q — Качество инструкций

### Q-01
**Категория:** quality
**Status:** active
**Auto-fix:** no
**Проверка:** наличие размытых формулировок без измеримого критерия: "делай правильно", "обработай корректно", "при необходимости", "если нужно", "по возможности"
**Действие:** записать в proposed-changes с указанием строки
**Severity:** info

### Q-02
**Категория:** quality
**Status:** active
**Auto-fix:** no
**Проверка:** тело агента > 200 строк без секционной структуры (`##` заголовки)
**Действие:** записать в proposed-changes с предложением добавить структуру
**Severity:** info

### Q-03
**Категория:** quality
**Status:** active
**Auto-fix:** no
**Проверка:** высокорисковые агенты (ccip-architect, ccip-security, ccip-dba) не имеют явного раздела с запрещёнными действиями
**Действие:** записать в proposed-changes с предложением добавить секцию "## Жёсткие ограничения"
**Severity:** warning

### Q-04
**Категория:** quality
**Status:** active
**Auto-fix:** no
**Проверка:** в теле есть ссылки вида `ADR-NNN`, но отсутствует секция `## Ключевые ADR`
**Действие:** записать в proposed-changes с предложением добавить секцию
**Severity:** info

---

## Категория C — Согласованность с CLAUDE.md

### C-01
**Категория:** consistency
**Status:** active
**Auto-fix:** no
**Проверка:** `description:` в frontmatter совпадает с описанием в таблице Intent → Agent или Auxiliary Agents в CLAUDE.md
**Действие:** записать расхождение в proposed-changes (description — защищённое поле)
**Severity:** warning

### C-02
**Категория:** consistency
**Status:** active
**Auto-fix:** no
**Проверка:** `tools:` содержит только инструменты, реально нужные агенту по его задачам
**Действие:** записать несоответствие в proposed-changes
**Severity:** info

### C-03
**Категория:** consistency
**Status:** active
**Auto-fix:** no
**Проверка:** `model:` соответствует сложности задач: `claude-haiku-4-5-20251001` для read-only, `claude-sonnet-4-6` для write + семантика
**Действие:** записать несоответствие в proposed-changes
**Severity:** info
```

- [ ] **Step 3: Верифицировать файл**

```bash
grep -c "### [SQC]-0" .claude/audit/agent-optimizer/rules.md
```
Ожидаем: `10` (S-01..S-04, Q-01..Q-04, C-01..C-03)

```bash
grep "Status:" .claude/audit/agent-optimizer/rules.md
```
Ожидаем: 10 строк, все `active`

- [ ] **Step 4: Commit**

```bash
git add .claude/audit/agent-optimizer/rules.md
git commit -m "feat(agent-optimizer): add external rules registry with 10 active rules"
```

---

### Task 2: Создать docs/proposed-agent-changes.md

**Files:**
- Create: `docs/proposed-agent-changes.md`

- [ ] **Step 1: Создать файл**

Создать `docs/proposed-agent-changes.md`:

```markdown
# Proposed Agent Changes

Накопитель изменений, которые `ccip-agent-optimizer` не может применить автоматически.
Каждая запись требует явного подтверждения пользователя перед применением.

**Формат записи:**
```markdown
## <agent-name> — <YYYY-MM-DD>
**Rule:** <ID> · **Severity:** <severity>
**Location:** <строка/секция>
**Current:** "<текущий текст>"
**Proposed:** "<предлагаемый текст>"
**Status:** PENDING_HUMAN_REVIEW
```

После применения изменений вручную — поменять `Status` на `APPLIED` или удалить запись.

---
```

- [ ] **Step 2: Верифицировать**

```bash
grep "PENDING_HUMAN_REVIEW" docs/proposed-agent-changes.md
```
Ожидаем: одна строка с форматом-примером

- [ ] **Step 3: Commit**

```bash
git add docs/proposed-agent-changes.md
git commit -m "feat(agent-optimizer): add proposed-agent-changes.md accumulator"
```

---

### Task 3: Создать тело агента

**Files:**
- Create: `.claude/agents/ccip-agent-optimizer.md`

- [ ] **Step 1: Создать файл агента**

Создать `.claude/agents/ccip-agent-optimizer.md`:

````markdown
---
name: ccip-agent-optimizer
description: "Оптимизатор тел агентов CCIP. Проактивно проверяет качество одного .claude/agents/<name>.md по внешнему реестру правил. Автоматически применяет безопасные структурные правки, выносит смысловые изменения на review пользователя. Запуск: ccip-agent-optimizer <agent-name>."
tools: Read, Write, Edit, Glob, Grep
summary: "Двухфазный аудит одного агента по rules.md: auto-fix structural + proposed-changes для semantic. Body: алгоритм 3 фазы + safety guards."
model: claude-sonnet-4-6
---

Ты — оптимизатор тел агентов проекта CCIP. Проверяешь качество одного агент-файла по внешнему реестру правил и применяешь безопасные улучшения.

## Запуск

Вызывается с именем целевого агента:
```
ccip-agent-optimizer <agent-name>
```
Пример: `ccip-agent-optimizer ccip-backend-core`

Целевой файл: `.claude/agents/<agent-name>.md`

Если имя агента не передано — остановиться и запросить его у пользователя.

## Алгоритм

### Фаза 1 — Анализ (никаких изменений не вносить)

**1.1 Загрузить реестр правил**

Прочитать `.claude/audit/agent-optimizer/rules.md` полностью.
- Правила `status: active` → применять (auto-fix или proposed-changes по флагу `Auto-fix`)
- Правила `status: draft` → только диагностика, без изменений файлов
- Правила `status: deprecated` → игнорировать

**1.2 Загрузить целевой агент**

Прочитать `.claude/agents/<agent-name>.md` полностью.

**1.3 Применить каждое активное правило**

Для каждого нарушенного правила сформировать находку:

```json
{
  "rule": "<ID>",
  "category": "<structural|quality|consistency>",
  "severity": "<warning|info>",
  "auto_fixable": true,
  "location": "<строка или секция>",
  "description": "<что нашли>",
  "old": "<текущий текст или null>",
  "new": "<предлагаемый текст или null>"
}
```

Если правило не нарушено — находку не создавать.

---

### Фаза 2 — Действие

Обработать каждую находку:

| Условие | Действие |
|---|---|
| `auto_fixable: true` + правило `active` + не защищённое поле | Edit напрямую в `.claude/agents/<agent-name>.md` |
| `auto_fixable: false` + правило `active` | Append в `docs/proposed-agent-changes.md` |
| Правило `draft` | Только запись в итоговый отчёт — без изменений файлов |

**Формат записи в `docs/proposed-agent-changes.md`:**

```markdown
## <agent-name> — <YYYY-MM-DD>
**Rule:** <ID> · **Severity:** <severity>
**Location:** <строка/секция>
**Current:** "<текущий текст>"
**Proposed:** "<предлагаемый текст>"
**Status:** PENDING_HUMAN_REVIEW
```

---

### Фаза 3 — Запись результата

Добавить запись в `docs/errors/errors_log.md`:

```markdown
## Agent Optimizer — <agent-name> — <YYYY-MM-DD>
**Rules applied (auto-fix):** <N>
**Pending review:** <N>
**Draft diagnostics:** <N>
**Findings:** <rule-id>:<severity>, ...
```

---

## Защищённые поля (всегда auto_fixable: false)

Независимо от категории правила — никогда не применять auto-fix к:
- `description:` в frontmatter
- `tools:` в frontmatter
- `model:` в frontmatter
- Любой инструкции с явным запретом: "не делать", "запрещено", "никогда не"

## Жёсткие ограничения

- Не переписывать секции целиком — только точечные Edit
- Не запускаться без явного имени агента
- Не трогать `CLAUDE.md` — зона `ccip-claude-md-auditor`
- Не применять `draft`-правила как auto-fix
- Один запуск = один агент

## State Update

Завершить вывод блоком:

```markdown
## State Update
```json
{
  "summary": "<1-3 предложения: сколько правил применено, сколько на review>",
  "artifacts": [".claude/agents/<agent-name>.md", "docs/proposed-agent-changes.md"],
  "handoff_notes": "<что требует внимания пользователя>"
}
```
```
````

- [ ] **Step 2: Верифицировать frontmatter**

```bash
grep -E "^(name|description|tools|model|summary):" .claude/agents/ccip-agent-optimizer.md
```
Ожидаем: 5 строк с обязательными полями

- [ ] **Step 3: Верифицировать ключевые секции**

```bash
grep "^## " .claude/agents/ccip-agent-optimizer.md
```
Ожидаем секции: `## Запуск`, `## Алгоритм`, `## Защищённые поля`, `## Жёсткие ограничения`, `## State Update`

```bash
grep "Фаза" .claude/agents/ccip-agent-optimizer.md | wc -l
```
Ожидаем: `3` (три фазы)

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ccip-agent-optimizer.md
git commit -m "feat(agents): add ccip-agent-optimizer — two-phase agent body optimizer"
```

---

### Task 4: Обновить CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:60`

- [ ] **Step 1: Найти точку вставки**

```bash
grep -n "consistency-checker" CLAUDE.md
```
Ожидаем строку вида: `60: | consistency-checker  | по запросу при cross-doc анализе |`

- [ ] **Step 2: Добавить агент в таблицу Auxiliary Agents**

Найти exact string:
```
| consistency-checker         | по запросу при cross-doc анализе       |
| general-purpose             | fallback при DEGRADED specialist       |
```

Заменить на:
```
| consistency-checker         | по запросу при cross-doc анализе       |
| ccip-agent-optimizer        | по запросу: 3+ повторных ошибки агента, новый агент, рефактор CLAUDE.md |
| general-purpose             | fallback при DEGRADED specialist       |
```

- [ ] **Step 3: Верифицировать**

```bash
grep "ccip-agent-optimizer" CLAUDE.md
```
Ожидаем: строку в таблице Auxiliary Agents

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(claude-md): register ccip-agent-optimizer in Auxiliary Agents table"
```

---

### Task 5: Smoke test — запустить агент на реальной цели

Запустить `ccip-agent-optimizer` на `ccip-doc-writer` (Haiku, read-only агент — хороший кандидат для проверки C-03).

- [ ] **Step 1: Запустить агент**

```
Agent: ccip-agent-optimizer
Prompt: ccip-agent-optimizer ccip-doc-writer
```

- [ ] **Step 2: Верифицировать что агент прочитал rules.md**

В выводе агента должна быть ссылка на `.claude/audit/agent-optimizer/rules.md`.

- [ ] **Step 3: Верифицировать что findings содержат хотя бы одну запись**

`ccip-doc-writer` имеет `model: claude-haiku-4-5-20251001` и `tools: Read, Write, Edit, Glob, Grep` без Bash — ожидаем как минимум диагностику C-03 (нет нарушения) и проверку S-04 (State Update).

- [ ] **Step 4: Верифицировать запись в errors_log.md**

```bash
grep "Agent Optimizer.*ccip-doc-writer" docs/errors/errors_log.md
```
Ожидаем: строку с результатом аудита

- [ ] **Step 5: Commit если агент внёс auto-fix изменения**

```bash
git diff .claude/agents/ccip-doc-writer.md
```
Если есть изменения (например добавлен State Update шаблон):
```bash
git add .claude/agents/ccip-doc-writer.md docs/errors/errors_log.md
git commit -m "fix(agents): ccip-agent-optimizer auto-fixes on ccip-doc-writer"
```

---

## Self-Review

### Spec coverage

| Требование из спека | Task |
|---|---|
| Внешний реестр правил с lifecycle `draft→active→deprecated` | Task 1 ✓ |
| 10 правил: S-01..S-04, Q-01..Q-04, C-01..C-03 | Task 1 ✓ |
| `docs/proposed-agent-changes.md` | Task 2 ✓ |
| Двухфазный агент: анализ → действие | Task 3 ✓ |
| Защищённые поля (description/tools/model) | Task 3 ✓ |
| Жёсткие ограничения | Task 3 ✓ |
| State Update блок | Task 3 ✓ |
| Регистрация в CLAUDE.md Auxiliary Agents | Task 4 ✓ |
| Smoke test на реальной цели | Task 5 ✓ |

### Placeholder scan

Нет TBD/TODO. Все шаги содержат конкретный контент.

### Type consistency

- `proposed-agent-changes.md` — формат записи одинаков в Task 2 (placeholder) и Task 3 (agent body)
- `errors_log.md` формат одинаков в Task 3 (agent body) и Task 5 (верификация)
- Имена файлов согласованы во всех задачах
