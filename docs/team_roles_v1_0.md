# Роли команды разработки CCIP

**Версия:** 1.0
**Дата:** 26.04.2026
**Основание:** `delivery_plan_v1_0.md` · `concept_oks_v1_4.docx` · `OKS_Algorithm_v1_3.docx` · `Period_Engine.md`
**Статус:** Зафиксирована первая версия списка ролей. Рамка — средний уровень детализации, только команда разработки, с пометками о возможном совмещении.

---

## I. Управление и архитектура

### 1. Project Manager / Delivery Lead

- **Зона ответственности:** Управление сроками, рисками и зависимостями. Контроль критического пути MVP. Координация между треками. Коммуникация с заказчиком и пилотным объектом.
- **Ключевые навыки:** Планирование с учётом DAG, управление параллельными треками, фасилитация ADR-решений, отчётность по [H]/[M]/[L] задачам.
- **Этапы Плана:** 0–13 (сквозная роль), особенно 0 (закрытие ADR-012), 13 (пилот).
- **Артефакты:** Roadmap, status reports, риск-реестр, gate-review между этапами.
- **Совмещение:** На малой команде — с Tech Lead или Product Owner.

### 2. Software Architect / Tech Lead

- **Зона ответственности:** Принятие и сопровождение ADR. Целостность архитектуры. Code review критических модулей. Decision authority по техническим развилкам.
- **Ключевые навыки:** Распределённые системы, event-driven architecture, Transactional Outbox, state machines, ADR-нотация, NestJS/Prisma на уровне дизайна.
- **Этапы Плана:** 0 (ADR-012, ADR-013), 1 (Prisma схема), 2 (Auth/RBAC дизайн), 5 (PeriodEngine, DisputeSLA, Analytics — критическая логика), 11 (review архитектурных тестов).
- **Артефакты:** ADR-012 и далее, архитектурные диаграммы, technical specs модулей C/D/E.
- **Совмещение:** На малой команде — с Senior Backend Engineer.

### 3. Product Owner / Business Analyst

- **Зона ответственности:** Транслирует требования из **Концепции v1.4** и **Алгоритма v1.3** в технические задачи. Защищает целостность бизнес-логики (расхождения, SLA, weight_coef, decay_factor, перекрёстная верификация). Принимает фичи по бизнес-критериям.
- **Ключевые навыки:** Понимание строительной предметки, написание acceptance-критериев, работа с тест-таблицами (Часть 4 Алгоритма).
- **Этапы Плана:** 3–7 (приёмка backend модулей по бизнес-логике), 8 (Web), 13 (пилот).
- **Артефакты:** User stories, acceptance criteria, mapping «требование Концепции → задача Плана».
- **Совмещение:** На малой команде — с PM.

---

## II. Backend

### 4. Senior Backend Engineer (Core Domain)

- **Зона ответственности:** Реализация ядра доменной логики: Init A, ZeroReport B, **PeriodEngine C** (state machine из `Period_Engine.md`), DisputeSLA D, Analytics E. Transactional Outbox, идемпотентность, BullMQ workers.
- **Ключевые навыки:** NestJS, Prisma, PostgreSQL 16 (RLS, partitioning, MV), BullMQ, Redis, проектирование state machine.
- **Этапы Плана:** 2–7 (основная нагрузка), 11 (integration tests).
- **Артефакты:** Модули `apps/api/src/period-engine`, `dispute-sla`, `analytics`. Реализация ADR-005 (BullMQ + AOF), ADR-007/010 (audit-log append-only).
- **Совмещение:** Один из двух Senior закрывает Architect-роль на старте.

### 5. Backend Engineer (Integrations & Auxiliary)

- **Зона ответственности:** Auth/RBAC + GpTokenGuard, Multi-tenancy middleware, AuditLogService, Sync API (блок I), UpdateBaseline (F/G), интеграции с email/SMTP/Notification Service.
- **Ключевые навыки:** JWT/OAuth, RBAC, Prisma middleware, REST/контракты API, очереди.
- **Этапы Плана:** 2 (Auth/AuditLog), 6 (Baseline F/G), 7 (Sync I), 12 (notifications).
- **Артефакты:** AuthModule, AuditLogService, SyncController, BaselineService.
- **Совмещение:** Может быть один человек на старте, разделение при росте команды.

### 6. Database Engineer / DBA

- **Зона ответственности:** Prisma schema из P-01..P-25, миграции, partitioning через pg_partman, Materialized Views (refresh strategy, staleness), PgBouncer (session mode — ADR-001/002), оптимизация запросов (`getCumulativeFactsBatch` < 100 ms).
- **Ключевые навыки:** PostgreSQL 16 (advanced), pg_partman, MV refresh CONCURRENTLY, RLS, индексирование.
- **Этапы Плана:** 1 (schema), 5 (MV для Analytics), 11 (performance тесты), 12 (pg_partman, бэкапы).
- **Артефакты:** `schema.prisma`, миграции, MV definitions, partition maintenance scripts.
- **Совмещение:** На MVP-этапе — часть нагрузки Senior Backend + DevOps; отдельный человек желателен на этапах 11–12.

