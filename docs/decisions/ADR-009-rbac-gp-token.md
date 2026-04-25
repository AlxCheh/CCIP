# ADR-009 — RBAC и GP Stateless Token

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-25  
**Риск:** R-09

## Проблема

Система обслуживает четыре роли с принципиально разными правами (`stroycontrol`, `director`, `admin`, системный worker) и одного внешнего актора — Генерального подрядчика. ГП не является сотрудником Заказчика, не имеет учётной записи в системе, и взаимодействует ровно один раз за период — подаёт шаблон-сводку.

Два связанных архитектурных вопроса:
1. Как реализовать RBAC для внутренних пользователей в NestJS?
2. Как предоставить ГП доступ к форме подачи шаблона без создания аккаунта?

## Решение

**RBAC:** NestJS Guards + Decorators + JWT.  
**GP-доступ:** Stateless одноразовый UUID-токен в URL (`gp_submission_token`).  
**Refresh tokens:** хранятся в БД (`refresh_tokens`) для возможности revocation.  
**Rate limiting:** активен с первого деплоя.

## RBAC — внутренние пользователи

### JWT-контракт

| Токен | TTL | Хранение | Ротация |
|-------|-----|---------|---------|
| Access Token | 15 минут | Authorization header (Bearer) | Нет |
| Refresh Token | 30 дней | HTTP-only cookie + хэш в `refresh_tokens` | При каждом обновлении; старый revoked |

Payload Access Token: `{ sub: userId, role: 'stroycontrol' | 'director' | 'admin', iat, exp }`.

### Таблица refresh_tokens (P-21)

```sql
-- P-21 (schema.sql)
CREATE TABLE refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,   -- SHA-256 hex токена
    issued_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,                    -- NULL = активен
    user_agent  TEXT,                           -- для отображения активных сессий
    ip_address  INET
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
```

### Контракт Refresh Token Service

```typescript
// auth.service.ts
async refreshAccessToken(rawRefreshToken: string): Promise<TokenPair> {
  const tokenHash = sha256hex(rawRefreshToken);

  const record = await this.prisma.refreshTokens.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record) throw new UnauthorizedException('REFRESH_TOKEN_INVALID');
  if (record.revokedAt) throw new UnauthorizedException('REFRESH_TOKEN_REVOKED');
  if (record.expiresAt < new Date()) throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');

  // Revoke текущий токен (rotation)
  await this.prisma.refreshTokens.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  // Выдаём новую пару; grace period 5 сек для race condition (2 вкладки)
  const newRefresh = randomUUID();
  await this.prisma.refreshTokens.create({
    data: {
      userId: record.user.id,
      tokenHash: sha256hex(newRefresh),
      expiresAt: addDays(new Date(), 30),
    },
  });

  return {
    accessToken: this.jwtService.sign({ sub: record.user.id, role: record.user.role }),
    refreshToken: newRefresh,
  };
}

async logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = sha256hex(rawRefreshToken);
  await this.prisma.refreshTokens.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

### NestJS Guards

```typescript
// guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// decorators/roles.decorator.ts
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

### Применение декораторов (RBAC-матрица)

```typescript
@Post(':id/close')
@Roles('stroycontrol', 'admin')
async closePeriod(@Param('id') id: string, @CurrentUser() user: JwtPayload) { ... }

@Post(':id/approve')
@Roles('director')
async approveZeroReport(@Param('id') id: string, @CurrentUser() user: JwtPayload) { ... }

@Post('/config')
@Roles('admin')
async updateConfig(@Body() dto: ConfigDto, @CurrentUser() user: JwtPayload) { ... }
```

Глобальная регистрация `JwtAuthGuard` + `RolesGuard` в `AppModule`. Все эндпоинты защищены по умолчанию; отключение через `@Public()`.

### CI-проверка @Public роутов

```bash
# .github/workflows/ci.yml — проверяет, что новые @Public роуты добавлены в allowlist
grep -rn "@Public" src/ --include="*.ts" | grep -v "__tests__" \
  | awk '{print $1}' | sort > /tmp/public_routes_current.txt
diff docs/security/public-routes-allowlist.txt /tmp/public_routes_current.txt || \
  (echo "Новый @Public роут требует ревью и добавления в allowlist" && exit 1)
```

## GP Stateless Token

### Почему не аккаунт / не OAuth

