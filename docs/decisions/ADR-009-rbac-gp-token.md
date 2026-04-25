# ADR-009 — RBAC и GP Stateless Token

**Статус:** Принято  
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

## RBAC — внутренние пользователи

### JWT-контракт

| Токен | TTL | Хранение | Ротация |
|-------|-----|---------|---------|
| Access Token | 15 минут | Authorization header (Bearer) | Нет |
| Refresh Token | 30 дней | HTTP-only cookie | При каждом обновлении access token |

Payload Access Token: `{ sub: userId, role: 'stroycontrol' | 'director' | 'admin', iat, exp }`.

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
// period.controller.ts
@Post(':id/close')
@Roles('stroycontrol', 'admin')   // только SC и Admin
async closePeriod(@Param('id') id: string, @CurrentUser() user: JwtPayload) { ... }

// zero-report.controller.ts
@Post(':id/approve')
@Roles('director')                // только Director
async approveZeroReport(@Param('id') id: string, @CurrentUser() user: JwtPayload) { ... }

// admin.controller.ts
@Post('/config')
@Roles('admin')                   // только Admin
async updateConfig(@Body() dto: ConfigDto, @CurrentUser() user: JwtPayload) { ... }
```

Глобальная регистрация `JwtAuthGuard` + `RolesGuard` в `AppModule` — все эндпоинты защищены по умолчанию, явное отключение через `@Public()`.

## GP Stateless Token

### Почему не аккаунт / не OAuth

| Альтернатива | Проблема |
|-------------|---------|
| Guest account (login/password) | Накладные расходы: onboarding, сброс пароля, управление сессией — ради одной формы за период |
| OAuth (Google/LDAP) | ГП — другая организация; её IdP нам не доступен; избыточно |
| Magic link (одноразовый JWT) | Избыточная сложность; UUID проще и достаточен при коротком TTL |
| **UUID в URL (принято)** | ГП кликает ссылку из письма → форма открывается немедленно; никакой авторизации |

### Контракт GP Token

```typescript
// period.service.ts — вызывается при открытии периода (SC)
async openPeriod(objectId: string, actorId: string): Promise<Period> {
  return this.prisma.$transaction(async (tx) => {
    // ... advisory lock + бизнес-проверки (ADR-002) ...

    const gpToken = randomUUID();
    const period = await tx.periods.create({
      data: {
        objectId,
        periodNumber: (last?.periodNumber ?? 0) + 1,
        status: 'open',
        openedBy: actorId,
        openedAt: new Date(),
        gpSubmissionToken: gpToken,
        // Истекает после SLA deadlock A day 5
        gpTokenExpiresAt: addDays(new Date(), 5),
      },
    });

    // Email ГП со ссылкой: https://app/gp/submit/{gpToken}
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

    req.gpPeriod = period;  // доступно в контроллере
    return true;
  }
}

// gp.controller.ts — эндпоинт без JwtAuthGuard
@Post('/gp/submit/:token')
@UseGuards(GpTokenGuard)
@Public()  // отключает глобальный JwtAuthGuard
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
    // Атомарно фиксируем время подачи — повторная подача в GP Token Guard вернёт GP_ALREADY_SUBMITTED
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

## Rate Limiting (отложено)

Endpoint `POST /gp/submit/:token` не защищён rate limiting. UUID v4 имеет 2^122 пространство значений — перебор практически невозможен, но endpoint уязвим к DoS-атакам (высокая нагрузка без аутентификации).

**Отложено:** реализовать `@Throttle(10, 60)` (10 запросов / 60 секунд) через `@nestjs/throttler` перед продакшн-деплоем. Документировано в §10.4 как известный пробел.

## Инварианты

- Все внутренние эндпоинты защищены `JwtAuthGuard` глобально; отключение через `@Public()` требует явного обоснования.
- GP endpoint использует `GpTokenGuard`, не `JwtAuthGuard` — GP не имеет JWT.
- `gp_submission_token` генерируется при открытии периода, не при подаче шаблона.
- Повторная подача невозможна: `gpSubmittedAt IS NOT NULL` → `GP_ALREADY_SUBMITTED`.
- Истечение токена (`gpTokenExpiresAt`) — SLA deadline day 5; после этого ГП не может подать шаблон даже при наличии ссылки.
- `@Roles()` без аргументов = публичный доступ для авторизованных; `@Public()` = без JWT.
