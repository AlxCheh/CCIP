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
