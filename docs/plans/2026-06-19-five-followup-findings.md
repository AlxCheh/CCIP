# Plan: 5 follow-up findings from M-05c / M-11 W3 (advanced analytics) branch

> Источник: 5 пунктов, зафиксированных как "вне скоупа" при завершении PR #28
> (`worktree-m11-w4-workpace-analytics`). Каждый пункт расследован (root cause
> подтверждён чтением кода/схемы/спеки, не предположением) перед написанием шагов.
> Пункты независимы друг от друга — можно исполнять по отдельности, в любом порядке,
> каждый со своим коммитом/PR.

---

## Сводка

| # | Находка | Корневая причина | Объём | Агент |
|---|---------|-------------------|-------|-------|
| 1 | D-03..D-06 SLA timing + D-09 clearFlag | Сценарий A реализован и покрыт unit-тестами; Сценарий B (D-05/D-06) не реализован вообще; D-09 — `clearSystemicFlag` уже реализован, нет только теста | Среднее (B) + малое (D-09 тест) | ccip-backend-core |
| 2a | C-03 провал | Нет авто-перехода периода при истечении gpToken без ответа ГП — `upsertPeriodFact` бросает `PERIOD_WRONG_STATUS` | Малое-среднее | ccip-backend-core |
| 2b | C-04 провал | `submitGp` не валидирует защищённые поля (`planVolumeOverride`) — фичи нет | Малое | ccip-backend-core |
| 2c | C-07/C-09 провал | Рассинхрон сигнатуры: тест передаёт `{scVolume, workAccessible}`, метод принимает только сырое число; `workAccessible` — реальное понятие из алгоритма (Тип 2 требует фото) | Среднее | ccip-backend-core |
| 2d | B-07 провал | ✅ Сделано (`ebb700b`) — опечатка + 2 смежные находки (B-01 опечатка, B-03/B-06 — отдельные missing-feature находки, см. ниже) | Тривиальное | любой |
| 2e | ADR-007 провал | Тест бьёт UPDATE через `ccip_owner` (владелец таблиц), а не через `ccip_app` — REVOKE не может сработать; у `ccip_app` нет пароля для подключения | Малое | ccip-qa |
| 3 | pg_cron crash-loop (`ccip_postgres` dev, :5432) | `docker-compose.yml` использует `postgres:16-alpine` вместо кастомного `ccip-postgres` (с pg_partman/pg_cron); CHANGELOG.md ложно утверждает, что правка уже внесена — git-история показывает, что нет | Тривиальное | ccip-devops |
| 4 | Governance: `session-state.schema.json` не объявляет `degraded` | `failure-detectors.js` пишет `{kind, degraded: string[], threshold}`, схема же документирует несуществующие `count`/`backup` для этого `kind` (мёртвые поля, никем не пишутся/не читаются) | Тривиальное | general-purpose |
| 5 | `docs/project-state.md` не обновлён | Копия в worktree форкнута до того, как M-11 W1/W2 попали в main; правка отсюда конфликтовала бы | Тривиальное | ccip-doc-writer |

---

## Phase 1 — SLA Сценарий B (D-05/D-06) + D-09 тест ✅ Сделано (2026-06-20, коммит `984ab52`, ветка `feat/sla-scenario-b`)

**Контекст (algorithm_v1_3.md §Блок D, строки 363-389, 780-784):**
- Сценарий A (день 3 — уведомление директора, день 5 — принудительное закрытие SC) **уже реализован** в `DisputeSlaService.scheduleEvents` + `DisputeSlaWorker`, покрыт unit-тестами (`dispute-sla.service.spec.ts`, `dispute-sla.worker.spec.ts`). D-03/D-04 integration-заглушки в `d-block-dispute-sla.integration.spec.ts` дублируют уже закрытое unit-покрытие — это просто "расконсервировать" заглушки с лёгким integration-смоук-тестом, не новая фича.
- Сценарий B (спор, ГП ответил, SC не принял): день 3 после `gc_response` — эскалация директору с описанием спора; директор может: принять решение, либо `'Назначить экспертизу'` → HOLD; день 14 после `gc_response`, если `director.decision == NULL` — система применяет `site_control.measure(work_id)` (консервативная оценка), статус `'Спор не урегулирован'`, период закрывается. **Этого сценария нет в коде вообще** — ни в `scheduleEvents`, ни в `DisputeSlaWorker`.
- D-09 (`clearSystemicFlag`) — **уже реализован** в `dispute-flag.service.ts:67` (помечает уведомления директора `readAt`). Тест-заглушка `it.skip('D-09: ... clearSystemicFlag not yet implemented')` — комментарий устарел, метод есть, нужен только тест.

