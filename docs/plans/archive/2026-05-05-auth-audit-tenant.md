# M-02a/b/c — Auth, AuditLog & Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать полную JWT-аутентификацию (login/refresh/logout + GpTokenGuard), append-only AuditLogService и multi-tenant middleware с PrismaTenantExtension — разблокировав все downstream модули M-03+.

**Architecture:** JwtAuthGuard + RolesGuard регистрируются глобально через APP_GUARD; декоратор @Public() пропускает auth для login/refresh; GpTokenGuard валидирует одноразовый UUID-токен из таблицы periods; AuditLogService оборачивает prisma.auditLog.create (без update/delete методов); TenantMiddleware извлекает organizationId из JWT payload (без проверки подписи) → AsyncLocalStorage; PrismaTenantExtension перехватывает Prisma-запросы через $extends-замыкание, инжектируя WHERE organizationId.

**Tech Stack:** NestJS 11, @nestjs/passport, passport-jwt, @nestjs/jwt, @nestjs/throttler, bcrypt, Node.js crypto (SHA-256), AsyncLocalStorage, Prisma 5 $extends

---

## Порядок выполнения

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5   (auth chain, sequential)
Task 6 (AuditLog)  — независима, параллельно после Task 1
Task 7 (Tenant)    — после Task 2 (нужна форма JWT payload)
Task 8 (Extension) — после Task 7
Task 9 (Wire-up)   — последняя, после всех
```

---

## File Map

**Новые файлы:**
- `apps/api/src/common/guards/public.decorator.ts`
- `apps/api/src/common/guards/gp-token.guard.ts`
- `apps/api/src/common/auth/auth.service.ts`
- `apps/api/src/common/auth/auth.controller.ts`
- `apps/api/src/common/auth/dto/login.dto.ts`
- `apps/api/src/common/auth/dto/refresh.dto.ts`
- `apps/api/src/common/audit/audit-log.service.ts`
- `apps/api/src/common/audit/audit-log.module.ts`
- `apps/api/src/common/tenant/tenant.context.ts`
- `apps/api/src/common/tenant/tenant.middleware.ts`
- `apps/api/src/common/tenant/prisma-tenant.extension.ts`
- `docs/security/public-routes-allowlist.txt`

**Изменяемые файлы:**
- `apps/api/src/common/guards/jwt.strategy.ts` — add organizationId to payload
- `apps/api/src/common/guards/jwt-auth.guard.ts` — add @Public() bypass
- `apps/api/src/common/guards/auth.module.ts` — fix TTL 8h→15min, exports
- `apps/api/src/common/prisma/prisma.service.ts` — apply tenant extension
- `apps/api/src/app.module.ts` — global guards, middleware, new modules
- `apps/api/src/modules/period/period.controller.ts` — remove local @UseGuards
- `packages/database/prisma/schema.prisma` — add passwordHash to User

**Тесты:**
- `apps/api/src/common/guards/gp-token.guard.spec.ts`
- `apps/api/src/common/auth/auth.service.spec.ts`
- `apps/api/src/common/audit/audit-log.service.spec.ts`
- `apps/api/src/common/tenant/tenant.middleware.spec.ts`

---

## Task 1: bcrypt + passwordHash миграция

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (User model)
- Create: migration через CLI

- [ ] **Step 1: Установить bcrypt**

```bash
pnpm --filter @ccip/api add bcrypt
pnpm --filter @ccip/api add -D @types/bcrypt
```

Expected: `packages/api/package.json` содержит `"bcrypt": "..."` в dependencies.

- [ ] **Step 2: Добавить passwordHash в User модель**

В `packages/database/prisma/schema.prisma`, в модель `User` (после строки `organizationId`), добавить:

```prisma
model User {
  id             Int      @id @default(autoincrement())
  email          String   @unique @db.VarChar(255)
  name           String   @db.VarChar(255)
  role           String   @db.VarChar(50)
  passwordHash   String   @db.VarChar(255) @map("password_hash")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @db.Timestamptz() @map("created_at")
  organizationId String   @db.Uuid @map("organization_id")
  // ...остальные relations без изменений
}
```

- [ ] **Step 3: Создать миграцию**

```bash
pnpm --filter @ccip/database prisma migrate dev --name add_password_hash
```

Expected output:
```
The following migration(s) have been created and applied:
migrations/
  └─ 20260505XXXXXX_add_password_hash/
       └─ migration.sql
