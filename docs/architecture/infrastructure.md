# Infrastructure Architecture

## 1. Purpose

Описывает инфраструктуру развёртывания CCIP: локальная разработка (Docker Compose) и production (Kubernetes).

---

## 2. Local Development — Docker Compose

Файл: `docker-compose.yml` в корне проекта.

Сервисы:
| Сервис | Image | Примечание |
|--------|-------|-----------|
| `postgres` | postgres:16 | с pg_partman расширением |
| `pgbouncer` | pgbouncer | session mode — обязательно (ADR-001) |
| `redis` | redis:7 | AOF включён (ADR-005) |
| `api` | node:20 | NestJS, hot-reload |
| `web` | node:20 | Vite dev server |

---

## 3. Production — Kubernetes

Манифесты: `infra/k8s/`, Helm charts: `infra/helm/`.

### Критические конфигурации (нарушение = production incident)

**SLA Worker (ADR-005):**
```yaml
replicas: 1
strategy:
  type: Recreate   # НЕ RollingUpdate — ломает SLA гарантии
```

**Redis:**
```
appendonly yes
appendfsync everysec
```

**PgBouncer:**
```
pool_mode = session   # transaction mode запрещён (ADR-001)
```

---

## 4. Critical Alerts

Настроить обязательно:

| Alert | Условие | Severity |
|-------|---------|----------|
| MV refresh lag | `mv_refresh_log` задержка > 10 мин в рабочее время | HIGH |
| Audit log default partition | попадание записей в default partition | CRITICAL |
| SLA Worker down | downtime > 30 сек | CRITICAL |
| PgBouncer pool exhaustion | connection pool 100% | HIGH |
| Redis AOF rewrite failure | rewrite ошибка | HIGH |

---

## 5. Observability

- **Prometheus** — метрики сервисов, PostgreSQL exporter, Redis exporter
- **Grafana** — дашборды по SLA, MV freshness, pool utilization
- **OpenTelemetry** — distributed tracing для API запросов
- **Structured logs** — JSON, correlation_id на каждый запрос

---

## 6. Backup Strategy

- `pg_dump` по расписанию (hourly incremental, daily full)
- Upload в S3 с lifecycle policy (retention 30 дней)
- Drill-восстановление: тест recovery каждые 2 недели
- Redis RDB + AOF — оба включены

---

## 7. Secrets

- Только через Kubernetes Secrets или Vault
- Никогда в коде, ConfigMap или environment в Dockerfile
- Ротация JWT secret требует rolling deploy API

---

## 8. ADR References

- ADR-001: PgBouncer session mode
- ADR-005: SLA Worker — `replicas:1`, `strategy:Recreate`
