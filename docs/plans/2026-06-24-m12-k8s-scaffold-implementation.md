# M-12: Prod Infra / K8s Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать `infra/k8s/` (Kustomize base+overlays) для всех сервисов CCIP, добавить недостающий `/health` эндпоинт и Dockerfiles для `api`/`web`, подключить Vault для секретов, и проверить ADR-005 SLA-worker инварианты (`replicas:1`/`Recreate`, recovery scan) реальным запуском на локальном `kind`-кластере.

**Architecture:** Один образ для `api` и `sla-worker`, различаются `ROLE` env + replica/strategy в манифесте (существующий гейт в `dispute-sla.module.ts` уже изолирует BullMQ-консьюмер). Секреты — через Vault dev-server + Agent Injector sidecar, рендеренный один раз через `helm template` и закоммиченный как статичный YAML (без Helm в runtime). Kustomize `base/` + `overlays/{dev,staging,prod}`, `staging`/`prod` — заглушки.

**Tech Stack:** NestJS / Docker / Kustomize / kind / Vault (Kubernetes auth method + Agent Injector) / ingress-nginx / cert-manager (self-signed для kind)

**Спека:** `docs/plans/specs/2026-06-24-m12-k8s-scaffold-design.md`

---

## Предусловия (проверено на этой сессии)

- `docker`, `kubectl` — установлены. `kind`, `helm` — **не установлены**, ставятся в Task 0.
- `apps/api` и `apps/web` **не имеют Dockerfile вообще** — текущий dev-стек запускает их вне Docker (`pnpm dev` на хосте); `docker-compose.yml` поднимает только `postgres`/`pgbouncer`/`redis`/`minio`/`mailhog`. Dockerfiles создаются в Task 4-5.
- `apps/api/src/app.module.ts` настраивает `BullModule` без `password` для Redis, хотя `docker-compose.yml` Redis требует `--requirepass`. Это значит BullMQ-подключение к Redis **не аутентифицируется** уже сегодня (молча работает, потому что `ROLE=worker` никогда не запускался вживую — см. спеку §6). Чинится в Task 2.
- `.npmrc` имеет `shamefully-hoist=false` — любой новый прямой импорт пакета (`ioredis`, `@nestjs/terminus`) ДОЛЖЕН быть явно добавлен в `apps/api/package.json`, транзитивные зависимости не резолвятся.
- Turborepo (`turbo.json`) уже настроен — для Docker-сборки используется канонический паттерн `turbo prune`.

---

## Task 0: Установить kind и helm локально

**Files:** нет (установка инструментов)

- [ ] **Step 1: Установить `kind` (Windows, через Chocolatey или прямой бинарь)**

```bash
curl.exe -Lo kind-windows-amd64.exe https://kind.sigs.k8s.io/dl/v0.23.0/kind-windows-amd64.exe
mkdir -p "$HOME/bin"
mv kind-windows-amd64.exe "$HOME/bin/kind.exe"
export PATH="$HOME/bin:$PATH"
kind version
```

Ожидание: `kind v0.23.0 ...`. Если `$HOME/bin` не в `PATH` постоянно — добавить в профиль shell (`~/.bashrc` для Git Bash).

- [ ] **Step 2: Установить `helm`**

```bash
curl.exe -Lo helm.zip https://get.helm.sh/helm-v3.15.3-windows-amd64.zip
unzip helm.zip
mv windows-amd64/helm.exe "$HOME/bin/helm.exe"
helm version --short
```

Ожидание: `v3.15.3+...`.

- [ ] **Step 3: Проверить docker и kubectl уже работают**

```bash
docker version
kubectl version --client
```

Ожидание: оба выводят версию без ошибок (уже подтверждено в этой сессии).

---

## Task 1: HealthModule — TDD (liveness лёгкий, readiness checkBoth)

**Files:**
- Create: `apps/api/src/modules/health/health.module.ts`
- Create: `apps/api/src/modules/health/health.controller.ts`
- Create: `apps/api/src/modules/health/health.service.ts`
- Test: `apps/api/src/modules/health/__tests__/health.service.spec.ts`
- Test: `apps/api/src/modules/health/__tests__/health.controller.spec.ts`
- Modify: `apps/api/package.json` (добавить `@nestjs/terminus`, `ioredis`)

- [ ] **Step 1: Добавить зависимости**

В `apps/api/package.json`, в блок `"dependencies"` (рядом с `"@nestjs/config"`), добавить:

```json
    "@nestjs/terminus": "^11.0.2",
    "ioredis": "^5.4.1",
```

Запустить:

```bash
pnpm install
```

Ожидание: lockfile обновлён, без ошибок.

- [ ] **Step 2: Написать падающий тест для `HealthService.checkReady()`**

```typescript
// apps/api/src/modules/health/__tests__/health.service.spec.ts
import { HealthService } from '../health.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let redisInstance: { ping: jest.Mock; disconnect: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redisInstance = { ping: jest.fn().mockResolvedValue('PONG'), disconnect: jest.fn() };
    (Redis as unknown as jest.Mock).mockImplementation(() => redisInstance);

    service = new HealthService(prisma as unknown as PrismaService, {
      get: (key: string, def?: unknown) =>
        ({ REDIS_HOST: 'localhost', REDIS_PORT: 6379, REDIS_PASSWORD: 'test-pass' }[key] ?? def),
    } as never);
  });

  it('checkLive() resolves without touching Postgres or Redis', async () => {
    await service.checkLive();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redisInstance.ping).not.toHaveBeenCalled();
  });

  it('checkReady() resolves when both Postgres and Redis respond', async () => {
    await expect(service.checkReady()).resolves.toEqual({ postgres: true, redis: true });
  });

  it('checkReady() rejects when Postgres query throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(service.checkReady()).rejects.toThrow('connection refused');
  });

  it('checkReady() rejects when Redis ping throws', async () => {
    redisInstance.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.checkReady()).rejects.toThrow('ECONNREFUSED');
  });
});
```

- [ ] **Step 3: Запустить тест, убедиться что падает**

```bash
pnpm --filter @ccip/api exec npx jest --testPathPatterns="health.service.spec" --no-coverage
```

Ожидание: FAIL — `Cannot find module '../health.service'`.

- [ ] **Step 4: Реализовать `HealthService`**

```typescript
// apps/api/src/modules/health/health.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Лёгкая самопроверка — НЕ обращается к Postgres/Redis.
  // Отклонение от буквального ADR-005 ("checkBoth для обеих проб") — см.
  // docs/plans/specs/2026-06-24-m12-k8s-scaffold-design.md §6/§11: checkBoth()
  // на liveness заставил бы kubelet убивать sla-worker при транзиентном сбое БД.
  async checkLive(): Promise<{ alive: true }> {
    return { alive: true };
  }

  async checkReady(): Promise<{ postgres: boolean; redis: boolean }> {
    await this.prisma.$queryRaw`SELECT 1`;

    const redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await redis.connect();
      await redis.ping();
    } finally {
      redis.disconnect();
    }

    return { postgres: true, redis: true };
  }
}
```