**Files:**
- Modify: `apps/api/src/modules/dispute-sla/dispute-sla.service.ts` — добавить `scenario: 'B'` ветку в `scheduleEvents` (триггер — `gc_response` получен и не принят SC, не сразу при создании диспута)
- Modify: `apps/api/src/modules/dispute-sla/dispute-sla.worker.ts` — обработка `eventType === 'escalate_director_day3'` и `eventType === 'sla_b_ceiling_day14'`
- Modify: `apps/api/src/modules/dispute-sla/__tests__/dispute-sla.service.spec.ts`, `dispute-sla.worker.spec.ts` — unit-тесты для сценария B (мокнутый Prisma, тот же паттерн что и для A)
- Modify: `apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts` — снять `it.skip` с D-03/D-04 (лёгкий smoke), написать D-05/D-06 integration-тест, написать D-09 тест на `clearSystemicFlag`

**Решено (2026-06-19):** триггер Сценария B — новый явный flow, не вывод из существующего кода (его не существовало). `DisputeService.submitGpResponse(discrepancyId, gpPosition)` пишет `gpPosition` + новое поле `Discrepancy.gcResponseAt`; отдельный `DisputeService.rejectGpResponse(discrepancyId, actorId)` (SC явно отклоняет ответ) запускает `scheduleEvents({scenario: 'B', gcResponseAt, ...})`.

**Steps:**
1. Миграция (hand-written, см. precedent ветки `worktree-m11-w4-workpace-analytics`): `Discrepancy.gcResponseAt DateTime? @map("gc_response_at")`.
2. `DisputeService.submitGpResponse(discrepancyId, gpPosition)` — валидирует период/discrepancy существуют и `status === 'open'`, пишет `gpPosition` + `gcResponseAt = now()`.
3. `DisputeService.rejectGpResponse(discrepancyId, actorId)` — SC явно отклоняет позицию ГП; вызывает `disputeSla.scheduleEvents({ scenario: 'B', discrepancyId, periodId, boqItemId, gcResponseAt })`.
4. В `DisputeSlaService.scheduleEvents`: ветка `scenario === 'B'` создаёт `escalate_director_day3` (scheduledAt = gcResponseAt + 3 дня), `sla_b_ceiling_day14` (scheduledAt = gcResponseAt + 14 дней).
5. Обработчик в `DisputeSlaWorker`: `escalate_director_day3` → уведомление директору с деталями спора (`type: 'sla_b_escalation'`); `sla_b_ceiling_day14` → если `director.decision == null`, применить `scVolume` стройконтроля как `acceptedVolume`, `discrepancyStatus = 'Спор не урегулирован'`, закрыть позицию.
6. Юнит-тесты по аналогии с существующими A-тестами (мокнутый Prisma) для `submitGpResponse`/`rejectGpResponse`/scenario-B scheduling/worker handling.
7. В `d-block-dispute-sla.integration.spec.ts`: убрать `it.skip` для D-03/D-04 (smoke: `scheduleEvents` создаёт нужные записи), написать D-05/D-06 (полный цикл через `rejectGpResponse` → `DisputeSlaWorker.process`), написать D-09 (`clearSystemicFlag` снимает `readAt`/флаг с уведомлений директора).
8. `pnpm --filter @ccip/api exec tsc --noEmit`; unit suite; `--testPathPatterns="dispute-sla|d-block"`.
9. Commit: `feat(dispute-sla): SLA Scenario B (D-05/D-06) + activate D-03/D-04/D-09 tests`.

**Риск:** Среднее — новая бизнес-логика (Сценарий B) и новый API/поле схемы (`gcResponseAt`), но триггер теперь зафиксирован.