---

## III. Frontend

### 7. Frontend Engineer (Web)

- **Зона ответственности:** Web App на React: дашборд директора, цикл периода для стройконтроля, форма ГП, журнал расхождений, версионирование BoQ, UpdateBaseline UI, чеклист периода (§7.3 Концепции).
- **Ключевые навыки:** React, TypeScript, state management, формы с валидацией, визуализация (графики прогресса, два прогноза, флаг разрыва).
- **Этапы Плана:** 8 (Web App — критический путь к пилоту), 11 (E2E с Playwright).
- **Артефакты:** `apps/web`, дашборд-компоненты, карточка верификации (§7.1).
- **Совмещение:** При отсутствии UX-дизайнера — частично закрывает UI-решения.

### 8. Mobile Engineer (React Native + Offline)

- **Зона ответственности:** Mobile-приложение для стройконтроля. Реализация **блока I — офлайн-режим** из Концепции и Алгоритма: локальная очередь, временные метки, синхронизация, конфликт-резолюция (без last-write-wins), фотофиксация с геотегами и метаданными.
- **Ключевые навыки:** React Native, локальные БД (SQLite/WatermelonDB), фоновая синхронизация, работа с камерой/геолокацией, push (FCM/APNs).
- **Этапы Плана:** 9 (Mobile App), 11 (тесты sync-конфликтов), 13 (пилотный фидбек).
- **Артефакты:** `apps/mobile`, sync queue engine, conflict resolution UI.
- **Совмещение:** Самостоятельная роль — навыки специфичны и плохо совмещаются.

### 9. UX/UI Designer

- **Зона ответственности:** Проектирование интерфейсов, описанных в §7 и §11 Концепции: карточка верификации, чеклист выезда по зонам, групповое подтверждение delta=0, мобильная фотофиксация. Снижение операционной нагрузки (≤10 ч/неделя — целевой параметр §11.1).
- **Ключевые навыки:** UX для промышленных приложений, mobile-first, проектирование форм с обязательными полями и блокировками.
- **Этапы Плана:** 8, 9 (по ходу), 13 (UX-фидбек пилота).
- **Артефакты:** Figma-макеты, дизайн-система, прототипы конфликт-резолюции.
- **Совмещение:** На MVP — частично может быть закрыт Frontend-инженером + Product Owner.

---

## IV. Инфраструктура и эксплуатация

### 10. DevOps / SRE Engineer

- **Зона ответственности:** Docker Compose (этап 1), Kubernetes-манифесты (этап 12), **критическая конфигурация SLA Worker** (`replicas: 1`, `strategy: Recreate` — ADR-005), Redis с AOF, PgBouncer (session mode), CI/CD pipelines, observability (метрики, алерты, tracing), бэкапы и drill-восстановление.
- **Ключевые навыки:** Kubernetes, Helm, Docker, GitHub Actions/GitLab CI, Prometheus/Grafana, OpenTelemetry, S3 lifecycle, secret management.
- **Этапы Плана:** 1 (Docker Compose), 12 (Production Infra), 13 (мониторинг пилота).
- **Артефакты:** `infra/docker`, `infra/k8s`, CI workflows, runbooks, алерты по `mv_refresh_log`, `audit_log_default partition`.
- **Совмещение:** На MVP — частично с Backend Engineer; отдельный человек обязателен на этапе 12.

---

## V. Качество

### 11. QA Engineer / Test Lead

- **Зона ответственности:** Покрытие **тест-таблицы из Части 4 Алгоритма** (тесты A-01…I-03). Unit / integration / E2E (Playwright). Тесты RBAC matrix, period immutability через DB REVOKE, SLA recovery, sync conflicts. Тестирование критериев выхода из пилота.
- **Ключевые навыки:** Jest, Playwright, тестирование state machine, нагрузочное тестирование, тест-дизайн на основе формальных алгоритмов.
- **Этапы Плана:** 11 (основной), 13 (приёмка пилота). Параллельно с этапами 3–10.
- **Артефакты:** Test plan, E2E suites, RBAC matrix test report, performance baseline.
- **Совмещение:** Самостоятельная роль; на старте 1 человек, к этапу 11 желателен второй.

---

## VI. Безопасность и данные

### 12. Security Engineer

