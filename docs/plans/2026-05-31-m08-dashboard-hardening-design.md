# M-08 Dashboard Hardening — Design Spec

| | |
|---|---|
| **Date** | 2026-05-31 |
| **Milestone** | M-08 — Web App (Dashboard + Period Cycle + GP Form) |
| **Scope of this spec** | Закрепление уже готового Dashboard тестами + lint |
| **Status** | Approved (brainstorming) |
| **Stack** | Vite 6 · React 18 · TS 5.7 · React Query 5 · axios · react-router-dom 6 · `@ccip/shared` |

## Контекст

`apps/web` уже существует (и на `main`): scaffold + Dashboard директора частично реализован
(коммит `16401d8 "Design dashboard data structure"`). Это **не старт с нуля**.

**Готово:** `DashboardPage`, `ObjectDetailPage`, `ForbiddenPage`; хуки `useDashboard` /
`useObjectDetail` / `useRefreshDashboard`; `services/api.ts` (axios + типы + interceptor);
RBAC (`RoleGate`, `store/auth.ts`); MV-staleness (`StaleBanner`, `RefreshButton`, `ProgressBar`, `EmptyCell`).

**Отсутствует:** Period Cycle, GP Form, **тесты и lint-конфигурация** в `apps/web`
(поэтому `turbo test` / `turbo lint` её не трогают).

**Цель спеки:** покрыть Dashboard тестами и линтером, чтобы `turbo test` / `turbo lint`
его подхватывали, и зафиксировать поведение перед достройкой Period Cycle / GP Form.

## 1. Тест-инфраструктура (Vitest)

Выбор **Vitest** (не jest, как в `apps/api`): `services/api.ts` использует `import.meta.env`,
который jest не поддерживает без babel/ts-jest-хака. Vitest нативен для Vite и переиспользует `vite.config.ts`.

- devDeps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom`.
- Конфиг — **в существующий `vite.config.ts`** (секция `test`: `environment: 'jsdom'`,
  `setupFiles` с jest-dom matchers, `globals: true`). Без отдельного конфиг-файла.
- Скрипты: `"test": "vitest run"`, `"test:watch": "vitest"` → `turbo test` подхватит.

## 2. Lint (ESLint flat config)

- `apps/web/eslint.config.mjs` по образцу `apps/api/eslint.config.mjs`
  + плагины `react`, `react-hooks`, `react-refresh`.
- Скрипт `"lint": "eslint . --fix"` → `turbo lint` подхватит.

## 3. Покрытие тестами (unit + component)

| Юнит | Кейсы |
|------|-------|
| `store/auth.ts` `getAuthUser` | нет ключа → null; валидный JSON → объект; битый JSON → null |
| `RoleGate` | разрешённая роль → children; чужая роль / без юзера → fallback |
| `services/api.ts` interceptor | есть token → `Authorization: Bearer <t>`; нет token → без заголовка |
| хуки `useDashboard` / `useObjectDetail` / `useRefreshDashboard` | корректный queryKey; queryFn зовёт нужный api (мок + QueryClient wrapper) |
| компоненты `StaleBanner` / `ProgressBar` / `EmptyCell` / `RefreshButton` | рендер по props (stale / не-stale и пр.) |
| `DashboardPage` | рендер строк из мока `useDashboard`; фильтр/сортировка меняют query; empty-state; интеграция баннера staleness |

## 4. Вне scope (YAGNI)

- **Period Cycle, GP Form** — следующие сессии M-08.
- **E2E (Playwright)** — позже.

## 5. Открытый вопрос — drift роли `gp` ↔ `engineer`

`store/auth.ts` объявляет `UserRole = 'director' | 'stroycontrol' | 'admin' | 'gp'`, тогда как
канонический коммит `c063e67` задаёт RBAC-таксономию `admin | director | stroycontrol | engineer`.
Расхождение `gp` ↔ `engineer`.

**Гипотеза:** `gp` (генподрядчик) намеренно отдельный — он входит через `GpTokenGuard`, а не как
backend-RBAC-роль; `engineer` — backend-роль, не используемая фронтом. Требует подтверждения.

**Решение для этой спеки:** тесты пишутся против **текущего кода** (`gp`), drift **не закрепляется
как баг** — выносится в отдельное решение (вероятно ADR-уточнение или фикс `store/auth.ts`).
Тест-стратегия от исхода не зависит.

## 6. Критерий готовности

- `turbo test` зелёный, включает `@ccip/web`.
- `turbo lint` зелёный, включает `@ccip/web`.
- Dashboard покрыт по таблице §3.
- База готова под Period Cycle / GP Form.