**Находка при реализации (отклонение от плана, в лучшую сторону):** event_type-имена из плана (`escalate_director_day3`, `sla_b_ceiling_day14`) не существовали — реальный `sla_events_event_type_check` (CHECK constraint, `0001_initial`) уже **с самого начала** включал ровно нужные значения для Сценария B: `director_deadline_day7` и `sc_figure_applied_day14` (плюс переиспользуемый `notify_director_day3`). Схема предвосхищала фичу — миграция CHECK не понадобилась, только новая колонка `gc_response_at`. День-3-уведомление и день-14-ceiling совпадают по таймингу с `algorithm_v1_3.md` (день 3 — нотификация, день 7 — дедлайн решения директора, день 14 — жёсткий потолок); день-7 обработчик добавлен как напоминание-нотификация директору (нет API установки `directorDecision` — вне скоупа D-05/D-06, поле осталось неиспользуемым кроме чтения в guard `if (discrepancy.directorDecision != null) return`).

D-03/D-04 `it.skip`-заглушки в `d-block-dispute-sla.integration.spec.ts` оказались мёртвыми дублями: реальные тесты на оба события уже существовали в соседнем `d-block-sla-worker.integration.spec.ts` (прямой вызов `worker.process()`, без BullMQ) — заглушки заменены комментарием-ссылкой. D-05/D-06 написаны туда же, тем же паттерном. D-09 также оказался уже полностью реализован и протестирован (коммит `c29e61d`, до начала этой фазы) — отдельной работы не требовалось.

Полный интеграционный прогон на этой ветке (срублена от `main`, без сиблинг-фиксов B/C/ADR-007-веток): 10 ожидаемых провалов (5 B-block + 4 C-block + 1 ADR-007 — все три не смешаны в эту ветку), D-block — все 9 тестов зелёные, регрессий нет.

---

## Phase 2 — Починка 10 pre-existing integration-провалов

Все 6 уникальных тестов расследованы; ниже — точечные фиксы, не общий "разберись и почини".

### 2a. C-03 — GP не отправил шаблон ✅ Сделано (2026-06-19, коммит `109ff75`, ветка `fix/c-block-missing-features`)

**Причина:** `upsertPeriodFact` проверяет `SC_FACT_ALLOWED_STATUSES = ['gp_submitted', 'verification']`; период с истёкшим `gpTokenExpiresAt`, но без `submitGp`, остаётся в статусе `'open'` — SC физически не может ввести данные, хотя по алгоритму должен (ввод "без шаблона").

Реализовано: `noTemplateInput = period.status === 'open' && period.gpTokenExpiresAt != null && period.gpTokenExpiresAt < new Date()`; при истинном условии вход разрешён без проверки `SC_FACT_ALLOWED_STATUSES`, и `auditLog.log` пишет `action: 'period_fact_input_without_template'` вместо `'period_fact_upserted'`. Новое значение constraint потребовало миграции (см. ниже). Тест C-03 переписан под сырой `scVolume: number` (была сигнатурная ошибка теста — объект `{ scVolume: 100 }` вместо числа), `console.warn`-fallback убран, `expect(log).not.toBeNull()` жёсткий.

### 2b. C-04 — защищённое поле ГП ✅ Сделано (2026-06-19, коммит `109ff75`, ветка `fix/c-block-missing-features`)

**Причина:** `submitGp` не валидирует, что ГП не модифицировал `planVolumeOverride` (защищённая колонка шаблона) — фичи нет.

Реализовано: в `submitGp` для каждой позиции из `items` сверка ключей с разрешённым набором `{boqItemId, gpVolume, gpNote}`; любой лишний ключ (напр. `planVolumeOverride`) → `ConflictException('PROTECTED_FIELD')`.

### 2c. C-07/C-09 — `workAccessible` параметр ✅ Сделано (2026-06-19, коммит `109ff75`, ветка `fix/c-block-missing-features`)

**Причина:** тест передаёт `{ scVolume, workAccessible }`, метод ожидает сырое число; `work_accessible=FALSE` в спеке — реальный триггер требования фото и Типа 2 (`algorithm_v1_3.md` строка 847: "Тип 2 без фото → блокировка сохранения").