- [ ] **Step 5: Запустить тест, убедиться что проходит**

```bash
pnpm --filter @ccip/api exec npx jest --testPathPatterns="health.service.spec" --no-coverage
```

Ожидание: `4 passed`.

- [ ] **Step 6: Написать падающий тест для `HealthController`**

```typescript
// apps/api/src/modules/health/__tests__/health.controller.spec.ts
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let service: jest.Mocked<HealthService>;

  beforeEach(() => {
    service = {
      checkLive: jest.fn().mockResolvedValue({ alive: true }),
      checkReady: jest.fn().mockResolvedValue({ postgres: true, redis: true }),
    } as unknown as jest.Mocked<HealthService>;
    controller = new HealthController(service);
  });

  it('live() returns 200 payload', async () => {
    await expect(controller.live()).resolves.toEqual({ alive: true });
  });

  it('ready() returns payload when checkReady resolves', async () => {
    await expect(controller.ready()).resolves.toEqual({ postgres: true, redis: true });
  });

  it('ready() throws ServiceUnavailableException when checkReady rejects', async () => {
    service.checkReady.mockRejectedValue(new Error('redis down'));
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});
```

- [ ] **Step 7: Запустить, убедиться что падает**

```bash
pnpm --filter @ccip/api exec npx jest --testPathPatterns="health.controller.spec" --no-coverage
```

Ожидание: FAIL — `Cannot find module '../health.controller'`.

- [ ] **Step 8: Реализовать `HealthController` + `HealthModule`**

```typescript
// apps/api/src/modules/health/health.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '../../common/guards/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('live')
  async live() {
    return this.health.checkLive();
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      return await this.health.checkReady();
    } catch (err) {
      throw new ServiceUnavailableException((err as Error).message);
    }
  }
}
```

```typescript
// apps/api/src/modules/health/health.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
```

- [ ] **Step 9: Запустить оба теста**

```bash
pnpm --filter @ccip/api exec npx jest --testPathPatterns="health" --no-coverage
```

Ожидание: `7 passed` (4 service + 3 controller).

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/modules/health
git commit -m "feat(health): add /health/live and /health/ready endpoints (ADR-005 probe split)"
```

---

## Task 2: Wire HealthModule в AppModule, exclude TenantMiddleware, исправить Redis password

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Импортировать `HealthModule`, исправить Redis password в `BullModule`**

Найти в `apps/api/src/app.module.ts`:

```typescript
import { DisputeSlaModule } from './modules/dispute-sla/dispute-sla.module';
```

Заменить на:

```typescript
import { DisputeSlaModule } from './modules/dispute-sla/dispute-sla.module';
import { HealthModule } from './modules/health/health.module';
```

Найти:

```typescript
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
```

Заменить на (добавлен `password` — без него BullMQ не аутентифицируется против Redis с `--requirepass`, что сегодня молча "работает" только потому что `ROLE=worker` никогда не запускался вживую):

```typescript
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
```

Найти:

```typescript
    DocumentsModule,
    ZeroReportModule,
    DisputeSlaModule,
  ],
```

Заменить на:

```typescript
    DocumentsModule,
    ZeroReportModule,
    DisputeSlaModule,
    HealthModule,
  ],
```

- [ ] **Step 2: Исключить `/health` из `TenantMiddleware`**

Найти:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

Заменить на:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude('health/(.*)')
      .forRoutes('*');
  }
}
```

- [ ] **Step 3: TypeScript compile check**

```bash
pnpm --filter @ccip/api exec tsc --noEmit
```

Ожидание: no errors.

- [ ] **Step 4: Поднять только Postgres+Redis из docker-compose и проверить эндпоинты вручную**

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
cd apps/api
REDIS_PASSWORD=ccip_redis_dev DATABASE_URL="postgres://ccip_owner:ccip_dev_pass@localhost:5432/ccip" JWT_SECRET=local-dev-secret pnpm dev &
sleep 5
curl -s http://localhost:3000/health/live
curl -s http://localhost:3000/health/ready
kill %1
```

Ожидание: `{"alive":true}` и `{"postgres":true,"redis":true}`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "fix(api): wire HealthModule, exclude /health from TenantMiddleware, pass Redis password to BullMQ"
```

---

## Task 3: Регрессионный тест на существующий ROLE=worker гейт

**Files:**
- Test: `apps/api/src/modules/dispute-sla/__tests__/dispute-sla.module.spec.ts`

> Контекст: `dispute-sla.module.ts` уже содержит `const workerProviders = process.env.ROLE === 'worker' ? [DisputeSlaWorker] : []`, но это поведение никогда не было закреплено тестом — найдено при ресёрче M-12 (см. спеку §6). Закрепляем явным тестом перед тем, как на это поведение начинает полагаться K8s-манифест.

- [ ] **Step 1: Написать тест**

```typescript
// apps/api/src/modules/dispute-sla/__tests__/dispute-sla.module.spec.ts
import { Test } from '@nestjs/testing';
import { BullModule } from '@nestjs/bull';
import { getQueueToken } from '@nestjs/bull';
import { DisputeSlaModule } from '../dispute-sla.module';
import { DisputeSlaWorker } from '../dispute-sla.worker';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('DisputeSlaModule — ROLE gate', () => {
  const originalRole = process.env.ROLE;

  afterEach(() => {
    process.env.ROLE = originalRole;
    jest.resetModules();
  });

  async function buildModule() {
    // Изоляция require-кеша: workerProviders читает process.env.ROLE на момент import.
    jest.resetModules();
    const { DisputeSlaModule: FreshModule } = await import('../dispute-sla.module');
    return Test.createTestingModule({
      imports: [
        BullModule.registerQueue({ name: 'sla' }),
        FreshModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(getQueueToken('sla'))
      .useValue({ add: jest.fn() })
      .compile();
  }

  it('does NOT provide DisputeSlaWorker when ROLE is unset (api role)', async () => {
    delete process.env.ROLE;
    const moduleRef = await buildModule();
    expect(() => moduleRef.get(DisputeSlaWorker)).toThrow();
  });

  it('provides DisputeSlaWorker when ROLE=worker', async () => {
    process.env.ROLE = 'worker';
    const moduleRef = await buildModule();
    expect(moduleRef.get(DisputeSlaWorker)).toBeInstanceOf(DisputeSlaWorker);
  });
});
```

- [ ] **Step 2: Запустить тест**

