# Integrations Architecture

## 1. Purpose

Внешние интеграции платформы CCIP: уведомления, файловое хранилище, отчёты.

---

## 2. Email / SMTP

Модуль: `apps/api/src/notifications/`

- NestJS Mailer Module + Nodemailer
- Шаблоны: Handlebars
- Очередь отправки через BullMQ (не синхронно)
- Retry при failed delivery: 3 попытки с backoff
- Переменные: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

Триггеры отправки:
- Открытие периода → уведомление подрядчику
- Обнаружено расхождение → уведомление участникам
- SLA эскалация → уведомление директору

---

## 3. Push Notifications (ADR-014)

Модуль: `apps/api/src/notifications/push/`

**Архитектура:**
```
API event → BullMQ push-queue → PushWorker → FCM (Android) / APNs (iOS)
```

Правило: **push никогда не отправляется напрямую из сервиса** — только через очередь.

- FCM: Firebase Cloud Messaging (HTTP v1 API)
- APNs: Apple Push Notification service (JWT-based auth)
- Device tokens хранятся в `device_tokens` таблице (с `tenant_id`)
- При expired token → удалять из таблицы автоматически

---

## 4. File Storage (S3)

Модуль: `apps/api/src/storage/`

- AWS S3 или S3-compatible (MinIO для dev)
- Файлы: фотографии верификации, PDF отчёты
- Pre-signed URLs для direct upload с мобильного клиента
- TTL URL: 15 минут для upload, 1 час для download
- Lifecycle policy: удаление temporary файлов через 24 часа

Структура ключей: `{tenant_id}/{object_id}/{period_id}/{filename}`

---

## 5. PDF Reports (ADR-013)

Модуль: `apps/api/src/reports/`

- Генерация по запросу (не фоново)
- Библиотека: Puppeteer или pdfmake
- Шаблоны: HTML → PDF
- Типы отчётов: Period Summary, Analytics Export, Disputes Log
- Хранение: S3 с pre-signed download URL (TTL 1 час)

---

## 6. ADR References

- ADR-013: PDF reports generation strategy
- ADR-014: push notifications через очередь (не direct)
