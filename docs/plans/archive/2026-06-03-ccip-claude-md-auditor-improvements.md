# ccip-claude-md-auditor Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить 6 конкретных слабых мест агента `ccip-claude-md-auditor`: неполная валидация frontmatter, наивная эвристика списков, неопределённое место флагирования drift §15/§16, отсутствие проверки backup-агентов, слабая нотификация PENDING-изменений, отсутствие SHA-diff между аудитами.

**Architecture:** Все изменения — точечные правки тела одного файла `.claude/agents/ccip-claude-md-auditor.md`. Новые инструкции вписываются в существующий 5-шаговый алгоритм без изменения его структуры. Правки к routing-логике не затрагиваются.

**Tech Stack:** Markdown (agent prompt), Edit tool, Bash grep для верификации.

---

## File Map

| Действие | Файл | Что меняется |
|---|---|---|
| Modify | `.claude/agents/ccip-claude-md-auditor.md` | Все 6 задач ниже |

---

### Task 1: Валидация обязательных полей frontmatter (Step 2.2b)

**Files:**
- Modify: `.claude/agents/ccip-claude-md-auditor.md`

Текущий Step 2.2 проверяет только существование файлов и синхронизацию `description:`. Нет проверки обязательных полей `model:`, `summary:`, `tools:`.

- [ ] **Step 1: Прочитать текущее содержимое Step 2.2**

```bash
grep -n "2.2" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем строку с `#### 2.2 Проверка таблицы субагентов`.

- [ ] **Step 2: Добавить Step 2.2b после блока 2.2**

Найти строку (точный текст из файла):
```
#### 2.3 Проверка ADR-ссылок
```