| Альтернатива | Проблема |
|-------------|---------|
| Guest account (login/password) | Накладные расходы: onboarding, сброс пароля — ради одной формы за период |
| OAuth (Google/LDAP) | ГП — другая организация; её IdP недоступен; избыточно |
| Magic link (одноразовый JWT) | Избыточная сложность; UUID проще при коротком TTL |
| **UUID в URL (принято)** | ГП кликает ссылку из письма → форма открывается немедленно |

### Контракт GP Token

```typescript
// period.service.ts — при открытии периода
async openPeriod(objectId: string, actorId: string): Promise<Period> {
  return this.prisma.$transaction(async (tx) => {
    // ... advisory lock + бизнес-проверки (ADR-002) ...

    const gpToken = randomUUID();

    // gpTokenExpiresAt выровнен с SLA-событием force_close (ADR-005 day 5),
    // минус 1 час буфера — чтобы ГП не мог сабмитить в окне гонки с force_close
    const slaForcCloseAt = addDays(new Date(), 5);
    const gpTokenExpiresAt = subHours(slaForcCloseAt, 1);

    const period = await tx.periods.create({
      data: {
        objectId,
        periodNumber: (last?.periodNumber ?? 0) + 1,
        status: 'open',
        openedBy: actorId,
        openedAt: new Date(),
        gpSubmissionToken: gpToken,
        gpTokenExpiresAt,
      },
    });

    await this.notificationsService.notifyGP(objectId, gpToken);
    return period;
  }, { isolationLevel: 'ReadCommitted' });
}
```

### GP Token Guard

```typescript
// guards/gp-token.guard.ts
@Injectable()
export class GpTokenGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.params.token;

    const period = await this.prisma.periods.findFirst({
      where: { gpSubmissionToken: token },
    });

    if (!period) throw new UnauthorizedException('GP_TOKEN_INVALID');
    if (period.gpTokenExpiresAt < new Date()) throw new UnauthorizedException('GP_TOKEN_EXPIRED');
    if (period.gpSubmittedAt) throw new ConflictException('GP_ALREADY_SUBMITTED');

    req.gpPeriod = period;
    return true;
  }
}

// gp.controller.ts
@Post('/gp/submit/:token')
@UseGuards(GpTokenGuard)
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })  // 10 req/min — активно с первого деплоя
async submitGPTemplate(
  @Param('token') token: string,
  @Req() req: { gpPeriod: Period },
  @Body() dto: GPSubmissionDto,
) { ... }
```

### Одноразовость токена

```typescript
// gp.service.ts
async submitTemplate(period: Period, dto: GPSubmissionDto): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // Атомарно фиксируем время подачи — повторная подача → GP_ALREADY_SUBMITTED
    await tx.periods.update({
      where: { id: period.id },
      data: { gpSubmittedAt: new Date() },
    });

    for (const item of dto.items) {
      await tx.periodFacts.upsert({
        where: { periodId_boqItemId: { periodId: period.id, boqItemId: item.boqItemId } },
        create: { periodId: period.id, boqItemId: item.boqItemId, gpVolume: item.volume },
        update: { gpVolume: item.volume },
      });
    }
  });
}
```

## Rate Limiting

**Включён с первого деплоя** (не откладывается). Глобальные настройки через `ThrottlerModule`:

```typescript
// app.module.ts
ThrottlerModule.forRoot([{
  name: 'default',
  ttl: 60_000,
  limit: 100,   // 100 req/min для аутентифицированных пользователей
}]),
```

GP endpoint (`/gp/submit/:token`) использует отдельный `@Throttle({ default: { limit: 10, ttl: 60_000 } })` — 10 req/min, т.к. endpoint публичный и обращён к внешнему актору.

## Инварианты

- Все внутренние эндпоинты защищены `JwtAuthGuard` глобально; `@Public()` требует внесения в `docs/security/public-routes-allowlist.txt` и ревью.
- GP endpoint использует `GpTokenGuard`, не `JwtAuthGuard`.
- `gp_submission_token` генерируется при открытии периода, не при подаче шаблона.
- `gpTokenExpiresAt = sla_force_close_scheduled_at - 1h` — единый источник истины через вычисление.
- Повторная подача невозможна: `gpSubmittedAt IS NOT NULL` → `GP_ALREADY_SUBMITTED`.
- Refresh tokens хранятся хэшированными (SHA-256) в `refresh_tokens`; logout = `revokedAt = NOW()`.
- Rate limiting для `/gp/submit/:token`: 10 req/min — активен в production и staging.