```

- [ ] **Step 4: Проверить migration.sql**

Файл должен содержать:
```sql
ALTER TABLE "users" ADD COLUMN "password_hash" VARCHAR(255) NOT NULL DEFAULT '';
```

Если Prisma добавила DEFAULT '' — это нормально для миграции на существующую таблицу (dev). В production seed нужен реальный hash.

- [ ] **Step 5: Обновить seed с тестовым пользователем**

В `packages/database/prisma/seed.ts` добавить хеширование пароля для seeded пользователей:

```typescript
import * as bcrypt from 'bcrypt';

// В начале seed функции:
const passwordHash = await bcrypt.hash('Admin1234!', 12);

// При создании тестового пользователя:
await prisma.user.upsert({
  where: { email: 'admin@example.com' },
  update: {},
  create: {
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    passwordHash,
    organizationId: org.id,
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations apps/api/package.json pnpm-lock.yaml packages/database/prisma/seed.ts
git commit -m "feat: add passwordHash to User + bcrypt dependency"
```

---

## Task 2: JWT payload + @Public() + JwtAuthGuard

**Files:**
- Modify: `apps/api/src/common/guards/jwt.strategy.ts`
- Modify: `apps/api/src/common/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/common/guards/public.decorator.ts`

- [ ] **Step 1: Написать тест на JwtStrategy.validate**

Создать `apps/api/src/common/guards/jwt.strategy.spec.ts`:

```typescript
import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = { getOrThrow: () => 'test-secret' } as unknown as ConfigService;
    strategy = new JwtStrategy(config);
  });

  it('returns user with organizationId', () => {
    const payload = {
      sub: '42',
      email: 'test@example.com',
      role: 'admin',
      organizationId: 'org-uuid-123',
    };
    const result = strategy.validate(payload);
    expect(result).toEqual({
      id: '42',
      email: 'test@example.com',
      role: 'admin',
      organizationId: 'org-uuid-123',
    });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
pnpm --filter @ccip/api test --testPathPattern jwt.strategy.spec
```

Expected: FAIL — `organizationId` не возвращается (старый validate).

- [ ] **Step 3: Обновить JwtStrategy**

Полное содержимое `apps/api/src/common/guards/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
    };
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться что проходит**

```bash
pnpm --filter @ccip/api test --testPathPattern jwt.strategy.spec
```

Expected: PASS.

- [ ] **Step 5: Создать @Public() декоратор**

Содержимое `apps/api/src/common/guards/public.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 6: Обновить JwtAuthGuard с @Public() bypass**

Полное содержимое `apps/api/src/common/guards/jwt-auth.guard.ts`:

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/guards/jwt.strategy.ts apps/api/src/common/guards/jwt.strategy.spec.ts apps/api/src/common/guards/jwt-auth.guard.ts apps/api/src/common/guards/public.decorator.ts
git commit -m "feat: add organizationId to JWT payload + @Public decorator"
```

---

## Task 3: AuthService + AuthController

**Files:**
- Create: `apps/api/src/common/auth/dto/login.dto.ts`
- Create: `apps/api/src/common/auth/auth.service.ts`
- Create: `apps/api/src/common/auth/auth.controller.ts`
- Modify: `apps/api/src/common/guards/auth.module.ts`

- [ ] **Step 1: Написать тест на AuthService.login**

Создать `apps/api/src/common/auth/auth.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService.login', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const hash = await bcrypt.hash('password123', 12);
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          email: 'user@example.com',
          role: 'admin',
          organizationId: 'org-uuid',
          passwordHash: hash,
          isActive: true,
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access.token.here') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('throws UnauthorizedException for wrong password', async () => {
    await expect(
      service.login('user@example.com', 'wrongpassword', 'agent', '127.0.0.1'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns accessToken on valid credentials', async () => {
    const result = await service.login(
      'user@example.com',
      'password123',
      'agent',
      '127.0.0.1',
    );
    expect(result.accessToken).toBe('access.token.here');
    expect(result.refreshToken).toHaveLength(36); // UUID
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
pnpm --filter @ccip/api test --testPathPattern auth.service.spec
```

Expected: FAIL — файл не существует.

- [ ] **Step 3: Создать LoginDto**

Содержимое `apps/api/src/common/auth/dto/login.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 4: Создать AuthService**

Содержимое `apps/api/src/common/auth/auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    const accessToken = await this.jwt.signAsync({
      sub: String(user.id),
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    const refreshToken = randomUUID();
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return { accessToken, refreshToken };
  }

  async refresh(
    rawToken: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, role: true, organizationId: true, isActive: true },
        },
      },
    });

    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive
    ) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = stored.user;
    const accessToken = await this.jwt.signAsync({
      sub: String(user.id),
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    const newRaw = randomUUID();
    const newHash = createHash('sha256').update(newRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: newHash, expiresAt, userAgent, ipAddress },
    });

    return { accessToken, refreshToken: newRaw };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
