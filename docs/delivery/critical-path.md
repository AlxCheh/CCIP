# CCIP — Critical Path & MVP Checklist

**Дата:** 2026-04-25  
**Основание:** delivery_plan_v1_0.md  
**Связанные файлы:** [phase-0](phase-0-architecture-gaps.md) · [phase-1-3](phase-1-3-foundation-backend.md) · [phase-4-7](phase-4-7-backend-modules.md) · [phase-8-13](phase-8-13-infra-pilot.md) · [phase-mobile](phase-mobile.md)

---

## Условные обозначения

| Маркер | Значение |
|--------|---------|
| `[H]` | High — блокирует следующий этап или является частью критического пути |
| `[M]` | Medium — необходимо для MVP, но не блокирует параллельные треки |
| `[L]` | Low — важно до production, но не для первого пилота |
| `🔴 CRITICAL PATH` | Задача на критическом пути к запуску MVP |
| `⚠️ ADR-NNN` | Задача напрямую диктуется конкретным ADR |

---

## Критический путь MVP

```
ADR-012 (multi-tenancy) → Репозитории + окружения
  └─► Auth/RBAC (JWT + GpTokenGuard)
        └─► Init-модуль A (L0–L2, BoQ, weight_coef trigger)
              └─► ZeroReport-модуль B (стартовый факт, таймер)
                    └─► PeriodEngine-модуль C (open → GP → verify → close)
                          └─► DisputeSLA-модуль D (Type 1/2/3, deadlock A/B, BullMQ)
                                └─► Analytics-модуль E (snapshots, WMA, 2 прогноза, MV)
                                      └─► Web App (dashboard + period cycle)
                                            └─► Пилотный объект
```

Параллельно критическому пути (не блокируют MVP, но нужны к пилоту):
- Mobile App — отложен после пилота → [phase-mobile.md](phase-mobile.md)
- Уведомления (email + notifications table)
- UpdateBaseline — блок F/G
- Инфраструктура (K8s, S3, PgBouncer)

---

## Сводная таблица: минимально необходимые задачи перед MVP

| # | Задача | Этап | Блокирует |
|---|--------|------|-----------|
| 1 | ADR-012 Multi-tenancy принят | 0 | Всё |
| 2 | Docker Compose + PostgreSQL + Redis (AOF) + PgBouncer (session) | 1 | Всё |
| 3 | Prisma schema из P-01..P-25 | 1 | Всё |
| 4 | Auth: JWT + RBAC Guards + GpTokenGuard | 2 | Все API |
| 5 | AuditLogService (append-only) | 2 | Immutability |
| 6 | Multi-tenancy middleware | 2 | Все сервисы |
| 7 | Init-модуль A: Objects + BoQ + weight_coef trigger | 3 | B, C, D, E |
| 8 | ZeroReport-модуль B | 4 | C |
| 9 | PeriodEngine-модуль C: open + GP submit + SC verify + close | 5 | D, E |
| 10 | DisputeSLA-модуль D + BullMQ Worker (ROLE=worker) | 5 | E, MV |
| 11 | AnalyticsEngine-модуль E + MV refresh | 5 | Dashboard |
| 12 | Web: Dashboard + Period cycle + GP Form | 8 | Pilot |
| 13 | Period immutability: REVOKE проверен | 10 | Pilot |
| 14 | SLA recovery scan тест | 11 | Pilot |
| 15 | K8s Worker: replicas:1 + Recreate | 12 | Pilot |

---

## Зависимости между блоками (DAG)

```
[0 ADR-012]
     │
     ▼
[1 Repos + Docker + Prisma]
     │
     ▼
[2 Auth + AuditLog + Tenant]
     │
     ├──────────────────────────────────────────────┐
     ▼                                              │
[3 Init A: Objects + BoQ]                          │
     │                                              │
     ▼                                              │
[4 ZeroReport B]                                   │
     │                                              │
     ▼                                              ▼
[5.1 PeriodEngine C]                    [6 Baseline F/G + GC Change H]
     │                                              │
     ├──────────────────┐                           │
     ▼                  ▼                           │
[5.2 Disputes+SLA D]  [7 Sync API I]               │
     │                  │                           │
     ▼                  │                           │
[5.3 Analytics E]       │                           │
     │                  │                           │
     ├──────────────────┘                           │
     ▼                                              │
[8 Web App]◄───────────────────────────────────────┘
     │
     ▼
[10 Security]
     │
     ▼
[11 Testing]
     │
     ▼
[12 Prod Infra]
     │
     ▼
[13 Pilot]
     │
     ▼
[Mobile App — phase-mobile.md]  ← отложен после пилота
```
