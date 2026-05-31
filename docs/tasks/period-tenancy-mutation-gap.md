# Task: upsertPeriodFact / closePeriod — нет проверки принадлежности периода организации

**ID:** TASK-2026-05-31-period-tenancy-mutation-gap
**Task Type:** Security / Bug Fix
**Routing:** `ccip-security` (lead) → co: `ccip-backend-core` (fix)
**Status:** open
**Raised:** 2026-05-31 (QA ревью feat/m-08-period-cycle)

---

## Проблема

`upsertPeriodFact` и `closePeriod` в `PeriodService` загружают период через
`findUniqueOrThrow({ where: { id: periodId } })` **без проверки** принадлежности
объекта к организации актора. Пользователь роли `stroycontrol` из организации A
может вносить факты или закрыть период организации B, если знает числовой `periodId`.

## Сравнение с корректными методами

| Метод | Проверка org | Код |
|-------|--------------|-----|
| `findById` | ✓ | `where: { id, object: { organizationId: actor.organizationId } }` |
| `getDetail` (новый) | ✓ | то же |
| `upsertPeriodFact` | ✗ | `findUniqueOrThrow({ where: { id: periodId } })` |
| `closePeriod` | ✗ | то же |

## Источник

Обнаружено при QA-ревью Period Cycle (commit `4d9f229`). Пробел существовал
**до** этого PR — в `period.service.ts` с момента реализации PeriodEngine (M-05a).

## Предлагаемое исправление

Оба метода должны:
1. Загружать актора аналогично `findById`: `prisma.user.findUniqueOrThrow({ select: { organizationId } })`
2. Заменить `findUniqueOrThrow({ where: { id: periodId } })` на
   `findUniqueOrThrow({ where: { id: periodId }, include: { object: { select: { organizationId: true } } } })`
   и проверять `period.object.organizationId === actor.organizationId`, либо
3. Перейти на `findFirst` с `where: { id: periodId, object: { organizationId: actor.organizationId } }` и бросать `ForbiddenException`.

## Ссылки

- `apps/api/src/modules/period/period.service.ts` — методы `upsertPeriodFact` (≈l.203) и `closePeriod` (≈l.295)
- Коммит внедрения: `findById`/`getDetail` с корректной tenancy-проверкой
