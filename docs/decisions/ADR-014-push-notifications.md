# ADR-014 — Push-уведомления: Firebase Cloud Messaging (FCM)

**Статус:** Принято
**Закрытый риск/пробел:** §10.4

## Решение
Push через FCM; FCM-токены устройств в `device_tokens`; отправка встроена в `NotificationService` — INSERT `notifications` и push логически атомарны; FCM fire-and-forget (ошибка не откатывает уведомление).

## Контекст
`notifications` таблица уже существует для web-поллинга. SC работает на объекте вне браузера. Критичные события требуют push: SLA force_close, offline sync conflict, zero_report alert, UpdateBaseline approved/rejected.

## Практический кейс
BullMQ worker выполняет day-5 force_close объекта «Склад этап 2». `NotificationService.notify(userId=Иванов, type='force_close_unlocked')` пишет в `notifications` и вызывает `FcmService.sendMulticast`. SC в туннеле — FCM удерживает push до 28 дней (default TTL). При выходе из туннеля телефон получает push, tap → deep link `/objects/:id/periods/:id`.

## Контракт реализации

**P-32:** `device_tokens(id UUID PK, user_id UUID FK CASCADE, fcm_token TEXT, platform TEXT CHECK(IN('android','ios')), device_id TEXT, registered_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT TRUE)`. Индекс `idx_device_tokens_user_active ON (user_id) WHERE is_active=TRUE`. Unique `uq_device_tokens_device ON (device_id) WHERE device_id IS NOT NULL`.

**API:**
- `POST /devices/register` — `{fcmToken, platform, deviceId?}`, `JwtAuthGuard`. Upsert по `device_id`; старый токен того же `device_id` → `is_active=FALSE`.
- `POST /devices/unregister` — `{fcmToken}` → `is_active=FALSE`. Вызывается при logout.

**`NotificationService.notify(userId, type, refTable, refId, message, opts?)`:**
1. `INSERT notifications` — всегда
2. `findMany device_tokens WHERE userId AND is_active=TRUE` → `FcmService.sendMulticast(tokens, {title, body, data:{refTable,refId,type}})` — `catch(err => logger.error)` (fire-and-forget)

**Обработка ошибок FCM:**
| Ошибка | Действие |
|---|---|
| `REGISTRATION_TOKEN_NOT_VALID` | `device_tokens.is_active=FALSE` |
| `QUOTA_EXCEEDED` | Log + BullMQ delayed retry через 60 сек |
| `INTERNAL` / network | Log warn; уведомление придёт при следующем открытии app |

**FCM init:** Firebase Admin SDK инициализируется один раз в `FcmModule.onModuleInit()`. Credentials из K8s Secret `fcm-service-account` (keys: `project_id`, `private_key`, `client_email`).

**Mobile (React Native, @react-native-firebase/messaging):** `onMessage` (foreground) → local notification + WatermelonDB badge; `setBackgroundMessageHandler` (background/killed) → OS notification + deep link через `remoteMessage.data`. При login: `getToken()` → `POST /devices/register`.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| APNs напрямую | Только iOS; FCM нужен для Android в любом случае |
| OneSignal | Vendor lock-in; платный при росте MAU |
| WebSocket polling (mobile) | Не работает при killed app; battery drain |