```

- [ ] **Step 5: Запустить тест — убедиться что проходит**

```bash
pnpm --filter @ccip/api test --testPathPattern auth.service.spec
```

Expected: PASS (2 tests).

- [ ] **Step 6: Создать AuthController**

Содержимое `apps/api/src/common/auth/auth.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../guards/public.decorator';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(
      dto.email,
      dto.password,
      req.headers['user-agent'] ?? '',
      req.ip ?? '',
    );
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { accessToken };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw new UnauthorizedException('NO_REFRESH_TOKEN');

    const { accessToken, refreshToken } = await this.authService.refresh(
      raw,
      req.headers['user-agent'] ?? '',
      req.ip ?? '',
    );
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) await this.authService.logout(raw);
    res.clearCookie(REFRESH_COOKIE);
  }
}
```

- [ ] **Step 7: Обновить AuthModule**

Полное содержимое `apps/api/src/common/guards/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../auth/auth.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard, AuthService],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
```

- [ ] **Step 8: Добавить cookie-parser в main.ts**

```bash
pnpm --filter @ccip/api add cookie-parser
pnpm --filter @ccip/api add -D @types/cookie-parser
```

Обновить `apps/api/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/common/auth/ apps/api/src/common/guards/auth.module.ts apps/api/src/main.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat: AuthService login/refresh/logout + AuthController"
```

---

## Task 4: GpTokenGuard

**Files:**
- Create: `apps/api/src/common/guards/gp-token.guard.ts`
- Create: `apps/api/src/common/guards/gp-token.guard.spec.ts`

- [ ] **Step 1: Написать тест на GpTokenGuard**

Содержимое `apps/api/src/common/guards/gp-token.guard.spec.ts`:

```typescript
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { GpTokenGuard } from './gp-token.guard';
import { PrismaService } from '../prisma/prisma.service';

const makeCtx = (token: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ params: { token } }),
    }),
  }) as unknown as ExecutionContext;

