# ADR-009 — RBAC и GP Stateless Token

**Статус:** Принято rev 2
**Закрытый риск:** R-09

## Решение
NestJS Guards + JWT (Access 15 мин / Refresh 30 дней в БД) для внутренних пользователей + stateless UUID-токен в URL для ГП.

## Контекст
Четыре роли (`stroycontrol`, `director`, `admin`, worker) с принципиально разными правами. ГП — внешний актор без учётной записи, взаимодействует один раз за период. Rate limiting активен с первого деплоя.

## Практический кейс
Открывается период → генерируется `gpSubmissionToken = randomUUID()`, `gpTokenExpiresAt = sla_force_close_at - 1h`. ГП получает email со ссылкой `/gp/submit/:token`, кликает — `GpTokenGuard` проверяет: токен существует, не истёк, `gpSubmittedAt IS NULL`. После подачи атомарно `gpSubmittedAt = NOW()` — повторная подача → `GP_ALREADY_SUBMITTED`.

## Контракт реализации

**JWT:** Access TTL 15 мин, payload `{sub, role, iat, exp}`. Refresh TTL 30 дней, HTTP-only cookie + SHA-256 хэш в `refresh_tokens`. При ротации старый токен `revokedAt=NOW()`, выдаётся новая пара. Logout: `revokedAt=NOW()`.

**P-21:** `refresh_tokens(id UUID PK, user_id FK, token_hash VARCHAR(64) UNIQUE, issued_at, expires_at, revoked_at, user_agent, ip_address)`. Индекс `idx_refresh_tokens_user ON (user_id) WHERE revoked_at IS NULL`.

**Guards:** `JwtAuthGuard` + `RolesGuard` зарегистрированы глобально. `@Public()` требует внесения в `docs/security/public-routes-allowlist.txt` — CI проверяет diff. `GpTokenGuard` на `/gp/submit/:token` вместо `JwtAuthGuard`.

**RBAC-декораторы:** `@Roles('stroycontrol','admin')` на `closePeriod`; `@Roles('director')` на `approveZeroReport`; `@Roles('admin')` на `updateConfig`.

**GP Token:** генерируется при `openPeriod`, не при подаче. `gpTokenExpiresAt = addDays(now,5) - 1h`. Одноразовость: `upsert periodFacts` + `periods.gpSubmittedAt=NOW()` в транзакции. `submit_gp_template` — только онлайн (ADR-008).

**Rate limiting:** глобально 100 req/min. GP endpoint: `@Throttle({default:{limit:10,ttl:60_000}})`.

**Инварианты:**
- `gp_submission_token` генерируется при `openPeriod`, не при подаче
- `gpTokenExpiresAt = sla_force_close_scheduled_at - 1h` — вычисляется, не задаётся вручную
- Refresh tokens хранятся хэшированными (SHA-256); raw token никогда не пишется в БД
- Rate limiting активен в production и staging с первого деплоя

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Guest account для ГП | Onboarding, сброс пароля ради одной формы за период |
| OAuth для ГП | ГП — другая организация; её IdP недоступен |
| Magic link (JWT) | Избыточная сложность при коротком TTL; UUID проще |
