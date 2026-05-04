# Cross-Cutting Concerns

## 1. Purpose

Сквозные механизмы, применяемые во всех модулях CCIP: логирование, конфигурация, обработка ошибок, rate limiting, трассировка.

---

## 2. Structured Logging

- **Библиотека:** Pino (через NestJS Pino)
- **Формат:** JSON (не text) во всех окружениях
- **Обязательные поля** каждого лога:

```json
{
  "level": "info|warn|error",
  "time": "ISO 8601",
  "request_id": "uuid",
  "tenant_id": "uuid",
  "user_id": "uuid|null",
  "module": "PeriodEngine|Auth|...",
  "msg": "..."
}
```

- `request_id` — генерируется в middleware, передаётся через AsyncLocalStorage
- Уровень `error` — всегда с `err.stack`
- Не логировать PII (email, имена) в debug уровне

---

## 3. Configuration (NestJS ConfigModule)

- `@nestjs/config` с валидацией через `class-validator`
- `.env` файлы: `.env.local`, `.env.production`
- Переменные проверяются при старте — приложение не стартует при невалидных значениях

Критические переменные:
```
DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET
SMTP_*, FCM_KEY, APNS_KEY, S3_BUCKET
```

---

## 4. Error Handling

- Global `HttpExceptionFilter` — преобразует все исключения в единый формат
- Формат ответа ошибки:

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": "human-readable описание",
  "request_id": "uuid"
}
```

- `500` ошибки — логировать с `err.stack`, пользователю показывать generic сообщение
- Доменные исключения наследуют от `DomainException` с кодом ошибки

---

## 5. Rate Limiting

- `@nestjs/throttler` + Redis store (shared across instances)
- Default: 100 запросов / 60 секунд на IP
- GpToken endpoints: 20 запросов / 60 секунд (более строгий лимит)
- Auth endpoints `/auth/login`, `/auth/refresh`: 10 / 60 секунд

---

## 6. OpenTelemetry Tracing

- `@opentelemetry/sdk-node` с auto-instrumentation
- Трейсы для: HTTP requests, Prisma queries, BullMQ jobs
- `trace_id` пробрасывается в Pino через correlation context
- Export: OTLP → Jaeger (dev) / Grafana Tempo (prod)

---

## 7. Request ID

- UUID генерируется в `RequestIdMiddleware` (первым в pipeline)
- Хранится в `AsyncLocalStorage` — доступен везде без явной передачи
- Возвращается в response header `X-Request-Id`
- Используется в логах и error responses