```bash
pnpm --filter @ccip/api exec npx jest --testPathPatterns="dispute-sla.module.spec" --no-coverage
```

Ожидание: `2 passed`. Если `DisputeSlaWorker` тянет зависимости, которых нет в тестовом модуле (например, `AuditLogService`) — добавить `.overrideProvider(...).useValue({})` для каждой недостающей по сообщению ошибки Nest (`Nest can't resolve dependencies of the DisputeSlaWorker (?). Please make sure that the argument XxxService at index [N] is available`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/dispute-sla/__tests__/dispute-sla.module.spec.ts
git commit -m "test(dispute-sla): lock ROLE=worker gate behavior with regression test"
```

---

## Task 4: `apps/api/Dockerfile` (Turborepo prune pattern)

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/api/entrypoint.sh`
- Create: `.dockerignore` (repo root)

- [ ] **Step 1: Создать `.dockerignore` в корне репозитория**

```
# .dockerignore
node_modules
**/node_modules
**/dist
**/.turbo
**/coverage
.git
docs
infra/k8s
```

- [ ] **Step 2: Создать `apps/api/entrypoint.sh` — Vault secret sourcing shim**

```sh
#!/bin/sh
set -e

# Vault Agent Injector рендерит /vault/secrets/db в формате KEY=VALUE
# (см. docs/plans/specs/2026-06-24-m12-k8s-scaffold-design.md §5).
# Если файла нет (локальный docker-compose / dev без Vault) — пропускаем молча.
if [ -f /vault/secrets/db ]; then
  set -a
  . /vault/secrets/db
  set +a
fi

exec "$@"
```

- [ ] **Step 3: Создать `apps/api/Dockerfile`**

```dockerfile
# apps/api/Dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @ccip/api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @ccip/database run db:generate
RUN pnpm --filter @ccip/api run build

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
RUN addgroup -S ccip && adduser -S ccip -G ccip
COPY --from=installer /app .
COPY apps/api/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
USER ccip
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
```

- [ ] **Step 4: Собрать образ локально и проверить, что контейнер стартует**

```bash
docker build -f apps/api/Dockerfile -t ccip-api:local .
docker run --rm -e JWT_SECRET=test-secret -e DATABASE_URL="postgres://x:x@localhost:5432/x" -e ROLE=api -p 3000:3000 ccip-api:local &
sleep 5
curl -s http://localhost:3000/health/live
docker stop $(docker ps -q --filter ancestor=ccip-api:local) 2>&1 || true
```

Ожидание: `{"alive":true}` (live-проба не трогает Postgres/Redis, поэтому стартует даже без реальной БД — readiness ожидаемо вернёт 503, это нормально для smoke-теста образа).

- [ ] **Step 5: Commit**

```bash
git add .dockerignore apps/api/Dockerfile apps/api/entrypoint.sh
git commit -m "feat(infra): add apps/api Dockerfile (turbo prune multi-stage) + Vault entrypoint shim"
```

---

## Task 5: `apps/web/Dockerfile`

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/web/nginx.conf`

- [ ] **Step 1: Создать `apps/web/nginx.conf`**

```nginx
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location = /health/live {
    return 200 '{"alive":true}';
    add_header Content-Type application/json;
  }
}
```

- [ ] **Step 2: Создать `apps/web/Dockerfile`**

```dockerfile
# apps/web/Dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @ccip/web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @ccip/web run build

FROM nginx:1.27-alpine AS runner
COPY --from=installer /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
```

- [ ] **Step 3: Собрать образ и проверить**

```bash
docker build -f apps/web/Dockerfile -t ccip-web:local .
docker run --rm -p 8080:8080 ccip-web:local &
sleep 3
curl -s http://localhost:8080/health/live
docker stop $(docker ps -q --filter ancestor=ccip-web:local) 2>&1 || true
```

Ожидание: `{"alive":true}`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/Dockerfile apps/web/nginx.conf
git commit -m "feat(infra): add apps/web Dockerfile (turbo prune + nginx static serve)"
```

---

## Task 6: K8s base — namespace + Postgres StatefulSet

**Files:**
- Create: `infra/k8s/base/namespace.yaml`
- Create: `infra/k8s/base/postgres/statefulset.yaml`
- Create: `infra/k8s/base/postgres/service.yaml`
- Create: `infra/k8s/base/postgres/kustomization.yaml`

- [ ] **Step 1: Namespace**

```yaml
# infra/k8s/base/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ccip
```

- [ ] **Step 2: Postgres StatefulSet**

```yaml
# infra/k8s/base/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: ccip
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: ccip-postgres:local
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: ccip
            - name: POSTGRES_USER
              value: ccip_owner
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: ccip-bootstrap-secrets
                  key: postgres-password
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "ccip_owner", "-d", "ccip"]
            initialDelaySeconds: 5
            periodSeconds: 5
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: standard
        resources:
          requests:
            storage: 2Gi
```

> Примечание: `ccip-bootstrap-secrets` (POSTGRES_PASSWORD) — это bootstrap-секрет, нужный ДО того, как Vault может что-либо инжектить (Postgres сам ещё не существует, чтобы Vault мог в него ходить). Создаётся в Task 9 вместе с Vault-сидированием как plain K8s Secret — единственное оправданное исключение из "только Vault" для самого первого пароля БД.

- [ ] **Step 3: Service**

```yaml
# infra/k8s/base/postgres/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: ccip
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  clusterIP: None
```

- [ ] **Step 4: kustomization.yaml для этой группы**

```yaml
# infra/k8s/base/postgres/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - statefulset.yaml
  - service.yaml
```

- [ ] **Step 5: Validate YAML синтаксис**

```bash
kubectl kustomize infra/k8s/base/postgres > /dev/null
```

Ожидание: команда завершается без ошибок (кластер ещё не нужен — `kustomize` не обращается к API серверу).

- [ ] **Step 6: Commit**

```bash
git add infra/k8s/base/namespace.yaml infra/k8s/base/postgres
git commit -m "feat(infra): K8s base — namespace + Postgres StatefulSet"
```

---

## Task 7: K8s base — PgBouncer

**Files:**
- Create: `infra/k8s/base/pgbouncer/deployment.yaml`
- Create: `infra/k8s/base/pgbouncer/service.yaml`
- Create: `infra/k8s/base/pgbouncer/kustomization.yaml`

- [ ] **Step 1: Deployment (ADR-001 — `pool_mode=session`)**