Вставить перед ней новый блок:
```markdown
#### 2.2b Проверка обязательных полей frontmatter

Для каждого `.claude/agents/*.md` читать `limit:10` строк:
- `name:` — присутствует
- `description:` — присутствует и непустой
- `model:` — присутствует (`claude-haiku-4-5-20251001` или `claude-sonnet-4-6`)
- `tools:` — присутствует
- `summary:` — присутствует, ≤200 символов, без переносов строк

Если поле отсутствует → добавить в `docs/errors/errors_log.md` с тегом `[MISSING-FRONTMATTER: <agent-name>.<field>]`. Не редактировать файл агента — только флагировать.

---

```

- [ ] **Step 3: Верифицировать изменение**

```bash
grep -n "MISSING-FRONTMATTER" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: строку с `[MISSING-FRONTMATTER: <agent-name>.<field>]`.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ccip-claude-md-auditor.md
git commit -m "feat(auditor): add frontmatter field validation step 2.2b"
```

---

### Task 2: Фикс эвристики "список > 7 пунктов" (Step 3, пункт 3)

**Files:**
- Modify: `.claude/agents/ccip-claude-md-auditor.md`

Текущая эвристика предлагает сжимать любой список длиннее 7 пунктов. Это неверно: список из 8 критических ADR-правил нельзя сжать без потери смысла. Нужна проверка семантических дублей.

- [ ] **Step 1: Найти текущий пункт 3 в Step 3**

```bash
grep -n "Раздутые списки" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем строку вида `3. **Раздутые списки:** любой список > 7 пунктов — кандидат на сжатие.`

- [ ] **Step 2: Заменить пункт**

Найти exact string:
```
3. **Раздутые списки:** любой список > 7 пунктов — кандидат на сжатие.
```

Заменить на:
```
3. **Семантические дубли:** внутри одного списка найти пункты с одинаковым смыслом. Кандидат на слияние — два пункта, описывающих одно действие разными словами. Длина списка не является критерием для сжатия.
```

- [ ] **Step 3: Верифицировать**

```bash
grep -n "Семантические дубли" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: строку с новым текстом.

```bash
grep -n "Раздутые списки" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: нет совпадений.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ccip-claude-md-auditor.md
git commit -m "fix(auditor): replace naive list-length heuristic with semantic duplicate check"
```

---

### Task 3: Уточнить место флагирования drift §15/§16 (Правило 6)

**Files:**
- Modify: `.claude/agents/ccip-claude-md-auditor.md`

Текущее правило 6 говорит "флагить RU-прозу как drift" без указания куда. Агент не знает что делать с флагом.

- [ ] **Step 1: Найти правило 6**

```bash
grep -n "§15/§16" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем строку с правилом 6.

- [ ] **Step 2: Заменить правило**

Найти exact string:
```
6. §15/§16 — норма EN машинно-компакт. Флагить RU-прозу в §15/§16 как drift. Инварианты валидатора (`tools/audit/state-contract-section.js`): заголовок `## §15`, строки `session-state.json` / `State Update` / `session-state.schema.json`, заголовок `## §16` — сохранять при любых правках.
```

Заменить на:
```
6. §15/§16 — норма EN машинно-компакт. Если в §15 или §16 появилась RU-проза (не машинно-читаемый блок) — добавить запись в `docs/errors/errors_log.md` с тегом `[DRIFT-§15]` или `[DRIFT-§16]`, не редактировать секцию самостоятельно. Инварианты валидатора (`tools/audit/state-contract-section.js`): заголовок `## §15`, строки `session-state.json` / `State Update` / `session-state.schema.json`, заголовок `## §16` — сохранять при любых правках.
```

- [ ] **Step 3: Верифицировать**

```bash
grep -n "DRIFT-§15" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: строку с тегом.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ccip-claude-md-auditor.md
git commit -m "fix(auditor): clarify drift flag destination for §15/§16"
```

---

### Task 4: Добавить проверку backup-агентов (Step 2.5)

**Files:**
- Modify: `.claude/agents/ccip-claude-md-auditor.md`

Нет проверки корректности backup-агентов: агент может быть сам себе backup, или для высокорискового intent задан слишком слабый fallback.

- [ ] **Step 1: Найти конец Step 2.4**

```bash
grep -n "2.4\|Архитектурных" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем строки с `#### 2.4` и его завершением.

- [ ] **Step 2: Добавить Step 2.5 после 2.4**

Найти exact string (строка после блока 2.4):
```
---

### Шаг 3 — Быстрая проверка (всегда)
```

Вставить перед ней:
```markdown
#### 2.5 Проверка backup-агентов

Для каждой строки таблицы "Intent → Agent → Backup" в CLAUDE.md:
- Backup == Agent (агент сам себе backup) → `[IDENTICAL-BACKUP: <intent>]` в errors_log
- Backup == `general-purpose` при intent из `ARCH / SECURITY / SCHEMA` → `[WEAK-BACKUP: <intent>]` в errors_log
- Backup-файл `.claude/agents/<backup-name>.md` не существует → `[MISSING-BACKUP-FILE: <backup-name>]` в errors_log

Не изменять таблицу — только флагировать. Исправление backup требует явного подтверждения пользователя.

---

```

- [ ] **Step 3: Верифицировать**

```bash
grep -n "IDENTICAL-BACKUP\|WEAK-BACKUP\|MISSING-BACKUP-FILE" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: все три тега присутствуют.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ccip-claude-md-auditor.md
git commit -m "feat(auditor): add backup-agent validation step 2.5"
```

---

### Task 5: Улучшить PENDING_HUMAN_REVIEW нотификацию

**Files:**
- Modify: `.claude/agents/ccip-claude-md-auditor.md`

При записи в `proposed-claude-md-changes.md` агент добавляет строку в errors_log, но не передаёт информацию о pending-изменениях в handoff_notes State Update. Следующий агент не знает, что есть непросмотренные предложения.

- [ ] **Step 1: Найти текущий блок PENDING_HUMAN_REVIEW**

```bash
grep -n "PENDING_HUMAN_REVIEW\|PENDING-REVIEW" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем строки с инструкцией по записи в errors_log.

- [ ] **Step 2: Расширить инструкцию — добавить пункт 3**

Найти exact string:
```
2. Добавить запись в `errors_log.md` с тегом `[PENDING-REVIEW]`.
3. **НЕ применять изменение** — ждать явного подтверждения пользователя.
```

Заменить на:
```
2. Добавить запись в `docs/errors/errors_log.md` с тегом `[PENDING-REVIEW]`:
   ```markdown
   ## PENDING-REVIEW — <YYYY-MM-DD>
   **Файл:** docs/proposed-claude-md-changes.md
   **Секция:** <название секции>
   **Действие required:** явное подтверждение пользователя перед применением изменения
   ```
3. В блоке `## State Update` (handoff_notes) явно указать: `"PENDING: есть неподтверждённые изменения в docs/proposed-claude-md-changes.md"`.
4. **НЕ применять изменение** — ждать явного подтверждения пользователя.
```

- [ ] **Step 3: Верифицировать**

```bash
grep -n "handoff_notes" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: строку с упоминанием handoff_notes и PENDING.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ccip-claude-md-auditor.md
git commit -m "feat(auditor): surface PENDING changes in State Update handoff_notes"
```

---

### Task 6: SHA-based diff между аудитами (Steps 1 и 5)

**Files:**
- Modify: `.claude/agents/ccip-claude-md-auditor.md`

Каждый запуск не знает, что именно изменилось с прошлого аудита — делает полный git log вместо прицельного diff. Нужно хранить SHA последнего аудита и сравнивать с ним.

- [ ] **Step 1: Найти начало Step 1 в алгоритме**

```bash
grep -n "git log --since" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: строку с командой git log.

- [ ] **Step 2: Добавить SHA-lookup перед git log**

Найти exact string:
```
Проверить изменения с момента последнего аудита:

```
git log --since="7 days ago" --name-only --pretty=format: -- \
```

Заменить на:
```
Проверить изменения с момента последнего аудита.

Сначала найти SHA предыдущего аудита:
```bash
grep -m1 "Last-Audit-SHA:" docs/errors/errors_log.md | awk '{print $2}'
```

- Если SHA найден (`<sha>`) → использовать точный diff:
  ```bash
  git diff <sha>..HEAD --name-only -- docs/decisions/ .claude/agents/ docs/delivery/ docs/architecture/ CLAUDE.md
  ```
- Если SHA не найден (первый запуск) → использовать git log:
  ```bash
  git log --since="7 days ago" --name-only --pretty=format: -- \
```

- [ ] **Step 3: Добавить запись SHA в Step 5**

Найти exact string в шаблоне Step 5:
```
**Удалено дублирований:** <N>
```

Заменить на:
```
**Удалено дублирований:** <N>
**Last-Audit-SHA:** <результат `git rev-parse HEAD`>
```

- [ ] **Step 4: Верифицировать оба изменения**

```bash
grep -n "Last-Audit-SHA" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: 2 совпадения (в Step 1 и в шаблоне Step 5).

```bash
grep -n "git diff.*HEAD" .claude/agents/ccip-claude-md-auditor.md
```
Ожидаем: строку с SHA-based diff командой.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/ccip-claude-md-auditor.md
git commit -m "feat(auditor): add SHA-based diff to focus audit on changed sections"
```

---

## Self-Review

### Spec coverage

| Слабое место (из анализа) | Task |
|---|---|
| Нет валидации frontmatter полей | Task 1 ✓ |
| Наивная эвристика >7 пунктов | Task 2 ✓ |
| Неопределённое место для drift §15/§16 | Task 3 ✓ |
| Нет проверки backup-агентов | Task 4 ✓ |
| PENDING без нотификации в handoff | Task 5 ✓ |
| Нет diff между аудитами | Task 6 ✓ |
| Haiku на сложном объекте | вне scope — требует отдельного решения по модели |
| Event-driven хук на добавление агентов | вне scope — требует изменения settings.json |

### Placeholder scan

Нет TBD/TODO/placeholder в задачах. Все edit-команды содержат exact strings.

### Consistency check

- Теги ошибок унифицированы: `[MISSING-FRONTMATTER]`, `[DRIFT-§15/§16]`, `[IDENTICAL-BACKUP]`, `[WEAK-BACKUP]`, `[MISSING-BACKUP-FILE]`, `[PENDING-REVIEW]` — все разные, нет конфликтов.
- `Last-Audit-SHA:` используется в Step 1 (чтение) и Step 5 (запись) — согласовано.
- Все изменения в одном файле, нет зависимостей между задачами — их можно выполнять в любом порядке.