- **Зона ответственности:** Аудит RBAC и multi-tenancy (ADR-012), security review критических модулей (Auth, AuditLog, Sync), управление секретами (Kubernetes Secrets / Vault), pen-test перед пилотом, проверка immutability на уровне БД (REVOKE для `ccip_app`).
- **Ключевые навыки:** AppSec, OWASP, RLS audit, secret rotation, penetration testing.
- **Этапы Плана:** 0 (consult по ADR-012), 2 (Auth review), 10 (Security — отдельный этап в Плане), 12 (production secrets), 13 (pre-launch).
- **Артефакты:** Security review reports, secret rotation policy, threat model.
- **Совмещение:** Часто внешний консультант на pen-test; на MVP — Tech Lead + DevOps закрывают рутину.

---

## VII. Пилот и поддержка пользователей

### 13. Implementation / Pilot Lead

- **Зона ответственности:** Подготовка и сопровождение пилотного объекта (этап 13). Onboarding: загрузка реальной ВОР, утверждение 0-отчёта с Director, обучение стройконтроля и админа. Сбор фидбека, ведение журнала инцидентов пилота, приёмка по критериям выхода (§13.4).
- **Ключевые навыки:** Внедрение ИТ-систем в строительстве, работа с подрядчиками и техническим надзором, training, change management.
- **Этапы Плана:** 13 (основной), частично 8–9 (UAT перед пилотом).
- **Артефакты:** Onboarding-чеклист, training materials, weekly pilot review, лог фидбека.
- **Совмещение:** На малой команде — с Product Owner или PM.

### 14. Technical Writer / Documentation Lead

- **Зона ответственности:** Поддержание актуальности документов проекта (Концепция, Алгоритм, Period Engine, Delivery Plan, ADR-реестр). Пользовательская документация для пилота: руководство стройконтроля, инструкция администратора, регламент действий ГП.
- **Ключевые навыки:** Техническое письмо, владение русским языком на уровне стандарта (документы проекта на русском), markdown/docx, версионирование документации.
- **Этапы Плана:** Сквозная роль; пик — этапы 0 (ADR), 13 (user docs).
- **Артефакты:** Обновления `concept_oks_v1_4.docx`, `OKS_Algorithm_v1_3.docx`, ADR-реестр, user guides.
- **Совмещение:** На MVP — часто закрывается Product Owner + Architect; отдельная роль желательна перед пилотом.

---

## Сводная таблица: роль × этап Плана

| # | Роль | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | PM / Delivery Lead | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| 2 | Architect / Tech Lead | ● | ● | ● | · | · | ● | · | · | · | · | ● | ● | · | · |
| 3 | Product Owner / BA | ● | · | · | ● | ● | ● | ● | ● | ● | · | · | ● | · | ● |
| 4 | Sr. Backend (Core) | · | ● | ● | ● | ● | ● | · | · | · | · | · | ● | · | ● |
| 5 | Backend (Aux) | · | · | ● | · | · | · | ● | ● | · | · | · | ● | ● | ● |
| 6 | DBA | · | ● | · | · | · | ● | · | · | · | · | · | ● | ● | · |
| 7 | Frontend (Web) | · | · | · | · | · | · | · | · | ● | · | · | ● | · | ● |
| 8 | Mobile | · | · | · | · | · | · | · | ● | · | ● | · | ● | · | ● |
| 9 | UX/UI Designer | · | · | · | · | · | · | · | · | ● | ● | · | · | · | ● |
| 10 | DevOps / SRE | · | ● | · | · | · | · | · | · | · | · | · | ● | ● | ● |
| 11 | QA | · | · | ● | ● | ● | ● | ● | ● | ● | ● | · | ● | · | ● |
| 12 | Security | ● | · | ● | · | · | · | · | · | · | · | ● | · | ● | ● |
| 13 | Implementation/Pilot | · | · | · | · | · | · | · | · | · | · | · | · | · | ● |
| 14 | Tech Writer | ● | · | · | · | · | · | · | · | · | · | · | · | · | ● |

**Обозначения:** ● — основная нагрузка, · — не задействован или фоновая нагрузка.

---

## Минимальный стартовый состав

Реалистичная компактная конфигурация для старта MVP:

1. **Tech Lead** (совмещает Architect + Sr. Backend Core)
2. **Backend Engineer** (Aux + DBA на старте)
3. **Frontend Engineer** (Web + частично UX)
4. **Mobile Engineer**
5. **DevOps Engineer** (+ часть Security рутинно)
6. **QA Engineer**
7. **Product Owner** (совмещает PM + BA + Tech Writer на старте)
8. **Pilot Lead** (подключается к этапу 13, может быть от заказчика)

**Итого:** 6–7 человек full-time + 1 со стороны заказчика. Остальные роли (отдельные Architect, DBA, Security, UX, Tech Writer) подключаются по мере роста команды или критичности этапа.

---

*Документ составлен на основе: `delivery_plan_v1_0.md` · `concept_oks_v1_4.docx` v1.4 · `OKS_Algorithm_v1_3.docx` v1.3 · `Period_Engine.md` v2.0*
*Версия списка ролей: 1.0 · 2026*