```yaml
# infra/k8s/base/pgbouncer/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgbouncer
  namespace: ccip
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pgbouncer
  template:
    metadata:
      labels:
        app: pgbouncer
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "ccip-pgbouncer"
        vault.hashicorp.com/agent-inject-secret-db: "secret/data/ccip/pgbouncer/database"
        vault.hashicorp.com/agent-inject-template-db: |
          {{- with secret "secret/data/ccip/pgbouncer/database" -}}
          DATABASE_URL=postgres://{{ .Data.data.user }}:{{ .Data.data.password }}@postgres:5432/{{ .Data.data.dbname }}
          {{- end }}
    spec:
      serviceAccountName: ccip-pgbouncer
      containers:
        - name: pgbouncer
          image: edoburu/pgbouncer:1.23.1
          ports:
            - containerPort: 5432
          command: ["/bin/sh", "-c"]
          args:
            - "set -a; . /vault/secrets/db; set +a; exec /entrypoint.sh"
          env:
            - name: POOL_MODE
              value: session
            - name: MAX_CLIENT_CONN
              value: "200"
            - name: DEFAULT_POOL_SIZE
              value: "20"
            - name: AUTH_TYPE
              value: scram-sha-256
```

- [ ] **Step 2: ServiceAccount + Service**

```yaml
# infra/k8s/base/pgbouncer/service.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ccip-pgbouncer
  namespace: ccip
---
apiVersion: v1
kind: Service
metadata:
  name: pgbouncer
  namespace: ccip
spec:
  selector:
    app: pgbouncer
  ports:
    - port: 6432
      targetPort: 5432
```

- [ ] **Step 3: kustomization.yaml**

```yaml
# infra/k8s/base/pgbouncer/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

- [ ] **Step 4: Validate**

```bash
kubectl kustomize infra/k8s/base/pgbouncer > /dev/null
```

Ожидание: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add infra/k8s/base/pgbouncer
git commit -m "feat(infra): K8s base — PgBouncer Deployment (session pool_mode, ADR-001)"
```

---

## Task 8: K8s base — Redis StatefulSet (AOF)

**Files:**
- Create: `infra/k8s/base/redis/statefulset.yaml`
- Create: `infra/k8s/base/redis/service.yaml`
- Create: `infra/k8s/base/redis/kustomization.yaml`

- [ ] **Step 1: StatefulSet**

```yaml
# infra/k8s/base/redis/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: ccip
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          env:
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: ccip-bootstrap-secrets
                  key: redis-password
          command: ["/bin/sh", "-c"]
          args:
            - "redis-server --appendonly yes --appendfsync everysec --requirepass \"$REDIS_PASSWORD\""
          volumeMounts:
            - name: redis-data
              mountPath: /data
          readinessProbe:
            exec:
              command: ["sh", "-c", "redis-cli -a \"$REDIS_PASSWORD\" ping"]
            initialDelaySeconds: 5
            periodSeconds: 5
  volumeClaimTemplates:
    - metadata:
        name: redis-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: standard
        resources:
          requests:
            storage: 1Gi
```

> Примечание: Redis-пароль здесь тоже идёт из `ccip-bootstrap-secrets` (plain K8s Secret), не Vault — тот же bootstrap-аргумент, что у Postgres в Task 6. `api`/`sla-worker` получают этот же пароль уже через Vault (Task 11/12), но сам Redis-сервер должен знать пароль до того, как Vault что-либо инжектит в его под — Vault не управляет тем, ЧТО проверяет `--requirepass` внутри самого Redis-процесса на этом этапе scaffold'а.

- [ ] **Step 2: Service**

```yaml
# infra/k8s/base/redis/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: ccip
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
  clusterIP: None
```

- [ ] **Step 3: kustomization.yaml**

```yaml
# infra/k8s/base/redis/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - statefulset.yaml
  - service.yaml
```

- [ ] **Step 4: Validate**

```bash
kubectl kustomize infra/k8s/base/redis > /dev/null
```

- [ ] **Step 5: Commit**

```bash
git add infra/k8s/base/redis
git commit -m "feat(infra): K8s base — Redis StatefulSet with AOF (ADR-005)"
```

---

## Task 9: K8s base — bootstrap secrets + Vault dev-server + injector (vendored manifests)

**Files:**
- Create: `infra/k8s/base/bootstrap-secrets.yaml` (шаблон, реальные значения — в Task 16 script)
- Create: `infra/k8s/base/vault/namespace.yaml`
- Create: `infra/k8s/base/vault/rendered/.gitkeep`
- Create: `infra/k8s/base/vault/kustomization.yaml`
- Create: `infra/k8s/scripts/render-vault-manifests.sh`

- [ ] **Step 1: Bootstrap secrets — шаблон без реальных значений**

```yaml
# infra/k8s/base/bootstrap-secrets.yaml
# Bootstrap-секреты (postgres/redis пароли), нужные ДО того, как Vault может
# что-либо инжектить — см. примечание в Task 6/8. Реальные значения подставляет
# infra/k8s/scripts/kind-up.sh через `kubectl create secret --dry-run=client | kubectl apply`,
# этот файл — только маркер namespace + имени для kustomize.
apiVersion: v1
kind: Secret
metadata:
  name: ccip-bootstrap-secrets
  namespace: ccip
type: Opaque
stringData:
  postgres-password: "CHANGEME-overridden-by-kind-up.sh"
  redis-password: "CHANGEME-overridden-by-kind-up.sh"
```

- [ ] **Step 2: Vault namespace**

```yaml
# infra/k8s/base/vault/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vault
```

- [ ] **Step 3: Скрипт рендеринга Vault-манифестов через Helm (запускается один раз руками, результат коммитится)**

```bash
#!/bin/sh
# infra/k8s/scripts/render-vault-manifests.sh
# Запускается ОДИН РАЗ локально автором плана/ревьюером, не частью kind-up.sh.
# Helm используется только как генератор — итоговый YAML коммитится и применяется
# через kubectl/kustomize, без Helm в runtime (см. спеку §5/§11).
set -e

helm repo add hashicorp https://helm.releases.hashicorp.com
helm repo update

helm template vault hashicorp/vault \
  --namespace vault \
  --set "injector.enabled=true" \
  --set "server.dev.enabled=true" \
  --set "server.dev.devRootToken=ccip-dev-root-token" \
  --set "server.dataStorage.enabled=false" \
  --set "server.standalone.enabled=true" \
  > infra/k8s/base/vault/rendered/vault-helm.yaml

echo "Rendered $(wc -l < infra/k8s/base/vault/rendered/vault-helm.yaml) lines to infra/k8s/base/vault/rendered/vault-helm.yaml"
```

- [ ] **Step 4: Запустить рендеринг**

```bash
chmod +x infra/k8s/scripts/render-vault-manifests.sh
mkdir -p infra/k8s/base/vault/rendered
touch infra/k8s/base/vault/rendered/.gitkeep
./infra/k8s/scripts/render-vault-manifests.sh
```