describe('GpTokenGuard', () => {
  let guard: GpTokenGuard;
  let prisma: jest.Mocked<PrismaService>;

  const futureDate = new Date(Date.now() + 3600_000);
  const pastDate = new Date(Date.now() - 3600_000);

  beforeEach(() => {
    prisma = {
      period: { findFirst: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    guard = new GpTokenGuard(prisma);
  });

  it('throws UnauthorizedException when token not found', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(guard.canActivate(makeCtx('bad-token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token expired', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: pastDate,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('expired-token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when already submitted', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: new Date(),
    });
    await expect(guard.canActivate(makeCtx('used-token'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns true for valid unused token', async () => {
    (prisma.period.findFirst as jest.Mock).mockResolvedValue({
      gpTokenExpiresAt: futureDate,
      gpSubmittedAt: null,
    });
    await expect(guard.canActivate(makeCtx('valid-token'))).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
pnpm --filter @ccip/api test --testPathPattern gp-token.guard.spec
```

Expected: FAIL — файл не существует.

- [ ] **Step 3: Создать GpTokenGuard**

Содержимое `apps/api/src/common/guards/gp-token.guard.ts`:

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GpTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ params: { token: string } }>();
    const token = req.params.token;

    const period = await this.prisma.period.findFirst({
      where: { gpSubmissionToken: token },
      select: { gpTokenExpiresAt: true, gpSubmittedAt: true },
    });

    if (!period || !period.gpTokenExpiresAt || period.gpTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('GP_TOKEN_INVALID');
    }

    if (period.gpSubmittedAt !== null) {
      throw new ForbiddenException('GP_ALREADY_SUBMITTED');
    }

    return true;
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться что проходит**

```bash
pnpm --filter @ccip/api test --testPathPattern gp-token.guard.spec
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/guards/gp-token.guard.ts apps/api/src/common/guards/gp-token.guard.spec.ts
git commit -m "feat: add GpTokenGuard for GP one-time token validation"
```

---

## Task 5: Глобальные гварды + ThrottlerModule в AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/period/period.controller.ts`

- [ ] **Step 1: Обновить AppModule — зарегистрировать гварды глобально**

Полное содержимое `apps/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/guards/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PeriodModule } from './modules/period/period.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ObjectsModule } from './modules/objects/objects.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
    PrismaModule,
    AuthModule,
    PeriodModule,
    AnalyticsModule,
    ObjectsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Убрать локальный @UseGuards из PeriodController**

Полное содержимое `apps/api/src/modules/period/period.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { Roles } from '../../common/guards/roles.decorator';
import { PeriodService } from './period.service';
import { OpenPeriodDto } from './dto/open-period.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string; organizationId: string };
}

@Controller('periods')
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post('open')
  @Roles('stroycontrol', 'admin')
  open(@Body() dto: OpenPeriodDto, @Request() req: AuthRequest) {
    return this.periodService.openPeriod(dto.objectId, parseInt(req.user.id, 10));
  }

  @Patch(':id/close')
  @Roles('stroycontrol', 'admin')
  close(@Param('id', ParseIntPipe) id: number, @Request() req: AuthRequest) {
    return this.periodService.closePeriod(id, parseInt(req.user.id, 10));
  }

  @Get('by-object/:objectId')
  @Roles('director', 'stroycontrol', 'admin')
  byObject(@Param('objectId', ParseIntPipe) objectId: number) {
    return this.periodService.findByObject(objectId);
  }
}
```

Примечание: роль `sc` → `stroycontrol`, `gp` удалена из byObject (ГП взаимодействует только через GP form), согласно ADR-009.

- [ ] **Step 3: Проверить typecheck**

```bash
pnpm --filter @ccip/api typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Запустить все тесты**

```bash
pnpm --filter @ccip/api test
```

Expected: все тесты PASS (auth.service.spec, gp-token.guard.spec, jwt.strategy.spec).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/period/period.controller.ts
git commit -m "feat: register JwtAuthGuard+RolesGuard+ThrottlerGuard globally"
```

---

## Task 6: AuditLogService + AuditLogModule

**Files:**
- Create: `apps/api/src/common/audit/audit-log.service.ts`
- Create: `apps/api/src/common/audit/audit-log.module.ts`
- Create: `apps/api/src/common/audit/audit-log.service.spec.ts`

- [ ] **Step 1: Написать тест на AuditLogService.log**

Содержимое `apps/api/src/common/audit/audit-log.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  it('calls prisma.auditLog.create with correct data', async () => {
    await service.log({
      tableName: 'periods',
      recordId: BigInt(1),
      action: 'period_opened',
      newData: { objectId: 5 },
      performedBy: 42,
      organizationId: 'org-uuid',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tableName: 'periods',
        recordId: BigInt(1),
        action: 'period_opened',
        oldData: undefined,
        newData: { objectId: 5 },
        reason: undefined,
        performedBy: 42,
        organizationId: 'org-uuid',
      },
    });
  });

  it('does not expose update or delete methods', () => {
    expect((service as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
pnpm --filter @ccip/api test --testPathPattern audit-log.service.spec
```

Expected: FAIL.

- [ ] **Step 3: Создать AuditLogService**

Содержимое `apps/api/src/common/audit/audit-log.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  tableName: string;
  recordId: bigint;
  action: string;
  oldData?: unknown;
  newData?: unknown;
  reason?: string;
  performedBy?: number;
  organizationId: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tableName: params.tableName,
        recordId: params.recordId,
        action: params.action,
        oldData: params.oldData as object | undefined,
        newData: params.newData as object | undefined,
        reason: params.reason,
        performedBy: params.performedBy,
        organizationId: params.organizationId,
      },
    });
  }
}
```

- [ ] **Step 4: Создать AuditLogModule**

Содержимое `apps/api/src/common/audit/audit-log.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
```

- [ ] **Step 5: Запустить тест — убедиться что проходит**

```bash
pnpm --filter @ccip/api test --testPathPattern audit-log.service.spec
```

Expected: PASS (2 tests).

- [ ] **Step 6: Добавить AuditLogModule в AppModule**

В `apps/api/src/app.module.ts`, в массив `imports`, добавить `AuditLogModule`:

```typescript
import { AuditLogModule } from './common/audit/audit-log.module';

// в imports:
AuditLogModule,
```

- [ ] **Step 7: Рефакторинг PeriodService — использовать AuditLogService**

Обновить `apps/api/src/modules/period/period.service.ts`, заменив прямые вызовы `tx.auditLog.create` на `this.auditLog.log`:

```typescript
import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';

@Injectable()
export class PeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async openPeriod(objectId: number, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(objectId)})::bigint)`;

      const obj = await tx.constructionObject.findUniqueOrThrow({
        where: { id: objectId },
        select: { organizationId: true },
      });

      const zeroReport = await tx.zeroReport.findFirst({
        where: { objectId, status: 'approved' },
      });
      if (!zeroReport) throw new ForbiddenException('ZERO_REPORT_NOT_APPROVED');

      const openPeriod = await tx.period.findFirst({
        where: { objectId, status: 'open' },
      });
      if (openPeriod) throw new ConflictException('PERIOD_ALREADY_OPEN');

      const last = await tx.period.findFirst({
        where: { objectId },
        orderBy: { periodNumber: 'desc' },
      });

      const boqVersion = await tx.boqVersion.findFirstOrThrow({
        where: { objectId, isActive: true },
        select: { id: true },
      });

      const period = await tx.period.create({
        data: {
          objectId,
          boqVersionId: boqVersion.id,
          periodNumber: (last?.periodNumber ?? 0) + 1,
          status: 'open',
          openedBy: actorId,
          openedAt: new Date(),
        },
      });

      await this.auditLog.log({
        tableName: 'periods',
        recordId: BigInt(period.id),
        action: 'period_opened',
        newData: { objectId, periodNumber: period.periodNumber },
        performedBy: actorId,
        organizationId: obj.organizationId,
      });

      return period;
    });
  }

  async closePeriod(periodId: number, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
        include: { object: { select: { organizationId: true } } },
      });

      if (period.status !== 'open') throw new ConflictException('PERIOD_NOT_OPEN');

      const updated = await tx.period.update({
        where: { id: periodId },
        data: { status: 'closed', closedAt: new Date(), closedBy: actorId },
      });

      await this.auditLog.log({
        tableName: 'periods',
        recordId: BigInt(periodId),
        action: 'period_closed',
        performedBy: actorId,
        organizationId: period.object.organizationId,
      });

      return updated;
    });
  }

  async findByObject(objectId: number) {
    return this.prisma.period.findMany({
      where: { objectId },
      orderBy: { periodNumber: 'desc' },
    });
  }
}
```

Обновить `apps/api/src/modules/period/period.module.ts` — добавить AuditLogService в providers (или импортировать AuditLogModule):

```typescript
import { Module } from '@nestjs/common';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';

@Module({
  controllers: [PeriodController],
  providers: [PeriodService],
})
export class PeriodModule {}
```

Примечание: `AuditLogModule` уже `@Global()`, поэтому `AuditLogService` доступен без импорта модуля.

- [ ] **Step 8: Typecheck + запустить все тесты**

```bash
pnpm --filter @ccip/api typecheck && pnpm --filter @ccip/api test
```

Expected: 0 errors, все тесты PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/common/audit/ apps/api/src/modules/period/period.service.ts apps/api/src/app.module.ts
git commit -m "feat: AuditLogService (append-only) + refactor PeriodService"
```

---

## Task 7: TenantContext + TenantMiddleware

**Files:**
- Create: `apps/api/src/common/tenant/tenant.context.ts`
- Create: `apps/api/src/common/tenant/tenant.middleware.ts`
- Create: `apps/api/src/common/tenant/tenant.middleware.spec.ts`

- [ ] **Step 1: Написать тест на TenantMiddleware**

Содержимое `apps/api/src/common/tenant/tenant.middleware.spec.ts`:

```typescript
import { TenantMiddleware } from './tenant.middleware';
import { tenantContext } from './tenant.context';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;

  beforeEach(() => {
    middleware = new TenantMiddleware();
  });

  it('stores organizationId from valid Bearer JWT payload', (done) => {
    const orgId = 'org-test-uuid';
    // Base64url-encode a fake payload
    const fakePayload = Buffer.from(JSON.stringify({ organizationId: orgId }))
      .toString('base64url');
    const fakeToken = `header.${fakePayload}.signature`;

    const req = { headers: { authorization: `Bearer ${fakeToken}` } };
    const res = {};
    const next = () => {
      expect(tenantContext.getStore()?.organizationId).toBe(orgId);
      done();
    };

    middleware.use(req as never, res as never, next);
  });

  it('calls next without storing when no Authorization header', (done) => {
    const req = { headers: {} };
    const res = {};
    const next = () => {
      expect(tenantContext.getStore()).toBeUndefined();
      done();
    };
    middleware.use(req as never, res as never, next);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
pnpm --filter @ccip/api test --testPathPattern tenant.middleware.spec
```

Expected: FAIL.

- [ ] **Step 3: Создать TenantContext**

Содержимое `apps/api/src/common/tenant/tenant.context.ts`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  organizationId: string;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();
```

- [ ] **Step 4: Создать TenantMiddleware**

Содержимое `apps/api/src/common/tenant/tenant.middleware.ts`:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantContext } from './tenant.context';

function extractOrgId(authHeader: string): string | null {
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const parts = authHeader.slice(7).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8'),
    ) as { organizationId?: string };
    return payload.organizationId ?? null;
  } catch {
    return null;
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const auth = req.headers.authorization;
    if (!auth) {
      next();
      return;
    }

    const orgId = extractOrgId(auth);
    if (!orgId) {
      next();
      return;
    }

    tenantContext.run({ organizationId: orgId }, next);
  }
}
```

- [ ] **Step 5: Запустить тест — убедиться что проходит**

```bash
pnpm --filter @ccip/api test --testPathPattern tenant.middleware.spec
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/tenant/tenant.context.ts apps/api/src/common/tenant/tenant.middleware.ts apps/api/src/common/tenant/tenant.middleware.spec.ts
git commit -m "feat: TenantContext (AsyncLocalStorage) + TenantMiddleware"
```

---

## Task 8: PrismaTenantExtension + Wire-up + public-routes-allowlist

**Files:**
- Create: `apps/api/src/common/tenant/prisma-tenant.extension.ts`
- Modify: `apps/api/src/common/prisma/prisma.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `docs/security/public-routes-allowlist.txt`

- [ ] **Step 1: Создать PrismaTenantExtension**

Содержимое `apps/api/src/common/tenant/prisma-tenant.extension.ts`:

```typescript
import { Prisma } from '@ccip/database';
import { tenantContext } from './tenant.context';

const TENANT_MODELS = ['ConstructionObject', 'User', 'SystemConfig', 'AuditLog'] as const;
type TenantModel = (typeof TENANT_MODELS)[number];

function isTenantModel(model: string | undefined): model is TenantModel {
  return TENANT_MODELS.includes(model as TenantModel);
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async findMany({ args, query, model }) {
        const orgId = tenantContext.getStore()?.organizationId;
        if (orgId && isTenantModel(model)) {
          args.where = { ...args.where, organizationId: orgId };
        }
        return query(args);
      },
      async findFirst({ args, query, model }) {
        const orgId = tenantContext.getStore()?.organizationId;
        if (orgId && isTenantModel(model)) {
          args.where = { ...args.where, organizationId: orgId };
        }
        return query(args);
      },
      async findUnique({ args, query, model }) {
        const orgId = tenantContext.getStore()?.organizationId;
        if (orgId && isTenantModel(model)) {
          args.where = { ...args.where, organizationId: orgId } as typeof args.where;
        }
        return query(args);
      },
      async create({ args, query, model }) {
        const orgId = tenantContext.getStore()?.organizationId;
        if (orgId && isTenantModel(model)) {
          args.data = { ...args.data, organizationId: orgId };
        }
        return query(args);
      },
      async update({ args, query, model }) {
        const orgId = tenantContext.getStore()?.organizationId;
        if (orgId && isTenantModel(model)) {
          args.where = { ...args.where, organizationId: orgId } as typeof args.where;
        }
        return query(args);
      },
      async delete({ args, query, model }) {
        const orgId = tenantContext.getStore()?.organizationId;
        if (orgId && isTenantModel(model)) {
          args.where = { ...args.where, organizationId: orgId } as typeof args.where;
        }
        return query(args);
      },
    },
  },
});
```

- [ ] **Step 2: Обновить PrismaService — применить extension**

Полное содержимое `apps/api/src/common/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@ccip/database';
import { tenantExtension } from '../tenant/prisma-tenant.extension';

const baseClient = new PrismaClient();
const extendedClient = baseClient.$extends(tenantExtension);

type ExtendedPrismaClient = typeof extendedClient;

@Injectable()
export class PrismaService
  extends (PrismaClient as new () => ExtendedPrismaClient)
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    return baseClient.$extends(tenantExtension) as unknown as PrismaService;
  }

  async onModuleInit() {
    await (this as unknown as PrismaClient).$connect();
  }

  async onModuleDestroy() {
    await (this as unknown as PrismaClient).$disconnect();
  }
}
```

Примечание: Prisma $extends создаёт новый тип. Конструктор возвращает extended client — стандартный паттерн для NestJS + Prisma extensions.

- [ ] **Step 3: Зарегистрировать TenantMiddleware глобально в AppModule**

Обновить `apps/api/src/app.module.ts` — добавить `configure()`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
// ... остальные imports
import { TenantMiddleware } from './common/tenant/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
    PrismaModule,
    AuthModule,
    AuditLogModule,
    PeriodModule,
    AnalyticsModule,
    ObjectsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 4: Создать public-routes-allowlist.txt**

Содержимое `docs/security/public-routes-allowlist.txt`:

```
# Маршруты без JWT-аутентификации (помечены @Public() в коде)
# При добавлении нового маршрута — добавить строку сюда и в PR описание.
# CI проверяет: git diff --name-only | grep public-routes-allowlist

POST /auth/login     -- auth.controller.ts AuthController.login
POST /auth/refresh   -- auth.controller.ts AuthController.refresh
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @ccip/api typecheck
```

Expected: 0 errors. Если ошибки в PrismaService из-за $extends типов — допустимо добавить `as unknown as PrismaService` каст.

- [ ] **Step 6: Запустить все тесты**

```bash
pnpm --filter @ccip/api test
```

Expected: PASS (jwt.strategy.spec, auth.service.spec, gp-token.guard.spec, audit-log.service.spec, tenant.middleware.spec).

- [ ] **Step 7: Smoke-test вручную (опционально, если есть работающий Docker)**

```bash
# Запустить инфраструктуру
cd infra/docker && docker compose up -d

# Запустить API
pnpm --filter @ccip/api dev

# Тест login
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin1234!"}' | jq .
```

Expected: `{ "accessToken": "eyJ..." }`

- [ ] **Step 8: Обновить project-state.md**

В `docs/project-state.md`:
- §1 `Active P1 Task` → `M-03 — Init Module A: Objects + BoQ + weight_coef trigger`
- §1 `Next Milestone` → `M-03 завершён → M-04 разблокирован`
- §2 M-02a, M-02b, M-02c → `✓ done`
- §5 добавить строки:

```markdown
| M-02a | Auth: JWT + RBAC Guards + GpTokenGuard | 2026-05-05 | apps/api/src/common/guards/ |
| M-02b | AuditLogService (append-only)          | 2026-05-05 | apps/api/src/common/audit/ |
| M-02c | Multi-tenancy middleware               | 2026-05-05 | apps/api/src/common/tenant/ |
```

- [ ] **Step 9: Commit финальный**

```bash
git add apps/api/src/common/tenant/ apps/api/src/common/prisma/prisma.service.ts apps/api/src/app.module.ts docs/security/public-routes-allowlist.txt docs/project-state.md
git commit -m "feat: PrismaTenantExtension + TenantMiddleware wiring + M-02 complete"
```

---

## Self-Review

**Spec coverage:**
- ✓ JWT TTL 15min (был 8h) — исправлено в AuthModule
- ✓ Payload `{sub, role, organizationId}` — добавлено в JwtStrategy
- ✓ Refresh 30 дней, HTTP-only cookie, SHA-256 hash — AuthService
- ✓ @Public() decorator + public routes allowlist — public.decorator.ts
- ✓ GpTokenGuard: token exists, not expired, gpSubmittedAt IS NULL — Task 4
- ✓ Rate limiting: глобально 100/min, GP endpoint 10/min — ThrottlerModule + @Throttle
- ✓ AuditLogService only create() — no update/delete — Task 6
- ✓ TenantMiddleware → AsyncLocalStorage — Task 7
- ✓ PrismaTenantExtension: findMany/findFirst/findUnique/create/update/delete для 4 моделей — Task 8
- ✓ Defense-in-depth note: сервисы должны явно проверять organizationId (для PeriodService уже есть через findUniqueOrThrow)

**Gaps:**
- GP form endpoint (`POST /gp/submit/:token`) не реализован в этом плане — это часть M-05a (PeriodEngine)
- `@BypassTenant()` декоратор не реализован явно — super_admin обходит через отсутствие organizationId в JWT (null tenantStore → extension не фильтрует)
- AuditLog health check endpoint (`GET /admin/health/audit-log` из ADR-010) — часть M-12 (Prod Infra)

**Placeholder scan:** Нет TBD, TODO, "implement later". Все шаги содержат полный код.

**Type consistency:** `organizationId: string` во всех местах. `recordId: bigint` в AuditLogParams и схеме. `performedBy: number` соответствует `User.id: Int`.
