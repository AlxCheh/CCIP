# ADR-014 — Push-уведомления: Firebase Cloud Messaging (FCM)

**Статус:** Принято  
**Дата:** 2026-04-25  
**Закрытый пробел §10.4:** Push-уведомления для Mobile

---

## Решение (одна строка)

Push-уведомления мобильным SC-инженерам доставляются через Firebase Cloud Messaging (FCM); FCM-токены устройств хранятся в `device_tokens`; отправка встроена в существующий `NotificationService` — insert в `notifications` и push идут в одной транзакции логики.

---

## Контекст

`notifications` таблица существует (хранит `user_id`, `type`, `reference_table`, `reference_id`, `message`, `read_at`). Web-клиент читает уведомления поллингом. Мобильный SC-инженер работает на объекте — не смотрит браузер. Критичные события, требующие push:

- SLA day-3: уведомление директору о споре (→ директор может быть в мобайле)
- SLA day-5 force_close: SC разблокирован — может закрывать период
- Конфликт offline sync: `sync_queue.status = 'conflict'` — SC должен разрешить вручную
- 0-отчёт ожидает утверждения `zero_report_alert_days` дней
- UpdateBaseline approved/rejected

---

## Практический кейс

SC-инженер Иванов в туннеле стройплощадки — 8 часов без сети. На сервере BullMQ worker отработал day-5 force_close по объекту «Складской центр этап 2»: `periods.status = 'force_closed'`, SLA разблокирован. `NotificationService` создаёт запись в `notifications` и вызывает `FcmService.send(userId=Иванов)`. FCM удерживает push до 28 дней (default TTL). Иванов выходит из туннеля — телефон получает: «Период 7 разблокирован после force_close. Можете закрыть период.»

При возврате онлайн: WatermelonDB sync + push tap → открывается нужный период напрямую (deep link `/objects/:id/periods/:id`).

---

## Контракт реализации

### Таблица device_tokens

```sql
CREATE TABLE device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token     TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  device_id     TEXT,          -- client-side идентификатор для замены старых токенов
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_device_tokens_user_active ON device_tokens(user_id) WHERE is_active = TRUE;
CREATE UNIQUE INDEX uq_device_tokens_device ON device_tokens(device_id) WHERE device_id IS NOT NULL;
```

Один пользователь — несколько устройств: допустимо. Старый токен того же `device_id` деактивируется при регистрации нового (`is_active = FALSE`).

### API

```
POST /devices/register
  body: { fcmToken: string, platform: 'android'|'ios', deviceId?: string }
  auth: JwtAuthGuard (любая роль)
  → upsert device_tokens по device_id (или insert нового)

POST /devices/unregister
  body: { fcmToken: string }
  → device_tokens.is_active = FALSE

(вызывается при logout из mobile)
```

### NotificationService — расширенный контракт

```typescript
async notify(userId, type, refTable, refId, message, opts?: { push?: boolean }) {
  // 1. Всегда: INSERT notifications
  await prisma.notification.create({ data: { userId, type, ... } });

  // 2. Если push !== false: отправить FCM (fire-and-forget, ошибка не прерывает)
  const tokens = await prisma.deviceToken.findMany({
    where: { userId, isActive: true }
  });
  if (tokens.length) {
    await this.fcmService.sendMulticast(tokens.map(t => t.fcmToken), {
      title: FCM_TITLES[type],
      body:  message,
      data:  { refTable, refId, type },  // для deep link в mobile
    }).catch(err => this.logger.error('FCM send failed', err));
  }
}
```

Push — best-effort: ошибка FCM (сеть, неверный токен) не откатывает INSERT `notifications`.

### Обработка ошибок FCM

| FCM ошибка | Действие |
|-----------|---------|
| `REGISTRATION_TOKEN_NOT_VALID` | `device_tokens.is_active = FALSE` |
| `QUOTA_EXCEEDED` | Log + retry через 60 секунд (BullMQ delayed job) |
| `INTERNAL` / network | Log warn; пользователь увидит уведомление при следующем открытии app |

### FCM конфигурация (K8s)

```yaml
# Secret: fcm-service-account
env:
  - name: FIREBASE_PROJECT_ID
    valueFrom: { secretKeyRef: { name: fcm-service-account, key: project_id } }
  - name: FIREBASE_PRIVATE_KEY
    valueFrom: { secretKeyRef: { name: fcm-service-account, key: private_key } }
  - name: FIREBASE_CLIENT_EMAIL
    valueFrom: { secretKeyRef: { name: fcm-service-account, key: client_email } }
```

Firebase Admin SDK инициализируется один раз в `FcmModule.onModuleInit()`.

### Mobile: React Native

```typescript
// apps/mobile: @react-native-firebase/messaging
messaging().onMessage(async remoteMessage => {
  // foreground push → local notification + обновить WatermelonDB badge
});
messaging().setBackgroundMessageHandler(async remoteMessage => {
  // background / killed → OS shows notification; tap → deep link via remoteMessage.data
});
// При login:
const fcmToken = await messaging().getToken();
await api.post('/devices/register', { fcmToken, platform: Platform.OS, deviceId });
```

---

## Патчи схемы БД

| Патч | Содержание |
|------|-----------|
| **P-32** | Таблица `device_tokens` (см. выше) |

---

## Отклонённые альтернативы

| Альтернатива | Причина отклонения |
|-------------|-------------------|
| APNs напрямую | Только iOS; нужен отдельный сертификат; FCM всё равно нужен для Android |
| OneSignal | Vendor lock-in; платный при росте MAU; FCM SDK бесплатен; дополнительная зависимость от внешнего SaaS |
| WebSocket polling (mobile) | Не работает при killed app; battery drain; FCM = нативный механизм |
| Polling `GET /notifications` | Уже есть для web; недостаточно для mobile без фонового режима |