Ожидание: файл `infra/k8s/base/vault/rendered/vault-helm.yaml` создан, непустой (обычно 300-600 строк — StatefulSet, injector Deployment, MutatingWebhookConfiguration, RBAC, cert-gen Job).

- [ ] **Step 5: kustomization.yaml для группы vault**

```yaml
# infra/k8s/base/vault/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - rendered/vault-helm.yaml
```

- [ ] **Step 6: Validate**

```bash
kubectl kustomize infra/k8s/base/vault > /dev/null
```

Ожидание: без ошибок. Если `kubectl kustomize` жалуется на дублирующиеся `Namespace vault` (рендеренный chart иногда сам создаёт namespace) — убрать `namespace.yaml` из ресурсов и оставить только тот, что в `rendered/vault-helm.yaml`.

- [ ] **Step 7: Commit**

```bash
git add infra/k8s/base/bootstrap-secrets.yaml infra/k8s/base/vault infra/k8s/scripts/render-vault-manifests.sh
git commit -m "feat(infra): vendor Vault dev-server + Agent Injector manifests (helm template, no runtime Helm)"
```

---

## Task 10: K8s base — Vault seed script (policies, roles, secrets)

**Files:**
- Create: `infra/k8s/scripts/vault-seed.sh`

- [ ] **Step 1: Написать скрипт**

```bash
#!/bin/sh
# infra/k8s/scripts/vault-seed.sh
# Запускается после того, как vault-0 в namespace vault перешёл в Ready.
# Дев-режим Vault — auto-unseal, root token = ccip-dev-root-token (см. Task 9 Step 3).
set -e

VEXEC="kubectl exec -n vault vault-0 --"
export VAULT_TOKEN=ccip-dev-root-token

echo "Enabling kubernetes auth method..."
$VEXEC vault auth enable kubernetes 2>&1 | grep -v "already enabled" || true

$VEXEC vault write auth/kubernetes/config \
  kubernetes_host="https://\$KUBERNETES_SERVICE_HOST:\$KUBERNETES_SERVICE_PORT"

echo "Writing policies..."
$VEXEC sh -c 'cat <<'"'"'EOF'"'"' | vault policy write ccip-api -
path "secret/data/ccip/api/*" { capabilities = ["read"] }
EOF'

$VEXEC sh -c 'cat <<'"'"'EOF'"'"' | vault policy write ccip-worker -
path "secret/data/ccip/worker/*" { capabilities = ["read"] }
EOF'

$VEXEC sh -c 'cat <<'"'"'EOF'"'"' | vault policy write ccip-pgbouncer -
path "secret/data/ccip/pgbouncer/*" { capabilities = ["read"] }
EOF'

echo "Binding K8s ServiceAccounts to Vault roles..."
$VEXEC vault write auth/kubernetes/role/ccip-api \
  bound_service_account_names=ccip-api \
  bound_service_account_namespaces=ccip \
  policies=ccip-api ttl=1h

$VEXEC vault write auth/kubernetes/role/ccip-worker \
  bound_service_account_names=ccip-sla-worker \
  bound_service_account_namespaces=ccip \
  policies=ccip-worker ttl=1h

$VEXEC vault write auth/kubernetes/role/ccip-pgbouncer \
  bound_service_account_names=ccip-pgbouncer \
  bound_service_account_namespaces=ccip \
  policies=ccip-pgbouncer ttl=1h

echo "Generating + writing secret material..."
PG_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
MINIO_PASS=$(openssl rand -hex 16)

$VEXEC vault kv put secret/ccip/api/database \
  user=ccip_owner password="$PG_PASS" dbname=ccip
$VEXEC vault kv put secret/ccip/api/jwt secret="$JWT_SECRET"
$VEXEC vault kv put secret/ccip/worker/database \
  user=ccip_owner password="$PG_PASS" dbname=ccip
$VEXEC vault kv put secret/ccip/worker/jwt secret="$JWT_SECRET"
$VEXEC vault kv put secret/ccip/pgbouncer/database \
  user=ccip_owner password="$PG_PASS" dbname=ccip

echo "Vault seed complete. Postgres bootstrap secret must match \$PG_PASS — see kind-up.sh."
echo "PG_PASS=$PG_PASS" > /tmp/ccip-vault-seed-output.env
echo "JWT_SECRET=$JWT_SECRET" >> /tmp/ccip-vault-seed-output.env
echo "MINIO_PASS=$MINIO_PASS" >> /tmp/ccip-vault-seed-output.env
```

> Примечание: скрипт пишет сгенерированный `PG_PASS` во временный файл — `kind-up.sh` (Task 16) читает его оттуда, чтобы создать `ccip-bootstrap-secrets` (Task 9) с ТЕМ ЖЕ паролем, которым Postgres реально стартует, и который Vault отдаёт `api`/`worker`/`pgbouncer`. Это единственный момент ручной синхронизации между bootstrap-секретом и Vault — задокументирован явно, не магия.

- [ ] **Step 2: chmod + statically lint with shellcheck (если доступен), иначе просто bash -n**

```bash
chmod +x infra/k8s/scripts/vault-seed.sh
bash -n infra/k8s/scripts/vault-seed.sh
```

Ожидание: без вывода (синтаксически валиден).

- [ ] **Step 3: Commit**

```bash
git add infra/k8s/scripts/vault-seed.sh
git commit -m "feat(infra): Vault seed script — kubernetes auth, policies, roles, generated secrets"
```

---

## Task 11: K8s base — API Deployment (rolling + HPA)

**Files:**
- Create: `infra/k8s/base/api/deployment.yaml`
- Create: `infra/k8s/base/api/service.yaml`
- Create: `infra/k8s/base/api/hpa.yaml`
- Create: `infra/k8s/base/api/kustomization.yaml`

- [ ] **Step 1: Deployment**

```yaml
# infra/k8s/base/api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: ccip
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "ccip-api"
        vault.hashicorp.com/agent-inject-secret-db: "secret/data/ccip/api/database"
        vault.hashicorp.com/agent-inject-template-db: |
          {{- with secret "secret/data/ccip/api/database" -}}
          DATABASE_URL=postgres://{{ .Data.data.user }}:{{ .Data.data.password }}@pgbouncer:6432/{{ .Data.data.dbname }}
          REDIS_PASSWORD={{ .Data.data.password }}
          {{- end }}
        vault.hashicorp.com/agent-inject-secret-jwt: "secret/data/ccip/api/jwt"
        vault.hashicorp.com/agent-inject-template-jwt: |
          {{- with secret "secret/data/ccip/api/jwt" -}}
          JWT_SECRET={{ .Data.data.secret }}
          {{- end }}
    spec:
      serviceAccountName: ccip-api
      containers:
        - name: api
          image: ccip-api:local
          imagePullPolicy: IfNotPresent
          command: ["/app/entrypoint.sh"]
          args: ["node", "apps/api/dist/main.js"]
          ports:
            - containerPort: 3000
          env:
            - name: ROLE
              value: api
            - name: REDIS_HOST
              value: redis
            - name: REDIS_PORT
              value: "6379"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
```

