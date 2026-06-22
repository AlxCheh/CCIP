# Period Cycle (стройконтроль) — Design Spec

| | |
|---|---|
| **Date** | 2026-05-31 |
| **Milestone** | M-08 — Web App (Period Cycle часть) |
| **Status** | Approved (brainstorming) |
| **Intents** | BACKEND (расширить period detail API) + FRONTEND (UI цикла) |
| **Branch** | `feat/m-08-period-cycle` (от `main`) |
| **Stack** | NestJS + Prisma (backend) · Vite 6 · React 18 · TS 5.7 · React Query 5 (frontend) |

## Цель

Дать стройконтролю (`stroycontrol`, `admin`) провести период через state machine:
**открыть → видеть позиции с объёмами ГП/SC → вносить факты SC → закрыть**.
`director` — read-only. Функциональная стройка на прототип-стилях (визуальный дизайн M-08
отложен до завершения функционала — единый visual-pass по всем экранам позже).

## Канонические статусы периода (ground truth)

Источник истины — `PeriodService` + проходящие интеграционные тесты (`period.service.spec.ts`):

```
open ──submitGp(GP-токен)──▶ gp_submitted ──upsertPeriodFact(первый SC-факт)──▶ verification ──closePeriod──▶ closed
```

- `open` — SC открыл (есть approved ZeroReport, активный BoQ, нет другого открытого); сгенерён GP-токен
- `gp_submitted` — ГП подал объёмы через токен (GP Form, вне этого спека)
- `verification` — SC начал вносить факты; считаются расхождения
- `closed` — SC закрыл (только из `verification`, при `openDiscrepancyCount === 0`)

SC-факты разрешены только в `gp_submitted` и `verification`.

> **Известный drift (НЕ закрываем здесь, отдельная уборка):** файл `0001_initial` migration
> и shared-enum `PeriodStatus` (`packages/shared/src/types.ts`) содержат устаревший словарь
> (`waiting_gp`, `verifying`, `force_closed`), а `ObjectDetailPage` — ошибочные лейблы
> (`verified`, `forced_sc_figure` — последнее вообще `DiscrepancyStatus`). Фронт Period Cycle
> использует **service-истину** выше; единый словарь лейблов вводим в этом спеке как локальную
> константу, реконсиляцию shared-enum/миграции выносим в follow-up.

## 1. Backend (ccip-backend-core)

Новый эндпоинт `GET /periods/:id/detail` (рядом с существующим `findById`, **не ломая** его).
Роли `director | stroycontrol | admin`, tenancy как в `findById` (объект в орг. актора).

Возвращает:
```ts
{
  id: number;
  periodNumber: number;
  status: 'open' | 'gp_submitted' | 'verification' | 'closed';
  openedAt: string;
  closedAt: string | null;
  objectId: number;
  boqVersionId: number;
  positions: Array<{
    boqItemId: number;
    workCode: string;
    name: string;
    unit: string;
    planVolume: number;
    gpVolume: number | null;        // из PeriodFact
    scVolume: number | null;        // из PeriodFact
    discrepancyType: number | null;
    discrepancyStatus: string | null;
    acceptedVolume: number | null;
  }>;
  openDiscrepancyCount: number;     // для блокировки закрытия
}
```

Джойн на сервере: позиции берутся из **версии BoQ периода** (`period.boqVersionId`, НЕ active!),
LEFT JOIN с `periodFacts` по `boqItemId`. `openDiscrepancyCount` = count расхождений со
`status='open'`, привязанных к фактам этого периода.

Существующие эндпоинты используются как есть: `POST /periods/open`, `PATCH /periods/:id/close`,
`PATCH /periods/:id/facts/:boqItemId`.

## 2. Frontend (ccip-frontend)

- `services/api.ts` — `periodApi`: `getDetail(id)`, `open(objectId)`, `upsertFact(id, boqItemId, scVolume)`, `close(id)` + типы (`PeriodDetailResponse`, `PeriodPosition`)
- хуки: `usePeriodDetail(id)` (query); `useOpenPeriod` / `useUpsertFact` / `useClosePeriod` (mutations, инвалидируют `['period', id]`, `['dashboard']`, `['objectDetail']`)
- `PeriodPage` (`/periods/:id`):
  - статус-степпер: `open → gp_submitted → verification → closed`
  - таблица позиций: `workCode/name/unit/plan | объём ГП | объём SC | расхождение`; ввод SC — `<input number>` только при статусе `gp_submitted`/`verification` и роли `stroycontrol`/`admin`; submit факта → `useUpsertFact`
  - расхождение: read-only бейдж (`Подтверждено` / `Расхождение`); разрешение спора — вне scope
  - блок закрытия: кнопка «Закрыть период» — активна только при `status==='verification'` && `openDiscrepancyCount===0`; иначе disabled + подсказка причины
- `ObjectDetailPage`: заменить заглушку *«Перейти к периоду (недоступно в MVP)»* на `Link → /periods/:id`; добавить «Открыть период» когда активного периода нет (роль `stroycontrol`/`admin`) → `useOpenPeriod` → редирект на `/periods/:newId`
- роут `/periods/:id` в `main.tsx` (внутри `ProtectedRoute`)
- единый словарь лейблов статусов периода (локальная константа, service-истина)

## 3. RBAC / ошибки

- Действия (open/факты/close) — `stroycontrol` + `admin` через `RoleGate`; `director` видит read-only (без input'ов и кнопок действий)
- Маппинг ошибок бэка в сообщения: `PERIOD_ALREADY_OPEN`, `ZERO_REPORT_NOT_APPROVED`, `OPEN_DISCREPANCIES_EXIST`, `PERIOD_WRONG_STATUS`, `PERIOD_LOCK_TIMEOUT`

## 4. Тестирование

- **Backend** (jest): `GET /periods/:id/detail` — джойн позиций для версии периода (не active), `openDiscrepancyCount`, tenancy-изоляция, 404 для чужой орг.
- **Frontend** (Vitest + RTL, как в Dashboard hardening): `periodApi`, хуки (queryKey/инвалидация), `PeriodPage` (рендер степпера по статусу, ввод факта вызывает mutation, кнопка закрытия disabled при open-расхождениях и вне `verification`, RBAC скрывает действия для `director`), правка `ObjectDetailPage` (ссылка/кнопка открытия).

## 5. Вне scope (YAGNI)

- Разрешение расхождений / споры (DisputeSLA M-05b) — отдельный спек
- GP Form (подача ГП через токен) — отдельная часть M-08
- Force-close путь (SLA Scenario A) — показываем статус read-only, если встретится; интерактивно не ведём
- Визуальный дизайн — отложен до завершения функционала
- Реконсиляция drift статусов в shared-enum / миграции / ObjectDetailPage — follow-up

## 6. Декомпозиция / порядок

Один спек, два intent'а. **Backend-контракт первым** (`/periods/:id/detail` + тесты),
затем frontend поверх готового контракта.

## 7. Критерий готовности

- `GET /periods/:id/detail` отдаёт позиции версии периода + факты + `openDiscrepancyCount`; jest зелёный
- `/periods/:id` проводит SC через ввод фактов и закрытие; закрытие блокируется при открытых расхождениях
- `ObjectDetailPage` ведёт на период / открывает новый
- `turbo test` + `turbo lint` зелёные (api + web)
