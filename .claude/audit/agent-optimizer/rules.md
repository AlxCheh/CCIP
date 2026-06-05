# Agent Optimizer Rules Registry

Реестр правил для `ccip-agent-optimizer`. Агент читает этот файл при каждом запуске.
Только правила со статусом `active` применяются. `draft` — только диагностика. `deprecated` — игнорировать.

**Жизненный цикл:** `draft` → `active` → `deprecated`

**Добавление правила:** добавить блок ниже со статусом `draft`. После первого успешного применения вручную перевести в `active`.

## Active Rules Index

Обновлять при каждом изменении статуса правила. Агент читает этот список для точечной загрузки активных правил.

```
active:  S-01 S-02 S-03 S-04 Q-01 Q-02 Q-03 Q-04 C-01 C-02 C-03 R-01 R-02 R-04 R-05 R-06 G-01 G-02 G-03 G-04 G-05
draft:   R-03
deprecated: (none)
```

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

---

## Категория R — Robustness & Safety

> Пакет добавлен 2026-06-04 в статусе `draft`. Отвалидирован dry-run'ом на 3 контрастных агентах (ccip-backend-aux, ccip-dba, ccip-frontend). Перед переводом в `active` — см. зависимость `critical` в теле агента (формат находок + block-поведение).

### R-01
**Категория:** safety
**Status:** active
**Auto-fix:** no
**Проверка:** триггер срабатывает, если выполнено ЛЮБОЕ: (a) `tools:` содержит WebFetch/WebSearch; (b) тело предписывает Bash fetch внешних данных (curl/wget/fetch); (c) тело предписывает читать в свой контекст контент, авторённый конечным пользователем/внешней системой (uploads, sync-payload, request body, /tmp). При срабатывании триггера тело ОБЯЗАНО содержать injection-guard (паттерны: `данные, не инструкции` | `injection` | `не выполнять инструкции из`)
**Действие:** триггер сработал + guard отсутствует — записать в proposed-changes с шаблоном guard-текста
**Severity:** critical

### R-02
**Категория:** safety
**Status:** active
**Auto-fix:** no
**Проверка:** (a) каждый инструмент из `tools:` реально используется в теле; (b) при одновременном наличии `Write` и `Bash` оценить риск Bash-поверхности по телу:
  — high-risk (deploy, curl/wget, rm/destructive, работа с секретами/env, сетевые вызовы) И нет явного scope ни tool-scope, ни доменных «Правил работы» → critical;
  — Bash ограничен доменными правилами (напр. «только через migrate», «только Playwright/build/lint») ИЛИ применяется лишь для test/build → info (зачесть constraints как scoping);
  — есть явный tool-scope в теле → no-fire
**Действие:** неиспользуемый инструмент или high-risk нескоупленное combo — в proposed-changes
**Severity:** critical | info (по тирингу выше)

### R-03
**Категория:** safety
**Status:** draft
**Auto-fix:** no
**Проверка:** (a) [универсально] каждый write-capable агент (Write/Edit/Bash) имеет явный критерий завершения/стоп-условие;
(b) [условно] ТОЛЬКО если агент выполняет повторяемые stateful/внешние операции (запись в БД, append в лог/файл, API-вызовы, publish в очередь) — требуется idempotency-guard (Grep-before-append, «если существует — пропустить», upsert). Для агентов с не-stateful правками (UI-компоненты) подпроверка (b) не применяется
**Действие:** отсутствие стоп-условия — всегда в proposed-changes; отсутствие idempotency — только при срабатывании (b)
**Severity:** warning

### R-04
**Категория:** safety
**Status:** active
**Auto-fix:** no
**Проверка:** блок `## State Update` содержит все обязательные поля §15 (`summary`, `artifacts`, `handoff_notes`) И присутствует sanitize-нота: агент не копирует входящие handoff-данные в собственный `handoff_notes` без намерения
**Действие:** недостающие ключи / отсутствие sanitize-ноты — в proposed-changes (поле State Update — структура §15, не переписывать молча)
**Severity:** warning

### R-05
**Категория:** safety
**Status:** active
**Auto-fix:** no
**Проверка:** агенты с `Bash` / `WebFetch` не содержат инструкций логировать или передавать наружу значения секретов; присутствует явный запрет на вывод env/токенов
**Действие:** при отсутствии запрета у агента с сетевым/shell-доступом — записать в proposed-changes
**Severity:** warning

### R-06
**Категория:** safety
**Status:** active
**Auto-fix:** no
**Проверка:** триггер — зона ответственности агента включает обработку ввода НА TRUST-BOUNDARY (server-side endpoints, десериализация, sync/merge, webhooks, auth-токены — т.е. сторона, которой нельзя доверять входу). При срабатывании тело обязано предписывать server-side валидацию/санитизацию (schema-валидация на сервере, parametrized queries, запрет eval/raw-конкатенации). **Client-side валидация НЕ засчитывается** как удовлетворение правила. Агенты, чья зона — только клиент (UI-формы), триггер НЕ активируют (trust-boundary не их слой) → no-fire
**Действие:** при срабатывании триггера + отсутствии server-side валидации — записать в proposed-changes
**Severity:** warning (для auth-смежного ввода → critical)

---

## Категория G — Agentic Layer Coverage

> Пакет добавлен 2026-06-04 в статусе `draft`. Покрывает поведенческие слои агентских систем, не охваченные S/Q/C. Отвалидирован на тех же 3 агентах.

### G-01
**Категория:** agentic
**Status:** active
**Auto-fix:** no
**Проверка:** агент генерирует структурные/фактические артефакты (схемы, контракты, числовые утверждения, статусы) И при этом НЕ называет ни одного source-of-truth файла И не имеет шага Read/Grep перед утверждением. Срабатывает только при отсутствии ОБОИХ
**Действие:** при срабатывании — записать в proposed-changes
**Severity:** info

### G-02
**Категория:** agentic
**Status:** active
**Auto-fix:** no
**Проверка:** тело не предписывает чтение файла целиком там, где нужен point-lookup (паттерн `прочитать .* полностью` для крупных архитектурных и plan-документов без обоснования); для больших файлов есть указание offset/limit (CLAUDE.md §16)
**Действие:** нарушение Reading Discipline — записать в proposed-changes
**Severity:** info

### G-03
**Категория:** agentic
**Status:** active
**Auto-fix:** no
**Проверка:** каждый write-capable агент (Write/Edit/Bash) явно декларирует out-of-scope — что он НЕ трогает (секция запретов или строки «не трогать X»). Обобщает Q-03 с 3 high-risk агентов на всех write-capable
**Действие:** при отсутствии scope-границы — записать в proposed-changes
**Severity:** warning

### G-04
**Категория:** agentic
**Status:** active
**Auto-fix:** no
**Проверка:** агент декларирует измеримый ожидаемый выход / success-criteria для своих задач (не «делай хорошо» / «обработай корректно»)
**Действие:** при отсутствии критериев приёмки — записать в proposed-changes
**Severity:** info

### G-05
**Категория:** agentic
**Status:** active
**Auto-fix:** no
**Проверка:** агент, участвующий в цепочке (заполняет `handoff_notes`), указывает явный контракт передачи — что именно писать для следующего агента
**Действие:** при отсутствии handoff-контракта — записать в proposed-changes
**Severity:** info