- [ ] **Step 2: ServiceAccount + Service**

```yaml
# infra/k8s/base/api/service.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ccip-api
  namespace: ccip
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: ccip
spec:
  selector:
    app: api
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 3: HPA**

```yaml
# infra/k8s/base/api/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: ccip
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

- [ ] **Step 4: kustomization.yaml**

```yaml
# infra/k8s/base/api/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
  - hpa.yaml
```

- [ ] **Step 5: Validate**

```bash
kubectl kustomize infra/k8s/base/api > /dev/null
```

- [ ] **Step 6: Commit**

```bash
git add infra/k8s/base/api
git commit -m "feat(infra): K8s base — API Deployment (rolling, HPA, Vault-injected secrets)"
```

---

## Task 12: K8s base — SLA Worker Deployment (ADR-005 критические инварианты)

**Files:**
- Create: `infra/k8s/base/sla-worker/deployment.yaml`
- Create: `infra/k8s/base/sla-worker/service.yaml`
- Create: `infra/k8s/base/sla-worker/kustomization.yaml`

- [ ] **Step 1: Deployment — `replicas:1`, `strategy:Recreate`, `ROLE=worker`**

```yaml
# infra/k8s/base/sla-worker/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sla-worker
  namespace: ccip
spec:
  replicas: 1
  strategy:
    type: Recreate   # НЕ RollingUpdate — ломает SLA-гарантии ADR-005
  selector:
    matchLabels:
      app: sla-worker
  template:
    metadata:
      labels:
        app: sla-worker
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "ccip-worker"
        vault.hashicorp.com/agent-inject-secret-db: "secret/data/ccip/worker/database"
        vault.hashicorp.com/agent-inject-template-db: |
          {{- with secret "secret/data/ccip/worker/database" -}}
          DATABASE_URL=postgres://{{ .Data.data.user }}:{{ .Data.data.password }}@pgbouncer:6432/{{ .Data.data.dbname }}
          REDIS_PASSWORD={{ .Data.data.password }}
          {{- end }}
        vault.hashicorp.com/agent-inject-secret-jwt: "secret/data/ccip/worker/jwt"
        vault.hashicorp.com/agent-inject-template-jwt: |
          {{- with secret "secret/data/ccip/worker/jwt" -}}
          JWT_SECRET={{ .Data.data.secret }}
          {{- end }}
    spec:
      serviceAccountName: ccip-sla-worker
      terminationGracePeriodSeconds: 30   # < lockDuration: 60s (BullMQ, ADR-005)
      containers:
        - name: sla-worker
          image: ccip-api:local
          imagePullPolicy: IfNotPresent
          command: ["/app/entrypoint.sh"]
          args: ["node", "apps/api/dist/main.js"]
          ports:
            - containerPort: 3000
          env:
            - name: ROLE
              value: worker
            - name: REDIS_HOST
              value: redis
            - name: REDIS_PORT
              value: "6379"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
```

- [ ] **Step 2: ServiceAccount + Service**

```yaml
# infra/k8s/base/sla-worker/service.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ccip-sla-worker
  namespace: ccip
---
apiVersion: v1
kind: Service
metadata:
  name: sla-worker
  namespace: ccip
spec:
  selector:
    app: sla-worker
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 3: kustomization.yaml**

```yaml
# infra/k8s/base/sla-worker/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

- [ ] **Step 4: Validate + статическая проверка ADR-005 инвариантов**

```bash
kubectl kustomize infra/k8s/base/sla-worker > /dev/null
grep -A1 "strategy:" infra/k8s/base/sla-worker/deployment.yaml | grep -q "type: Recreate" && echo "OK: Recreate"
grep -q "replicas: 1" infra/k8s/base/sla-worker/deployment.yaml && echo "OK: replicas:1"
grep -q "terminationGracePeriodSeconds: 30" infra/k8s/base/sla-worker/deployment.yaml && echo "OK: gracePeriod 30 < lockDuration 60"
```

Ожидание: все три `OK:` строки выведены.

- [ ] **Step 5: Commit**

```bash
git add infra/k8s/base/sla-worker
git commit -m "feat(infra): K8s base — SLA Worker Deployment (replicas:1, Recreate — ADR-005)"
```

---

## Task 13: K8s base — Web Deployment

**Files:**
- Create: `infra/k8s/base/web/deployment.yaml`
- Create: `infra/k8s/base/web/service.yaml`
- Create: `infra/k8s/base/web/kustomization.yaml`

- [ ] **Step 1: Deployment**

```yaml
# infra/k8s/base/web/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: ccip
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ccip-web:local
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
```

- [ ] **Step 2: Service**

```yaml
# infra/k8s/base/web/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: ccip
spec:
  selector:
    app: web
  ports:
    - port: 8080
      targetPort: 8080
```

- [ ] **Step 3: kustomization.yaml**

```yaml
# infra/k8s/base/web/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

- [ ] **Step 4: Validate**

```bash
kubectl kustomize infra/k8s/base/web > /dev/null
```

- [ ] **Step 5: Commit**

```bash
git add infra/k8s/base/web
git commit -m "feat(infra): K8s base — Web Deployment"
```

---

## Task 14: K8s base — Ingress + cert-manager ClusterIssuer (self-signed)

**Files:**
- Create: `infra/k8s/base/ingress/cluster-issuer.yaml`
- Create: `infra/k8s/base/ingress/ingress.yaml`
- Create: `infra/k8s/base/ingress/kustomization.yaml`

- [ ] **Step 1: Self-signed ClusterIssuer (kind не имеет публичного DNS — настоящий ACME не применим)**

```yaml
# infra/k8s/base/ingress/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ccip-selfsigned
spec:
  selfSigned: {}
```

- [ ] **Step 2: Ingress**

```yaml
# infra/k8s/base/ingress/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ccip
  namespace: ccip
  annotations:
    cert-manager.io/cluster-issuer: ccip-selfsigned
spec:
  ingressClassName: nginx
  tls:
    - hosts: ["ccip.local"]
      secretName: ccip-tls
  rules:
    - host: ccip.local
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 3000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 8080
```

- [ ] **Step 3: kustomization.yaml**

```yaml
# infra/k8s/base/ingress/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - cluster-issuer.yaml
  - ingress.yaml
