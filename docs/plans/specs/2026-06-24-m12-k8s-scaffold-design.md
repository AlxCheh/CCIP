# M-12: Prod Infra / K8s Scaffold — Design

> Источник: брейнсторминг-сессия 2026-06-24. Закрывает audit finding F-006 (`infra/k8s/` missing) и делает ADR-005 K8s-инварианты проверяемыми (X-11), как зафиксировано в архивном `docs/plans/archive/2026-05-17-multi-agent-ecosystem-residual-remediation.md` (Sub-plan C, не начат).

## 1. Цель

Создать `infra/k8s/` с production-shaped манифестами (Kustomize base+overlays) для всех сервисов CCIP, проверить критические инварианты ADR-005 (SLA worker `replicas:1`/`Recreate`, recovery scan) реальным запуском на локальном `kind`-кластере — без провижининга реального облака.

## 2. Контекст

`docs/architecture/infrastructure.md` §3 описывает прод-K8s как целевую архитектуру, но `infra/k8s/` физически не существует (только `infra/docker/docker-compose.yml`). M-11 (Testing) закрыт, M-12 — следующий шаг на критическом пути к Pilot (M-13) согласно `docs/project-state.md` §1 "Next Milestone".

Проект на стадии pre-pilot: нет подтверждённого облачного провайдера, нет пилотного заказчика с требованиями к data residency/бюджету. Коммититься сейчас к конкретному облаку (EKS/GKE/AKS) или self-managed VPS — преждевременное решение.

## 3. Объём (принятые решения)

| Решение | Выбор | Почему |
|---|---|---|
| Целевая среда | Scaffold + локальная валидация на `kind` | Pre-pilot, нет облачного провайдера/бюджета; реальный прод — отдельный future-план, меняющий только overlay |
| Observability (Prometheus/Grafana/OTel) | Отложено в follow-up | infrastructure.md помечает "обязательно", но это отдельный по объёму кусок; scaffold не должен раздуваться |
| Backup strategy (pg_dump+S3) | Отложено в follow-up | Та же причина |
| Secrets | **Vault** (dev-server + Agent Injector), не plain K8s Secrets | Явное решение пользователя — ближе к итоговому прод-виду с самого начала |
| Deploy-механизм | **Kustomize**, не Helm | Архивный Sub-plan C уже выбрал Kustomize; `infra/helm/` из infrastructure.md §3 — расхождение, см. §7 Допущения |
| CI для kind | Не добавляется в этот план | Блокер B-CI-01 (исчерпана квота GitHub Actions) активен; новый kind-in-CI job увеличил бы расход поверх уже исчерпанного лимита |

## 4. Архитектура / структура

```
infra/k8s/
├── base/
│   ├── postgres/    — StatefulSet (образ ccip-postgres:local, pg_partman/pg_cron) + PVC + Service
│   ├── pgbouncer/   — Deployment (pool_mode=session, ADR-001) + Service
│   ├── redis/       — StatefulSet (appendonly yes, appendfsync everysec, ADR-005) + PVC + Service
│   ├── vault/        — Vault dev-server + Agent Injector (рендеренные манифесты, см. §5)
│   ├── api/          — Deployment (ROLE не задан, rolling update + HPA) + Service
│   ├── sla-worker/   — Deployment (ROLE=worker, replicas:1, strategy:Recreate — ADR-005)
│   ├── web/          — Deployment (rolling) + Service
│   ├── ingress/      — Ingress + cert-manager ClusterIssuer (self-signed, kind не имеет публичного DNS)
│   └── kustomization.yaml
└── overlays/
    ├── dev/      — kind-патчи: NodePort, без digest-pin образов, storageClass=standard
    ├── staging/  — заглушка, тот же base
    └── prod/     — заглушка, `# TODO: выбор облачного провайдера — follow-up план`