**Решено (2026-06-19):** отдельный `opts` параметр, не объектная форма 3-го аргумента. `upsertPeriodFact(periodId, boqItemId, scVolume: number, actorId, opts?: { workAccessible?: boolean })` (Task 3 `spikeResponse` — в worktree PR#28, не на этой ветке, см. ниже). Старые вызовы с сырым числом (D-block) не меняются.

Реализовано: `opts?: { workAccessible?: boolean }` добавлен в `upsertPeriodFact`; при `opts?.workAccessible === false` проверяется наличие `Photo` для пары `periodId`+`boqItemId` — при отсутствии бросает `ConflictException('TYPE2_PHOTO_REQUIRED')`. Вызовы в `c-block-period.integration.spec.ts` переписаны: `{ scVolume: N, workAccessible }` → `N, sc.id, { workAccessible }` (C-07/C-09); сигнатура для D-block не менялась.

**Побочный артефакт (все три пункта):** новая миграция `20260620000000_audit_log_action_input_without_template` — расширяет `audit_log_action_check` значением `'period_fact_input_without_template'`. Constraint уже содержал 4 значения без миграций в репо (живой DB drift, обнаружено через `pg_constraint`); миграция явно перечисляет полный известный набор (11 значений) с учётом параллельной ветки `fix/b07-zero-report-source-typo`, чтобы слияние в любом порядке сходилось к одному итогу (см. комментарий в файле миграции).

**Примечание:** ветка `fix/c-block-missing-features` срублена от `main`, поэтому НЕ содержит Task1-3 правки (`plannedPause`/`spikeResponse`) из ещё не слитого PR#28 worktree — при мерже потребуется ручная сверка сигнатуры `upsertPeriodFact` (5-й параметр `opts`) между обеими ветками.

### 2d. B-07 — опечатка ✅ Сделано (2026-06-19, коммит `ebb700b`, ветка `fix/b07-zero-report-source-typo`)

Фактический объём оказался шире изначально записанного — по пути обнаружены и исправлены 2 смежные находки в том же файле/модуле:
1. `'field_measure'` → `'field_measurement'` (B-07, как и планировалось).
2. **Доп. находка:** `'execution_doc'` → `'exec_docs'` (B-01) — та же категория опечатки, блокировала чистый прогон файла, исправлено заодно.
3. **Доп. находка (с подтверждением пользователя):** `ZeroReportService.submit()`/`APPROVE_ALLOWED_STATUSES` писали/ожидали `status: 'submitted'`, но CHECK-constraint в БД (`zero_reports_status_check`) допускает только `'pending_approval'` для этого состояния — каждый реальный `submit()`/`approve()` падал в интеграции (юнит-тесты не ловили, т.к. мокают Prisma). Переименовано в `zero-report.service.ts` + 2 юнит-теста.

**B-03/B-06 — реализовано отдельно (2026-06-19, коммит `0144a75`, та же ветка):**
- **B-03**: `approve()` теперь проверяет (Блок B, B3 алгоритма) — каждый `BoqItem` боqVersion'а должен иметь `ZeroReportItem` (иначе `ZERO_REPORT_NOT_ALL_ITEMS`); для позиций с `weightCoef >= weight_threshold` (SystemConfig, дефолт 0.1) или `isCritical` требуется `crossVerified` (все 3 документа) — иначе `ZERO_REPORT_CROSS_VERIFICATION_REQUIRED`.
- **B-06**: `upsertItem()` пишет `audit_log` запись (`action: 'zero_report_item_corrected'`, old/new `factVolume`) при коррекции существующей позиции — per `CorrectZeroReport` (LOG ZeroReportCorrection).
- **Побочная находка по пути:** `audit_log_action_check` constraint в живой тест-БД уже содержал `period_opened`/`period_closed`/`gp_submitted`/`period_fact_upserted` — недокументированный drift (ни в одной миграции). Новая миграция `20260619120000_widen_audit_log_action_check` зафиксировала это как источник правды + добавила `zero_report_item_corrected`.
- Полный интеграционный прогон после фикса: 5 оставшихся провалов — ровно C-03/C-04/C-07/C-09/ADR-007 (Phase 2a/2b/2c/2e), регрессий нет.

Оба — вероятно отсутствующие фичи в M-04 (ZeroReport), не баги уровня опечатки; не трогал без отдельного решения.

### 2e. ADR-007 — REVOKE-тест бьёт через owner-роль ✅ Сделано (2026-06-20, коммит `7261a15`, ветка `fix/adr-007-app-role-test`)

**Реализовано иначе, чем планировалось (проще):** без отдельной миграции. Пароль для `ccip_app` ставится прямо в тесте через уже открытое `prisma` (`ccip_owner`-соединение, у которого есть `CREATEROLE` — оно и создавало роль в `0001_initial`): `prisma.$executeRawUnsafe("ALTER ROLE ccip_app PASSWORD '...'")`. Хардкод пароля в migration-файле применялся бы и в проде — отказался от этого осознанно, поставил пароль только в test-fixture (только для test DB на :5434). Второй клиент — `pg.Client` (не второй `PrismaClient`, пакет `pg` уже используется в `global-setup.ts`), подключён через `TEST_DB_URL` с подменёнными `username`/`password`, используется ровно для проверочного `UPDATE` (INSERT остаётся через основной `prisma`/`ccip_owner`, как и раньше — это просто сетап фикстуры). Заодно исправлена та же сигнатурная ошибка (`{ scVolume: 50 }` → `50`), что и в C-03/C-07/C-09 (Phase 2c) — здесь она не влияла на результат теста (closed-period проверка отрабатывает раньше использования `scVolume`), но чинится для консистентности.

Полный интеграционный прогон на этой ветке (срублена от `main`, без фиксов сиблинг-веток): 9 ожидаемых провалов (5 B-block + 4 C-block — ровно то, что не смешано в эту ветку), ADR-007 теперь чист, регрессий нет.

---

## Phase 3 — pg_cron crash-loop (`ccip_postgres` dev, :5432)

**Причина (подтверждена git-историей, не предположение):** `CHANGELOG.md` строка 17 утверждает: *"`infra/docker/docker-compose.yml`: postgres service использует local build вместо `postgres:16-alpine`"* — но `git log --oneline -- infra/docker/docker-compose.yml` показывает, что этот файл **никогда** не менялся для этой цели (только 3 несвязанных коммита). Кастомный образ существует и работает (`infra/docker/postgres/Dockerfile`, используется test-контейнером `ccip_postgres_test` как `ccip-postgres:local`), но dev-сервис `postgres` в compose всё ещё жёстко прописан на `postgres:16-alpine` (без pg_partman/pg_cron) → миграция `0002_audit_log_partman`'s pre-flight guard рушит контейнер при каждом старте.

**Files:**
- Modify: `infra/docker/docker-compose.yml`

**Steps:**
1. Заменить `image: postgres:16-alpine` на `build: ./postgres` (context = `infra/docker/postgres`, где уже лежит правильный `Dockerfile`) либо `image: ccip-postgres:local` (если образ предполагается собирать отдельной командой/CI, а не через `docker compose build`) — выбрать вариант, согласованный с тем, как test-контейнер `ccip_postgres_test` уже собирается (проверить, нет ли отдельного `docker build`/Makefile-таргета для него, чтобы не продублировать механизм).
2. Обновить `CHANGELOG.md`, если запись по T-22 нуждается в уточнении (она была написана как факт, но не отражала реальность — либо дописать ADR/changelog amendment, либо просто оставить, т.к. после фикса запись станет верной).
3. `docker compose -f infra/docker/docker-compose.yml down -v && docker compose -f infra/docker/docker-compose.yml up -d postgres` (требует подтверждения пользователя — `down -v` удаляет dev-volume, см. `docs/governance/db-setup.md`).
4. `pnpm --filter @ccip/database migrate:deploy` против dev БД, убедиться, что контейнер больше не в `Restarting`.
5. Commit: `fix(infra): build ccip-postgres image for dev container — close T-22 docker-compose drift`.

**Риск:** Низкий, но `docker compose down -v` — **деструктивная операция** (удаляет dev-данные в volume `postgres_data`) → нужно явное подтверждение пользователя перед выполнением шага 3 (per Git/Action Safety Protocol).

---

## Phase 4 — Governance: `session-state.schema.json` пропускает `degraded`

**Причина (подтверждена кодом):** `.claude/runtime/failure-detectors.js:56` — единственный писатель `kind: 'agent_failure_degraded'` алертов — возвращает `{ kind, degraded: string[], threshold }`. Схема (`docs/schemas/session-state.schema.json:89-118`) объявляет для этого `kind` поля `count`/`backup` (с комментарием "for agent_failure_degraded alerts (ADR-025)"), но **ни один писатель в `.claude/runtime/` их не пишет**, и `governance-reactor.js` их не читает (статический шаблон без интерполяции) — мёртвые поля. `degraded` (реально используемое поле) не объявлено → `additionalProperties: false` валит JSON Schema при каждом срабатывании детектора.

**Files:**
- Modify: `docs/schemas/session-state.schema.json`

**Steps:**
1. Добавить в `governance_alerts.items.properties`: `"degraded": { "type": "array", "items": { "type": "string" }, "description": "agent names exceeding agent_failure_count threshold (ADR-025)" }`.
2. Решить судьбу мёртвых `count`/`backup`: удалить (никто не пишет/читает — чистый dead code) или оставить как зарезервированные на будущее — **спросить пользователя**, т.к. это решение про governance-контракт, не чисто техническое (см. практика "находки сначала на дизайн-вопрос" из памяти).
3. `node tools/audit/session-state.js` — убедиться, что валидатор проходит.
4. Commit: `fix(governance): declare degraded[] in session-state schema for agent_failure_degraded (ADR-025)`.

**Риск:** Тривиальный, но это governance-контракт — затронутый файл валидируется pre-commit hook'ом `audit-suite.js`; делать отдельным коммитом, не смешивать с фичевыми правками.

---

## Phase 5 — `docs/project-state.md`

**Контекст:** уже описано в итоговом сообщении PR #28 — после мерджа PR #28 в `main`, добавить туда же footnote по аналогии с уже подготовленным текстом (см. диф, который был отменён на этой сессии в основном чекауте перед тем, как обнаружилось расхождение веток).

**Steps:**
1. После мерджа PR #28: в `main`-чекауте обновить `docs/project-state.md` — `Last Updated`, `Phase Status`, footnote ⁴ про E-04..E-09 (текст уже готов, был написан и откатан в этой сессии — переиспользовать).
2. Commit прямо в `main` (или отдельный мелкий PR) — это чисто доковая правка, без кода.

**Риск:** Нулевой. Чисто секвенирование (после мерджа, не до).

---

## Порядок исполнения (рекомендация)

Не строгая зависимость, но логичный порядок по риску/связности:
1. **Phase 4** (governance schema) — тривиально, не блокирует ничего, можно сразу.
2. **Phase 2d** (typo) — тривиально, отдельный коммит.
3. **Phase 3** (pg_cron) — требует подтверждения на `down -v`, делать осознанно отдельным заходом.
4. **Phase 2e** (ADR-007 role) — небольшое, но трогает auth-поверхность БД.
5. **Phase 2a/2b/2c** (C-block фичи) — средний объём.
6. **Phase 1** (SLA Сценарий B + D-09) — самое крупное, отдельная ветка/worktree по аналогии с только что закрытой.
7. **Phase 5** — после мерджа любого/всех предыдущих PR в main.

## Открытые вопросы — статус

- ~~**Phase 4:** удалить мёртвые `count`/`backup` из схемы или оставить как зарезервированные?~~ **Решено и реализовано** (2026-06-19, коммит `8e6dbf5` на ветке `fix/governance-degraded-schema`): удалены, добавлено `degraded[]`.
- ~~**Phase 1, шаг 1:** какой именно вызов/статус сигнализирует "ГП ответил, SC не принял" → старт Сценария B?~~ **Решено** (2026-06-19): новый `DisputeService.submitGpResponse`/`rejectGpResponse` + новое поле `Discrepancy.gcResponseAt`. См. обновлённые шаги Phase 1 выше.
- ~~**Phase 2c:** сигнатура `upsertPeriodFact` — объектная форма параметра vs отдельный `opts.workAccessible`?~~ **Решено** (2026-06-19): отдельный `opts.workAccessible`, без изменения формы 3-го параметра. См. обновлённые шаги Phase 2c выше.

Все открытые вопросы плана закрыты — Phase 1, 2a, 2b, 2c, 2d, 2e, 3, 5 готовы к реализации без дальнейших уточнений.