```

- [ ] **Step 4: Validate**

```bash
kubectl kustomize infra/k8s/base/ingress > /dev/null
```

- [ ] **Step 5: Commit**

```bash
git add infra/k8s/base/ingress
git commit -m "feat(infra): K8s base — Ingress + self-signed cert-manager ClusterIssuer"
```

---

## Task 15: K8s base kustomization.yaml + overlays/{dev,staging,prod}

**Files:**
- Create: `infra/k8s/base/kustomization.yaml`
- Create: `infra/k8s/overlays/dev/kustomization.yaml`
- Create: `infra/k8s/overlays/dev/patch-images.yaml`
- Create: `infra/k8s/overlays/staging/kustomization.yaml`
- Create: `infra/k8s/overlays/prod/kustomization.yaml`

- [ ] **Step 1: base/kustomization.yaml — собирает все группы**

```yaml
# infra/k8s/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - bootstrap-secrets.yaml
  - postgres
  - pgbouncer
  - redis
  - vault
  - api
  - sla-worker
  - web
  - ingress
```

- [ ] **Step 2: overlays/dev — kind-патчи (storageClass, без digest-pin)**

```yaml
# infra/k8s/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - path: patch-images.yaml
    target:
      kind: Deployment
      name: api
  - path: patch-images.yaml
    target:
      kind: Deployment
      name: sla-worker
```

```yaml
# infra/k8s/overlays/dev/patch-images.yaml
- op: replace
  path: /spec/template/spec/containers/0/imagePullPolicy
  value: Never
```

> Примечание: `imagePullPolicy: Never` для dev-overlay — образы загружаются в kind через `kind load docker-image`, не из реестра; `Never` гарантирует, что под не попытается тянуть из несуществующего внешнего registry.

- [ ] **Step 3: overlays/staging — заглушка**

```yaml
# infra/k8s/overlays/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
# TODO: выбор облачного провайдера — отдельный follow-up план
# (managed Postgres/Redis vs StatefulSet, реальный ingress class, storageClass)
```

- [ ] **Step 4: overlays/prod — заглушка**

```yaml
# infra/k8s/overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
# TODO: выбор облачного провайдера — отдельный follow-up план
# (managed Postgres/Redis vs StatefulSet, реальный ingress class, storageClass,
#  production-grade Vault: HA + persistent backend + auto-unseal через cloud KMS)
```

- [ ] **Step 5: Validate всю сборку dev-overlay целиком**

```bash
kubectl kustomize infra/k8s/overlays/dev > /dev/null
```

Ожидание: без ошибок — это первая проверка, что все группы (postgres/pgbouncer/redis/vault/api/sla-worker/web/ingress) собираются вместе без конфликтов имён/namespace.

- [ ] **Step 6: Commit**

```bash
git add infra/k8s/base/kustomization.yaml infra/k8s/overlays
git commit -m "feat(infra): K8s base kustomization.yaml + overlays (dev validated on kind, staging/prod stubs)"
```

---

## Task 16: `infra/k8s/scripts/kind-up.sh`

**Files:**
- Create: `infra/k8s/scripts/kind-up.sh`
- Create: `infra/k8s/kind-config.yaml`

- [ ] **Step 1: kind cluster config**

```yaml
# infra/k8s/kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ccip-dev
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: 8080
      - containerPort: 443
        hostPort: 8443
```

- [ ] **Step 2: Полный bring-up скрипт**

```bash
#!/bin/sh
# infra/k8s/scripts/kind-up.sh
set -e

CLUSTER=ccip-dev
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== 1. Create kind cluster ==="
kind create cluster --name "$CLUSTER" --config "$REPO_ROOT/infra/k8s/kind-config.yaml" || \
  echo "Cluster $CLUSTER already exists, reusing."

echo "=== 2. Install ingress-nginx ==="
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.2/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "=== 3. Install cert-manager CRDs + controller ==="
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s

echo "=== 4. Build + load application images ==="
docker build -f "$REPO_ROOT/apps/api/Dockerfile" -t ccip-api:local "$REPO_ROOT"
docker build -f "$REPO_ROOT/apps/web/Dockerfile" -t ccip-web:local "$REPO_ROOT"
docker build -t ccip-postgres:local "$REPO_ROOT/infra/docker/postgres"
kind load docker-image ccip-api:local --name "$CLUSTER"
kind load docker-image ccip-web:local --name "$CLUSTER"
kind load docker-image ccip-postgres:local --name "$CLUSTER"

echo "=== 5. Apply Vault (namespace + dev-server + injector) ==="
kubectl apply -k "$REPO_ROOT/infra/k8s/base/vault"
kubectl wait --namespace vault --for=condition=ready pod -l app.kubernetes.io/name=vault --timeout=120s

echo "=== 6. Seed Vault (policies, roles, generated secrets) ==="
sh "$SCRIPT_DIR/vault-seed.sh"
# shellcheck source=/dev/null
. /tmp/ccip-vault-seed-output.env

echo "=== 7. Apply namespace + bootstrap secrets (using Vault-generated PG_PASS) ==="
kubectl apply -f "$REPO_ROOT/infra/k8s/base/namespace.yaml"
kubectl create secret generic ccip-bootstrap-secrets -n ccip \
  --from-literal=postgres-password="$PG_PASS" \
  --from-literal=redis-password="$PG_PASS" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== 8. Apply full dev overlay ==="
kubectl apply -k "$REPO_ROOT/infra/k8s/overlays/dev"

echo "=== 9. Wait for rollout ==="
kubectl rollout status statefulset/postgres -n ccip --timeout=120s
kubectl rollout status statefulset/redis -n ccip --timeout=120s
kubectl rollout status deployment/pgbouncer -n ccip --timeout=120s
kubectl rollout status deployment/api -n ccip --timeout=180s
kubectl rollout status deployment/sla-worker -n ccip --timeout=180s
kubectl rollout status deployment/web -n ccip --timeout=120s