```

`api` и `sla-worker` используют **один и тот же образ**, различаются только `ROLE` env и replica/strategy.

`infra/k8s/scripts/kind-up.sh` — создаёт kind-кластер → ставит ingress-nginx + cert-manager CRDs + Vault/injector → `vault-seed.sh` → `kind load docker-image` для `api`/`web` → `kubectl apply -k overlays/dev` → ждёт `rollout status` на каждом Deployment/StatefulSet.

## 5. Secrets / Vault flow

**Топология:** namespace `vault` — Vault dev-server (`hashicorp/vault`, `server -dev`: in-memory, auto-unseal, root token в логах) + Vault Agent Injector (`hashicorp/vault-k8s`, mutating webhook).

Манифесты инжектора **не пишутся руками** — TLS/CA-бандл для webhook легко сломать вручную. Генерируются один раз через `helm template` из официального чарта и вендорятся как статичный YAML в `infra/k8s/base/vault/rendered/`. Helm — только локальный генератор на этапе написания манифестов, не deploy-зависимость (см. §7 Допущения про отказ от Helm в runtime).

**Auth:** Kubernetes auth method (TokenReview API) — у `api` и `sla-worker` свои ServiceAccount + Vault role + policy (least-privilege): `policy-api` читает `secret/data/ccip/api/*`, `policy-sla-worker` — `secret/data/ccip/worker/*`. KV v2 на `secret/`.

**Сидирование (dev-only):** `infra/k8s/scripts/vault-seed.sh` пишет в KV v2 значения, сгенерированные через `openssl rand` — не копирует дев-плейсхолдеры из `docker-compose.yml` (`ccip_dev_pass` и т.п.), чтобы демонстрировать настоящую инъекцию секрета.

**Доставка в под:** Vault Agent Injector рендерит шаблон в файл `/vault/secrets/db` (`KEY=VALUE` формат) в shared volume sidecar'а. В `Dockerfile` `api`/`sla-worker` — entrypoint-шим: `set -a; . /vault/secrets/db; set +a; exec "$@"`, чтобы `ConfigService.getOrThrow('JWT_SECRET')` получил значение из `process.env`, как и раньше — приложение не знает, что секрет пришёл из Vault.

**Переезжает в Vault:** `POSTGRES_PASSWORD`, `REDIS_PASSWORD` (используется и в `--requirepass`, и в readiness-пробе `redis-cli -a`), `JWT_SECRET`, `MINIO_ROOT_PASSWORD`.

**Явно не прод-grade (déjà отмечено как риск):** `vault server -dev` — single-node, без HA/persistent backend/auto-unseal через cloud KMS, self-signed TLS без реальной CA. Годится для проверки паттерна интеграции на kind; реальный прод Vault — в будущем cloud-provisioning follow-up.

## 6. Backend co-agent scope (ccip-backend-core) — найденный разрыв

Исследование кода перед написанием плана показало:

- **`/health`-эндпоинта нет вообще** (`grep` по `apps/api/src` — пусто). Без него K8s `livenessProbe`/`readinessProbe` (ADR-005 `checkBoth()`) не на чём строить.
- **`ROLE=worker` гейт уже существует**, но не используется ни одним живым процессом: `apps/api/src/modules/dispute-sla/dispute-sla.module.ts` —
  ```ts
  const workerProviders = process.env.ROLE === 'worker' ? [DisputeSlaWorker] : [];
  ```
  Сегодня ни один docker-compose сервис не ставит `ROLE=worker`, поэтому `DisputeSlaWorker` (`@Processor('sla')`) никогда не инстанцируется в реальном процессе — только внутри integration-тестов (которые поднимают его напрямую через Nest testing module, минуя `AppModule`/env). Producer-сторона (`DisputeSlaService`, используется HTTP-флоу `rejectGpResponse`) уже корректно доступна в api-роли без изменений — `DisputeSlaModule` импортирован в `AppModule` безусловно.
- Проверен соседний риск: `MvRefreshWorker` (TODO M-05b в project-state.md) — не существует как `@Processor`, дублирования консьюмера там сейчас нет; не тронуто этим планом.

**Что добавляется:**
1. `HealthModule`/`HealthController` (`@nestjs/terminus`) — `@Public()` (декоратор уже есть в `public.decorator.ts`). Импортируется всегда — нужен и `api`, и `sla-worker`.
   - `/health/live` — лёгкая самопроверка (процесс отвечает), без обращения к Postgres/Redis.
   - `/health/ready` — `checkBoth()` = Prisma `SELECT 1` + Redis `ping` через тот же `ioredis`-конфиг, что у `BullModule`.
   - **Отклонение от буквального текста ADR-005** ("livenessProbe/readinessProbe: `checkBoth()`" — для обеих проб): `checkBoth()` только на liveness означал бы, что транзиентный сбой БД убивает и перезапускает `sla-worker` (`replicas:1`) через kubelet — то есть саму причину даунтайма, от которой ADR-005 защищает. Liveness=лёгкий/readiness=`checkBoth()` — стандартная практика K8s, верная цели ADR-005 (избежать даунтайма/дублей), не его букве. ADR не редактируется (immutability), расхождение зафиксировано здесь как осознанное инженерное решение.
2. `TenantMiddleware` (`app.module.ts` — `consumer.apply(TenantMiddleware).forRoutes('*')`) — добавить `.exclude('/health/(.*)')`, иначе kubelet-проба без tenant-контекста может упасть до самого health-чека.
3. **`AppModule` не требует реструктуризации** — существующий гейт в `dispute-sla.module.ts` уже корректно изолирует `@Processor`; HPA-масштабирование `api` не создаёт дублирующихся SLA-консьюмеров уже сегодня (просто никто не запускал worker-роль в реальности до этого плана).

## 7. K8s-манифесты и инварианты ADR-005

**SLA Worker Deployment** (`infra/k8s/base/sla-worker/`):
```yaml
replicas: 1
strategy:
  type: Recreate
terminationGracePeriodSeconds: 30   # < lockDuration: 60s (BullMQ)
env:
  - name: ROLE
    value: worker
livenessProbe: /health/live (лёгкая проверка, без Postgres/Redis)
readinessProbe: /health/ready (checkBoth — Postgres + Redis)
```

**API Deployment** (`infra/k8s/base/api/`): rolling update, HPA (CPU-based, без заданного целевого % — уточняется на этапе implementation-плана), `ROLE` не задан.

**PgBouncer:** `pool_mode = session` (ADR-001, transaction mode запрещён).

**Redis:** `appendonly yes`, `appendfsync everysec` (ADR-005).

## 8. Валидация на kind

**Smoke-проверки (вручную, без CI):**
1. `/health/live` и `/health/ready` на `api`- и `sla-worker`-подах → 200 (раздельно — см. §6 про liveness/readiness split).
2. PgBouncer `pool_mode=session` (статическая проверка конфига в поде).
3. Redis `CONFIG GET appendonly` → `yes`.
4. Vault: внутри пода `/vault/secrets/db` существует, `printenv DATABASE_URL` показывает Vault-сгенерированное значение, не дефолт из `docker-compose.yml`.
5. PVC persistence: рестарт `postgres`/`redis` пода → данные на месте.

**Главный тест — ADR-005 recovery scan:**
1. Через `rejectGpResponse` (HTTP, Сценарий B) создать `sla_events`; напрямую в БД (`kubectl exec` в postgres-под) откатить `scheduledAt` в прошлое, `executedAt = NULL` — имитирует просроченное событие, потерянное вместе с Redis.
2. `kubectl delete pod -l app=sla-worker` — наблюдать `kubectl get pods -w`: благодаря `strategy.type: Recreate` старый под должен полностью завершиться прежде, чем стартует новый (в отличие от `RollingUpdate`, где поды на секунды совмещались бы) — сам по себе assert на корректность манифеста.
3. После старта нового пода `onModuleInit()` в `DisputeSlaWorker` должен поднять просроченное событие с `delay=0`. Проверка без Prometheus (отложен в follow-up): прямой DB-запрос `executedAt IS NOT NULL` через несколько секунд + `kubectl logs`.
4. Статическая проверка: `terminationGracePeriodSeconds: 30` < `lockDuration: 60s` — сравнение значений в YAML.
5. Идемпотентность (nice-to-have): повторный рестарт воркера сразу после первого → лог должен показать no-op skip (`if (!event || event.executedAt) return`), без дублей в `audit_log`.

**Явно не тестируется на этом этапе:** нагрузочное/chaos-тестирование, реальный отказ ноды/AZ, настоящая выдача TLS-сертификата, CI-автоматизация.

**Критерий готовности:** все поды `Running`/`Ready`; recovery-scan сценарий воспроизводится стабильно; `kind-up.sh` идемпотентен (удалить кластер → перезапустить скрипт → тот же результат).

## 9. Файловый план (предварительный, уточняется в implementation-плане)

| Файл/директория | Действие |
|---|---|
| `apps/api/src/modules/health/health.module.ts`, `health.controller.ts`, `health.service.ts` | Create |
| `apps/api/src/app.module.ts` | Modify: импорт `HealthModule`, `.exclude('/health/(.*)')` на `TenantMiddleware` |
| `apps/api/Dockerfile` (или отдельный `Dockerfile.worker`, если потребуется) | Modify: entrypoint-шим для Vault-секретов |
| `infra/k8s/base/{postgres,pgbouncer,redis,vault,api,sla-worker,web,ingress}/*.yaml` | Create |
| `infra/k8s/base/kustomization.yaml` | Create |
| `infra/k8s/overlays/{dev,staging,prod}/kustomization.yaml` | Create |
| `infra/k8s/scripts/kind-up.sh`, `vault-seed.sh` | Create |
| `infra/k8s/base/vault/rendered/*.yaml` | Create (вендоренный `helm template`-вывод) |

## 10. Вне скоупа этого плана (явно отложено)

- Observability stack (Prometheus/Grafana/OTel) — follow-up.
- Backup automation (pg_dump + S3) — follow-up.
- Реальный выбор облачного провайдера — `overlays/staging`/`overlays/prod` остаются заглушками.
- CI-интеграция kind-валидации — после разрешения B-CI-01.
- Production-grade Vault (HA, persistent backend, auto-unseal через cloud KMS, реальная CA) — переезжает в будущий cloud-provisioning план вместе с выбором облака.
- `MvRefreshWorker` ROLE-гейтинг — не существует как `@Processor`, не актуально сейчас.

## 11. Допущения (если ревьюер не согласен — единственное, что нужно поменять)

- **Kustomize вместо Helm для deploy.** `docs/architecture/infrastructure.md` §3 упоминает оба пути (`infra/k8s/` манифесты и `infra/helm/` charts) без явного приоритета. Архивный Sub-plan C (2026-05-17) уже выбрал Kustomize — этот план продолжает то решение. Helm используется только как одноразовый локальный генератор Vault injector-манифестов, не как deploy-механизм.
- **Один образ для `api` и `sla-worker`**, различие только через `ROLE` env + replica/strategy в манифесте — не два отдельных Dockerfile/CI-пайплайна.
- **Vault выбран сразу, не plain K8s Secrets** — explicit-решение пользователя; добавляет объём (injector, policies, seed-script) ради более реалистичного пути к будущему проду.
- **liveness=лёгкий, readiness=`checkBoth()`**, не `checkBoth()` для обеих проб буквально по ADR-005 — см. обоснование в §6. ADR-005 не редактируется, расхождение зафиксировано здесь.

## 12. Связанные ADR

- ADR-001 — PgBouncer session mode.
- ADR-005 — SLA Worker reliability (`replicas:1`, `Recreate`, recovery scan, idempotency).
- ADR-015 — SLA Worker canonical path (`apps/api/src/modules/dispute-sla/`).