echo "=== Done. kubectl get pods -n ccip / -n vault to inspect. ==="
```

- [ ] **Step 3: chmod + syntax check**

```bash
chmod +x infra/k8s/scripts/kind-up.sh
bash -n infra/k8s/scripts/kind-up.sh
```

Ожидание: без вывода.

- [ ] **Step 4: Commit**

```bash
git add infra/k8s/scripts/kind-up.sh infra/k8s/kind-config.yaml
git commit -m "feat(infra): kind-up.sh — full local bring-up script for K8s scaffold"
```

---

## Task 17: Реальный прогон на kind + ADR-005 recovery-scan валидация

**Files:** нет новых файлов — это исполнение и наблюдение, результат фиксируется в `docs/project-state.md` (Task 18).

- [ ] **Step 1: Запустить полный bring-up**

```bash
sh infra/k8s/scripts/kind-up.sh
```

Ожидание: скрипт доходит до `=== Done. ===` без ошибок; `kubectl rollout status` на каждом ресурсе — успешно.

- [ ] **Step 2: Smoke — health-пробы**

```bash
kubectl exec -n ccip deploy/api -- wget -qO- http://localhost:3000/health/live
kubectl exec -n ccip deploy/api -- wget -qO- http://localhost:3000/health/ready
kubectl exec -n ccip deploy/sla-worker -- wget -qO- http://localhost:3000/health/ready
```

Ожидание: все три — `{"alive":true}` / `{"postgres":true,"redis":true}`.

- [ ] **Step 3: Smoke — PgBouncer pool_mode, Redis AOF**

```bash
kubectl exec -n ccip deploy/pgbouncer -- env | grep POOL_MODE
kubectl exec -n ccip statefulset/redis -- redis-cli -a "$(kubectl get secret ccip-bootstrap-secrets -n ccip -o jsonpath='{.data.redis-password}' | base64 -d)" CONFIG GET appendonly
```

Ожидание: `POOL_MODE=session`; `appendonly` / `yes`.

- [ ] **Step 4: Smoke — Vault-секреты реально дошли до пода**

```bash
kubectl exec -n ccip deploy/api -- cat /vault/secrets/db
kubectl exec -n ccip deploy/api -- printenv DATABASE_URL
```

Ожидание: значение `DATABASE_URL` использует пароль, сгенерированный `vault-seed.sh` (`openssl rand`), не дефолт `ccip_dev_pass` из `docker-compose.yml`.

- [ ] **Step 5: Главный тест — ADR-005 recovery scan**

Создать просроченное событие напрямую в БД (имитация "Redis потерян, событие просрочено"):

```bash
kubectl exec -n ccip statefulset/postgres -- psql -U ccip_owner -d ccip -c \
  "INSERT INTO sla_events (discrepancy_id, event_type, scheduled_at, executed_at) \
   SELECT id, 'director_deadline_day7', NOW() - INTERVAL '1 day', NULL \
   FROM discrepancies LIMIT 1;"
```

Если таблица `discrepancies` пуста на чистом кластере — сначала создать минимальный сценарий через `kubectl port-forward svc/api -n ccip 3000:3000` и HTTP-вызов `rejectGpResponse` по существующему integration-тестовому сценарию (см. `apps/api/test/integration/scenarios/d-block-sla-worker.integration.spec.ts` для точной последовательности вызовов и фикстур).

- [ ] **Step 6: Убить под воркера, наблюдать Recreate**

```bash
kubectl get pods -n ccip -l app=sla-worker -w &
WATCH_PID=$!
kubectl delete pod -n ccip -l app=sla-worker
sleep 15
kill $WATCH_PID
```

Ожидание в выводе `-w`: старый под уходит в `Terminating` и полностью исчезает ДО того, как появляется новый `sla-worker` под (это видно по тому, что в любой момент в выводе `kubectl get pods -w` присутствует не более одного pod с именем `sla-worker-*` в состоянии не-`Terminating`) — подтверждает `strategy.type: Recreate`, в отличие от `RollingUpdate`, где новый под появился бы ДО завершения старого.

- [ ] **Step 7: Проверить, что просроченное событие подхвачено recovery scan'ом**

```bash
sleep 10
kubectl exec -n ccip statefulset/postgres -- psql -U ccip_owner -d ccip -c \
  "SELECT id, event_type, executed_at FROM sla_events WHERE event_type = 'director_deadline_day7' ORDER BY id DESC LIMIT 1;"
kubectl logs -n ccip deploy/sla-worker --tail=50
```

Ожидание: `executed_at` не `NULL` (recovery scan обработал просроченное событие при старте нового пода); в логах — упоминание обработки события `director_deadline_day7`.

- [ ] **Step 8: Зафиксировать результат прогона**

Если все шаги 2-7 прошли успешно — записать в заметках к PR/коммиту фактический вывод шагов 5-7 (id события, timestamp `executed_at`) как доказательство, что ADR-005 инвариант воспроизведён на реальном кластере, не только на бумаге.

---

## Task 18: Обновить `docs/project-state.md`

**Files:**
- Modify: `docs/project-state.md`

- [ ] **Step 1: Обновить статус M-12**

После успешного прогона Task 17 — заменить в §2 Module Status строку:

```
| M-12 | P1 | Prod Infra / K8s Worker | 12 | ○ pending | Pilot |
```

на:

```
| M-12 | P1 | Prod Infra / K8s Worker | 12 | ◑ scaffold done ⁵, cloud TBD | Pilot |
```

Добавить footnote ⁵ с кратким описанием: scaffold `infra/k8s/` (Kustomize base+overlays) валидирован на локальном kind, ADR-005 recovery-scan воспроизведён, Vault dev-mode для секретов; staging/prod overlays — заглушки до выбора облачного провайдера (follow-up план); Observability/Backup automation — отдельный follow-up.

Обновить §1 `Active P1 Task` и `Next Milestone` соответственно (Next Milestone становится либо follow-up "M-12 cloud provisioning", либо переходит к подготовке M-13, по решению на момент завершения).

- [ ] **Step 2: Commit**

```bash
git add docs/project-state.md
git commit -m "docs(tasks): M-12 K8s scaffold validated on kind — update project-state"
```

---

## Самопроверка плана (выполнена при написании)

**Spec coverage:** §3 (объём решений) → Task 0/16/17 (kind-only, без CI). §4 (структура) → Task 6-15. §5 (Vault) → Task 9-10, 11-12 (аннотации). §6 (health+ROLE) → Task 1-3 (плюс найденный и исправленный Redis-password баг в Task 2, не было в споке явно, но необходимо для §5 работать). §7 (манифесты/инварианты) → Task 12 (явные статические assert'ы). §8 (валидация) → Task 17. §9 (файловый план) → покрыт Task 1-16. §10 (вне скоупа) — ничего из этого списка не реализовано ни в одном task. §11 (допущения, включая liveness/readiness split) → Task 1 Step 4 (комментарий в коде ссылается на спеку).

**Placeholder scan:** один намеренный плейсхолдер — `CHANGEME-overridden-by-kind-up.sh` в `bootstrap-secrets.yaml` (Task 9) — это не "TBD" в смысле недописанного плана, это реальный шаблон-файл, значение которого скрипт (Task 16) подставляет на этапе `apply`; задокументировано явно в комментарии самого файла.

**Type consistency:** `checkLive()`/`checkReady()` — одинаковые имена в Task 1 (реализация + тесты) и переиспользуются только там; K8s-манифесты ссылаются на `/health/live`/`/health/ready` (HTTP-пути контроллера), не на названия TS-методов — нет расхождения между уровнями.
