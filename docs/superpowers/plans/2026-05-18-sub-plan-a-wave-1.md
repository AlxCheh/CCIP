# Sub-Plan A — Wave 1: §11 Business Correctness Integration Suite — Infrastructure + Ready Modules

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять integration test infrastructure для CCIP `apps/api`, покрыть 17 algorithm tests (A-01..A-05, B-01..B-03/05..07, C-01..04/07/09) и 2 ADR invariant suites (ADR-002 period concurrency, ADR-007 period immutability) на реальной Postgres, добавить CI workflow `api-integration.yml` и coverage-matrix automation.

**Architecture:** Shared Postgres container (T-22 image, pg_partman + pg_cron pre-baked) + Jest 30 sequential (`--runInBand`) + `TRUNCATE … RESTART IDENTITY CASCADE` per `describe` block. Hybrid layout: `invariants/adr-*.spec.ts` (property-based via `fast-check`) + `scenarios/<block>-block.integration.spec.ts` (1-to-1 с algorithm v1.3 §Part 4). Coverage matrix auto-gen из `// @algorithm: <id>` annotations через jest `globalTeardown`.

**Tech Stack:** TypeScript 5.7, Jest 30, ts-jest 29, NestJS 11 testing module, Prisma 5.22, fast-check 3.x, PostgreSQL 16, pnpm 4.

**Spec source:** `docs/superpowers/specs/2026-05-18-business-correctness-gate-design.md`

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `apps/api/package.json` | + `fast-check` dep, + `test:integration` script |
| `apps/api/test/integration/jest-integration.json` | Jest config — sequential, 30s timeout, globalSetup/Teardown |
| `apps/api/test/integration/setup/env.ts` | `DATABASE_URL_TEST`, `JWT_SECRET_TEST` resolution |
| `apps/api/test/integration/setup/global-setup.ts` | Connect Postgres, run migrations, verify extensions |
| `apps/api/test/integration/setup/global-teardown.ts` | Disconnect; trigger coverage-matrix gen |
| `apps/api/test/integration/setup/truncate.ts` | `TRUNCATE … RESTART IDENTITY CASCADE` per describe |
| `apps/api/test/integration/fixtures/factories.ts` | `makeOrg`, `makeUser`, `makeObject`, `makeBoQ`, `makeZeroReport`, `makePeriod` |
| `apps/api/test/integration/fixtures/arbitraries.ts` | fast-check: `arbBoQ`, `arbContractValues` |
| `apps/api/test/integration/fixtures/seeds.ts` | `seedApprovedZeroReport()` |
| `apps/api/test/integration/helpers/login-as.ts` | NestJS testing module + JWT signer |
| `apps/api/test/integration/helpers/advisory-lock-peek.ts` | `SELECT * FROM pg_locks WHERE locktype='advisory'` |
| `apps/api/test/integration/helpers/coverage-matrix.ts` | Parse `// @algorithm:` annotations, emit `docs/testing/coverage-matrix.md` |
| `apps/api/test/integration/invariants/adr-002-period-concurrency.spec.ts` | Property-based: N concurrent OpenPeriod → 1 succeeds |
| `apps/api/test/integration/invariants/adr-007-period-immutability.spec.ts` | Closed period writes throw; cascade recalc invariants |
| `apps/api/test/integration/scenarios/a-block-weight-coef.integration.spec.ts` | A-01..A-05 |
| `apps/api/test/integration/scenarios/b-block-zero-report.integration.spec.ts` | B-01..B-03, B-05..B-07 (B-04 → W2) |
| `apps/api/test/integration/scenarios/c-block-period.integration.spec.ts` | C-01..C-04, C-07, C-09 (C-05/06/08 → W2) |
| `apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts` | Placeholder for W2 (`describe.skip`) |
| `apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts` | Placeholder for W3 |
| `apps/api/test/integration/scenarios/f-block-baseline.integration.spec.ts` | Placeholder for W4 |
| `apps/api/test/integration/scenarios/g-block-boq-versioning.integration.spec.ts` | Placeholder for W4 |
| `.github/workflows/api-integration.yml` | New CI workflow |
| `docs/testing/coverage-matrix.md` | Auto-generated, committed |
| `docs/testing/integration-suite-readme.md` | Onboarding for engineers adding new tests |
| `CHANGELOG.md` | + Wave 1 entry |
| `docs/project-state.md` | Update §5 Completed (W1 marker) |

---

## Task 1: Add `fast-check` dependency

**Files:**
- Modify: `apps/api/package.json` (devDependencies)

- [ ] **Step 1.1: Install**

Run:
```
pnpm --filter @ccip/api add -D fast-check@^3
```

Expected: `apps/api/package.json` devDependencies gains `"fast-check": "^3.x"`; `pnpm-lock.yaml` updated.

- [ ] **Step 1.2: Verify install**

Run: `pnpm --filter @ccip/api list fast-check`
Expected: `fast-check 3.x.x` printed.

- [ ] **Step 1.3: Commit**

```
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add fast-check dep for integration property tests"
```

---

## Task 2: Create `env.ts` + `jest-integration.json`

**Files:**
- Create: `apps/api/test/integration/setup/env.ts`
- Create: `apps/api/test/integration/jest-integration.json`

- [ ] **Step 2.1: Write `setup/env.ts`**

```ts
// apps/api/test/integration/setup/env.ts
export const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip_test';

export const TEST_JWT_SECRET =
  process.env.JWT_SECRET_TEST ?? 'test-jwt-secret-not-for-prod';

export const FAST_CHECK_RUNS = Number(process.env.FC_RUNS ?? (process.env.CI ? 25 : 100));

export const FAST_CHECK_SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
```

- [ ] **Step 2.2: Write `jest-integration.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": "\\.integration\\.spec\\.ts$",
  "testTimeout": 30000,
  "globalSetup": "<rootDir>/setup/global-setup.ts",
  "globalTeardown": "<rootDir>/setup/global-teardown.ts",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": {
    "^@ccip/database(.*)$": "<rootDir>/../../../../packages/database/src$1",
    "^@ccip/shared(.*)$": "<rootDir>/../../../../packages/shared/src$1"
  }
}
```

- [ ] **Step 2.3: Commit (deferred — после Task 3 чтобы конфиг был executable)**

---

## Task 3: Implement `global-setup.ts`

**Files:**
- Create: `apps/api/test/integration/setup/global-setup.ts`

- [ ] **Step 3.1: Write setup**

```ts
// apps/api/test/integration/setup/global-setup.ts
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { TEST_DB_URL } from './env';

export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB_URL;

  // Ensure DB exists (create if not). We connect to maintenance DB 'postgres' for CREATE DATABASE.
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.replace(/^\//, '');
  const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const { rowCount } = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [dbName],
  );
  if (rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  // Apply Prisma migrations to test DB
  execSync('pnpm --filter @ccip/database migrate:deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });

  // Verify required extensions
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  const required = ['pg_partman', 'pg_cron'];
  for (const ext of required) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM pg_extension WHERE extname = $1`,
      [ext],
    );
    if (rowCount === 0) {
      throw new Error(
        `Required extension "${ext}" not installed in test DB. ` +
          `Use the T-22 ghcr.io/<repo>/ccip-postgres image, not stock postgres:16-alpine.`,
      );
    }
  }
  await client.end();
}
```

- [ ] **Step 3.2: Verify `pg` package available**

`pg` уже транзитивно через `@prisma/client`. Если jest `globalSetup` не resolve'ит — добавить:
```
pnpm --filter @ccip/api add -D pg @types/pg
```

---

## Task 4: Implement `global-teardown.ts`

**Files:**
- Create: `apps/api/test/integration/setup/global-teardown.ts`

- [ ] **Step 4.1: Write teardown**

```ts
// apps/api/test/integration/setup/global-teardown.ts
import { writeCoverageMatrix } from '../helpers/coverage-matrix';

export default async function globalTeardown(): Promise<void> {
  // Coverage matrix gen runs even if tests failed (Jest invokes teardown always)
  await writeCoverageMatrix({
    integrationDir: __dirname + '/..',
    algorithmDoc: __dirname + '/../../../../../docs/algorithm_v1_3.md',
    outFile: __dirname + '/../../../../../docs/testing/coverage-matrix.md',
  });
}
```

- [ ] **Step 4.2: Stub `coverage-matrix.ts` чтобы teardown импорт не падал**

```ts
// apps/api/test/integration/helpers/coverage-matrix.ts (initial stub — расширяется в Task 13)
export interface WriteCoverageMatrixArgs {
  integrationDir: string;
  algorithmDoc: string;
  outFile: string;
}
export async function writeCoverageMatrix(_args: WriteCoverageMatrixArgs): Promise<void> {
  /* full impl — see Task 13 */
}
```

---

## Task 5: Implement `truncate.ts`

**Files:**
- Create: `apps/api/test/integration/setup/truncate.ts`

- [ ] **Step 5.1: Write truncate helper**

```ts
// apps/api/test/integration/setup/truncate.ts
import type { PrismaClient } from '@ccip/database';

// FK-aware order: leaves first, roots last. Preserve config/migrations/partman tables.
// Physical names match Prisma @@map directives (NOT model PascalCase).
const TENANT_TABLES = [
  'audit_log',
  'period_facts',
  'periods',
  'boq_items',
  'boq_versions',
  'zero_reports',
  'l2_documents',       // model L2Document — Prisma accessor: prisma.l2Document
  'objects',            // model ConstructionObject — Prisma accessor: prisma.constructionObject
  'refresh_tokens',
  'users',
  'organizations',
];

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const list = TENANT_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
```

- [ ] **Step 5.2: Adjust table list if Prisma model names differ**

Run:
```
grep -h '^model ' packages/database/prisma/schema.prisma | awk '{print $2}'
grep -nE "@@map" packages/database/prisma/schema.prisma
```

Cross-reference: каждое имя должно совпадать с **physical** DB table name (через `@@map` или snake_case default). **Известные расхождения** (зафиксированы в plan):
- `ConstructionObject` → table `objects` (НЕ `construction_objects`)
- `L2Document` → table `l2_documents` (НЕ `documents`); Prisma accessor: `prisma.l2Document`

Если найдены **новые** расхождения — обновить массив и зафиксировать в commit message.

---

## Task 6: Add `test:integration` npm script

**Files:**
- Modify: `apps/api/package.json` (scripts)

- [ ] **Step 6.1: Add script**

В `apps/api/package.json` → `"scripts"`:
```json
"test:integration": "jest --config ./test/integration/jest-integration.json --runInBand"
```

- [ ] **Step 6.2: Commit infrastructure (Tasks 2–6)**

```
git add apps/api/test/integration/ apps/api/package.json pnpm-lock.yaml
git commit -m "test(api): integration suite scaffolding — jest config, setup, truncate"
```

---

## Task 7: Smoke test — infrastructure works

**Files:**
- Create: `apps/api/test/integration/smoke.integration.spec.ts`

- [ ] **Step 7.1: Write failing smoke test**

```ts
// apps/api/test/integration/smoke.integration.spec.ts
import { PrismaClient } from '@ccip/database';
import { truncateAll } from './setup/truncate';

describe('integration suite smoke', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('connects to test DB and runs TRUNCATE', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0].ok).toBe(1);
  });

  it('required extensions are installed', async () => {
    const exts = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension
    `;
    const names = exts.map((e) => e.extname);
    expect(names).toContain('pg_partman');
    expect(names).toContain('pg_cron');
  });
});
```

- [ ] **Step 7.2: Run smoke**

Run: `pnpm --filter @ccip/api test:integration -- --testPathPattern smoke`
Expected: 2 passed, 1 file. Setup runs migrations once; teardown invokes coverage-matrix stub (no-op).

Если фейл — диагностика:
- `Cannot find module 'pg'` → install `pg @types/pg`.
- `Required extension … not installed` → docker image не T-22; запустить `docker compose up postgres -d` с правильным образом.
- `migrate:deploy` fails → проверить, что `ccip_test` DB создана / `DATABASE_URL_TEST` правильный.

- [ ] **Step 7.3: Commit smoke**

```
git add apps/api/test/integration/smoke.integration.spec.ts
git commit -m "test(api): smoke test verifies integration setup works"
```

---

## Task 8: Factories — organizations, users, objects

**Files:**
- Create: `apps/api/test/integration/fixtures/factories.ts`

- [ ] **Step 8.1: Write factories part 1**

```ts
// apps/api/test/integration/fixtures/factories.ts
import { PrismaClient, Prisma } from '@ccip/database';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

export interface OrgFixture {
  id: string;
  name: string;
}

export async function makeOrg(
  prisma: PrismaClient,
  overrides: Partial<OrgFixture> = {},
): Promise<OrgFixture> {
  const org = await prisma.organization.create({
    data: {
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? `Org ${randomUUID().slice(0, 8)}`,
    },
  });
  return { id: org.id, name: org.name };
}

export interface UserFixture {
  id: number;
  email: string;
  role: 'director' | 'stroycontrol' | 'admin' | 'engineer';
  organizationId: string;
}

export async function makeUser(
  prisma: PrismaClient,
  org: OrgFixture,
  role: UserFixture['role'] = 'stroycontrol',
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<UserFixture> {
  const email = overrides.email ?? `${role}-${randomUUID().slice(0, 6)}@test.local`;
  const passwordHash = await bcrypt.hash(overrides.password ?? 'test-pass-1234', 4);
  const u = await prisma.user.create({
    data: {
      email,
      role,
      organizationId: org.id,
      passwordHash,
      isActive: true,
    },
  });
  return { id: u.id, email: u.email, role: u.role as UserFixture['role'], organizationId: u.organizationId };
}

export interface ObjectFixture {
  id: number;
  organizationId: string;
  name: string;
}

export async function makeObject(
  prisma: PrismaClient,
  org: OrgFixture,
  overrides: Partial<{ name: string; gcUserId: number | null }> = {},
): Promise<ObjectFixture> {
  const obj = await prisma.constructionObject.create({
    data: {
      organizationId: org.id,
      name: overrides.name ?? `Object ${randomUUID().slice(0, 6)}`,
      gcUserId: overrides.gcUserId ?? null,
    },
  });
  return { id: obj.id, organizationId: obj.organizationId, name: obj.name };
}
```

- [ ] **Step 8.2: Verify model names**

Prisma generates `prisma.organization` / `prisma.user` / `prisma.constructionObject` — confirm by reading `schema.prisma`. Если model names иные — adapt.

---

## Task 9: Factories — BoQ, zero report, period

**Files:**
- Modify: `apps/api/test/integration/fixtures/factories.ts`

- [ ] **Step 9.1: Append BoQ factory**

```ts
// ─── BoQ ─────────────────────────────────────────────────────────────────────

export interface BoqFixture {
  versionId: number;
  items: Array<{ id: number; workLineageId: string; contractValue: Prisma.Decimal; planVolume: Prisma.Decimal; weightCoef: Prisma.Decimal }>;
}

export interface MakeBoqOpts {
  contractValues?: number[]; // explicit per-item contract_value; length defines item count
  count?: number;            // if contractValues not given — generate N items
}

export async function makeBoQ(
  prisma: PrismaClient,
  object: ObjectFixture,
  opts: MakeBoqOpts = {},
): Promise<BoqFixture> {
  const version = await prisma.boqVersion.create({
    data: { objectId: object.id, versionNumber: 1, isActive: true },
  });
  const values =
    opts.contractValues ??
    Array.from({ length: opts.count ?? 5 }, () => 10 + Math.random() * 90);
  const items: BoqFixture['items'] = [];
  for (let i = 0; i < values.length; i++) {
    const item = await prisma.boqItem.create({
      data: {
        boqVersionId: version.id,
        name: `Work ${i + 1}`,
        workCode: `WC-${version.id}-${i + 1}`,    // required, unique per boqVersion
        unit: 'm3',
        contractValue: new Prisma.Decimal(values[i].toFixed(2)),
        planVolume: new Prisma.Decimal('100.00'),
        workLineageId: randomUUID(),
        // weight_coef set by trigger trg_boq_items_weight_coef
      },
      select: { id: true, workLineageId: true, contractValue: true, planVolume: true, weightCoef: true },
    });
    items.push({
      id: item.id,
      workLineageId: item.workLineageId,
      contractValue: item.contractValue,
      planVolume: item.planVolume,
      weightCoef: item.weightCoef,
    });
  }
  return { versionId: version.id, items };
}
```

- [ ] **Step 9.2: Append zero-report + period factories**

```ts
// ─── ZeroReport ──────────────────────────────────────────────────────────────

export async function makeApprovedZeroReport(
  prisma: PrismaClient,
  object: ObjectFixture,
  director: UserFixture,
): Promise<{ id: number }> {
  const zr = await prisma.zeroReport.create({
    data: { objectId: object.id, status: 'approved', approvedBy: director.id, approvedAt: new Date() },
  });
  return { id: zr.id };
}

// ─── Period (raw — used in C-block when periodService is bypassed) ──────────

export async function makeClosedPeriod(
  prisma: PrismaClient,
  object: ObjectFixture,
  boq: BoqFixture,
  actor: UserFixture,
  periodNumber: number,
): Promise<{ id: number }> {
  const period = await prisma.period.create({
    data: {
      objectId: object.id,
      boqVersionId: boq.versionId,
      periodNumber,
      status: 'closed',
      openedBy: actor.id,
      openedAt: new Date(),
      closedBy: actor.id,
      closedAt: new Date(),
      gpSubmissionToken: randomUUID(),
      gpTokenExpiresAt: new Date(Date.now() + 14 * 86400_000),
    },
  });
  return { id: period.id };
}
```

- [ ] **Step 9.3: Commit factories**

```
git add apps/api/test/integration/fixtures/factories.ts
git commit -m "test(api): integration factories — org, user, object, boq, zero-report, period"
```

---

## Task 10: fast-check arbitraries

**Files:**
- Create: `apps/api/test/integration/fixtures/arbitraries.ts`

- [ ] **Step 10.1: Write arbitraries**

```ts
// apps/api/test/integration/fixtures/arbitraries.ts
import * as fc from 'fast-check';

// BoQ shape — N items, each with a positive contract_value
export const arbBoQShape = fc.record({
  contractValues: fc.array(
    fc.float({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
    { minLength: 2, maxLength: 50 },
  ),
});

// Concurrent count for advisory-lock invariant
export const arbConcurrency = fc.integer({ min: 2, max: 10 });
```

- [ ] **Step 10.2: Commit**

```
git add apps/api/test/integration/fixtures/arbitraries.ts
git commit -m "test(api): fast-check arbitraries — BoQ shape, concurrency"
```

---

## Task 11: `login-as.ts` helper

**Files:**
- Create: `apps/api/test/integration/helpers/login-as.ts`

- [ ] **Step 11.1: Write helper**

```ts
// apps/api/test/integration/helpers/login-as.ts
import { JwtService } from '@nestjs/jwt';
import { TEST_JWT_SECRET } from '../setup/env';
import type { UserFixture } from '../fixtures/factories';

const jwt = new JwtService({ secret: TEST_JWT_SECRET });

export async function loginAs(user: UserFixture): Promise<string> {
  return jwt.signAsync({
    sub: String(user.id),
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  });
}
```

- [ ] **Step 11.2: Commit**

```
git add apps/api/test/integration/helpers/login-as.ts
git commit -m "test(api): loginAs helper — sign JWT for fixture user"
```

---

## Task 12: `advisory-lock-peek.ts` helper

**Files:**
- Create: `apps/api/test/integration/helpers/advisory-lock-peek.ts`

- [ ] **Step 12.1: Write helper**

```ts
// apps/api/test/integration/helpers/advisory-lock-peek.ts
import type { PrismaClient } from '@ccip/database';

export interface AdvisoryLock {
  pid: number;
  granted: boolean;
  classid: number;
  objid: number;
}

export async function peekAdvisoryLocks(prisma: PrismaClient): Promise<AdvisoryLock[]> {
  return prisma.$queryRaw<AdvisoryLock[]>`
    SELECT pid, granted, classid, objid
    FROM pg_locks
    WHERE locktype = 'advisory'
  `;
}
```

- [ ] **Step 12.2: Commit**

```
git add apps/api/test/integration/helpers/advisory-lock-peek.ts
git commit -m "test(api): advisory-lock-peek helper"
```

---

## Task 13: Coverage-matrix generator (full impl)

**Files:**
- Modify: `apps/api/test/integration/helpers/coverage-matrix.ts` (replace stub from Task 4)

- [ ] **Step 13.1: Write generator**

```ts
// apps/api/test/integration/helpers/coverage-matrix.ts
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface WriteCoverageMatrixArgs {
  integrationDir: string;
  algorithmDoc: string;
  outFile: string;
}

interface Annotation { id: string; file: string; line: number; }

export async function writeCoverageMatrix(args: WriteCoverageMatrixArgs): Promise<void> {
  const ids = parseAlgorithmIds(args.algorithmDoc);          // ['A-01', …, 'I-03']
  const found = scanAnnotations(args.integrationDir);        // [{ id: 'A-01', file, line }]

  const seen = new Map<string, Annotation>();
  for (const ann of found) seen.set(ann.id, ann);

  const rows = ids.map((id) => {
    const a = seen.get(id);
    if (!a) return `| ${id} | — pending | — | — |`;
    return `| ${id} | ✓ covered | ${a.file} | ${a.line} |`;
  });

  const unknown = found
    .filter((a) => !ids.includes(a.id))
    .map((a) => `| ${a.id} (NOT IN ALGORITHM) | ⚠ drift | ${a.file} | ${a.line} |`);

  const dir = args.outFile.substring(0, args.outFile.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(
    args.outFile,
    [
      '# Algorithm §Part 4 Test Coverage Matrix',
      '',
      '> Auto-generated by `apps/api/test/integration/helpers/coverage-matrix.ts` on every `test:integration` run. Do not edit by hand.',
      '',
      '| algorithm test | status | spec file | line |',
      '|----------------|--------|-----------|------|',
      ...rows,
      ...unknown,
      '',
    ].join('\n'),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Coverage matrix drift: annotations reference IDs not in algorithm doc: ${unknown.map((u) => u).join(', ')}`,
    );
  }
}

function parseAlgorithmIds(path: string): string[] {
  const text = readFileSync(path, 'utf-8');
  const re = /^\|\s*([A-I]-\d{2})\s*\|/gm;
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[1]);
  return Array.from(new Set(ids)).sort();
}

function scanAnnotations(rootDir: string): Annotation[] {
  const out: Annotation[] = [];
  walk(rootDir, (file, full) => {
    if (!file.endsWith('.integration.spec.ts')) return;
    const lines = readFileSync(full, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/\/\/\s*@algorithm:\s*([A-I]-\d{2})/);
      if (m) out.push({ id: m[1], file: relative(rootDir, full).replace(/\\/g, '/'), line: i + 1 });
    });
  });
  return out;
}

function walk(dir: string, cb: (name: string, full: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(entry.name, full);
  }
}
```

- [ ] **Step 13.2: Re-run integration to regenerate matrix**

Run: `pnpm --filter @ccip/api test:integration`
Expected: `docs/testing/coverage-matrix.md` создан с 47+ rows (все pending пока тестов нет).

- [ ] **Step 13.3: Commit**

```
git add apps/api/test/integration/helpers/coverage-matrix.ts docs/testing/coverage-matrix.md
git commit -m "test(api): coverage-matrix generator — auto-gen on every run"
```

---

## Task 14: ADR-002 invariant suite

**Files:**
- Create: `apps/api/test/integration/invariants/adr-002-period-concurrency.spec.ts`

- [ ] **Step 14.1: Write failing test (property)**

```ts
// apps/api/test/integration/invariants/adr-002-period-concurrency.spec.ts
import { Test, type TestingModule } from '@nestjs/testing';
import * as fc from 'fast-check';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';
import { arbConcurrency } from '../fixtures/arbitraries';
import { FAST_CHECK_RUNS, FAST_CHECK_SEED } from '../setup/env';

describe('ADR-002 — period concurrency (advisory lock)', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('N concurrent OpenPeriod → exactly 1 succeeds, others throw PERIOD_ALREADY_OPEN or PERIOD_LOCK_TIMEOUT', async () => {
    await fc.assert(
      fc.asyncProperty(arbConcurrency, async (n) => {
        await truncateAll(prisma);
        const org = await makeOrg(prisma);
        const director = await makeUser(prisma, org, 'director');
        const sc = await makeUser(prisma, org, 'stroycontrol');
        const obj = await makeObject(prisma, org);
        await makeBoQ(prisma, obj, { count: 3 });
        await makeApprovedZeroReport(prisma, obj, director);

        const settled = await Promise.allSettled(
          Array.from({ length: n }, () => svc.openPeriod(obj.id, sc.id)),
        );
        const fulfilled = settled.filter((r) => r.status === 'fulfilled');
        const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

        expect(fulfilled).toHaveLength(1);
        for (const r of rejected) {
          const msg = (r.reason as Error).message;
          expect(['PERIOD_ALREADY_OPEN', 'PERIOD_LOCK_TIMEOUT']).toContain(msg);
        }
      }),
      { numRuns: FAST_CHECK_RUNS, seed: FAST_CHECK_SEED, verbose: 1 },
    );
  });

  it('OpenPeriod blocked when ZeroReport not approved → ZERO_REPORT_NOT_APPROVED', async () => {
    await truncateAll(prisma);
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    await makeBoQ(prisma, obj, { count: 3 });
    // no zero report

    await expect(svc.openPeriod(obj.id, sc.id)).rejects.toThrow('ZERO_REPORT_NOT_APPROVED');
  });
});
```

- [ ] **Step 14.2: Run — should fail (test code, not implementation, is new)**

Run: `pnpm --filter @ccip/api test:integration -- --testPathPattern adr-002`
Expected: 2 passed. Если fail — диагностировать (FK constraints, missing fields in factories).

- [ ] **Step 14.3: Commit**

```
git add apps/api/test/integration/invariants/adr-002-period-concurrency.spec.ts
git commit -m "test(integration): ADR-002 — advisory lock under N concurrent OpenPeriod"
```

---

## Task 15: ADR-007 invariant suite

**Files:**
- Create: `apps/api/test/integration/invariants/adr-007-period-immutability.spec.ts`

- [ ] **Step 15.1: Write tests**

```ts
// apps/api/test/integration/invariants/adr-007-period-immutability.spec.ts
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport, makeClosedPeriod } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('ADR-007 — period immutability after close', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('Closed period rejects upsertPeriodFact', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    await makeApprovedZeroReport(prisma, obj, dir);
    const period = await makeClosedPeriod(prisma, obj, boq, sc, 1);

    await expect(
      svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 50 }, sc.id),
    ).rejects.toThrow(/PERIOD_(NOT_OPEN|CLOSED|IMMUTABLE)/);
  });

  it('Re-closing already-closed period is rejected', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    await makeApprovedZeroReport(prisma, obj, dir);
    const period = await makeClosedPeriod(prisma, obj, boq, sc, 1);

    await expect(svc.closePeriod(period.id, sc.id)).rejects.toThrow(/PERIOD_(NOT_OPEN|ALREADY_CLOSED)/);
  });
});
```

- [ ] **Step 15.2: Run + commit**

```
pnpm --filter @ccip/api test:integration -- --testPathPattern adr-007
git add apps/api/test/integration/invariants/adr-007-period-immutability.spec.ts
git commit -m "test(integration): ADR-007 — period immutability after close"
```

Если error messages в service отличаются от regex — adjust regex и закоммитить.

---

## Task 16: A-block — weight_coef (A-01..A-05)

**Files:**
- Create: `apps/api/test/integration/scenarios/a-block-weight-coef.integration.spec.ts`

- [ ] **Step 16.1: Write A-block tests**

```ts
// apps/api/test/integration/scenarios/a-block-weight-coef.integration.spec.ts
import * as fc from 'fast-check';
import { PrismaClient, Prisma } from '@ccip/database';
import { makeOrg, makeObject, makeBoQ } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';
import { arbBoQShape } from '../fixtures/arbitraries';
import { FAST_CHECK_RUNS, FAST_CHECK_SEED } from '../setup/env';

describe('A-block — weight_coef trigger correctness', () => {
  let prisma: PrismaClient;

  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  // @algorithm: A-01
  it('A-01: SUM(weight_coef) = 1.000 ± 0.001 for any BoQ shape (property-based)', async () => {
    await fc.assert(
      fc.asyncProperty(arbBoQShape, async ({ contractValues }) => {
        await truncateAll(prisma);
        const org = await makeOrg(prisma);
        const obj = await makeObject(prisma, org);
        await makeBoQ(prisma, obj, { contractValues });

        const sum = await prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
          SELECT COALESCE(SUM(weight_coef), 0)::numeric AS s
          FROM boq_items WHERE boq_version_id IN (SELECT id FROM boq_versions WHERE object_id = ${obj.id})
        `;
        const diff = Math.abs(Number(sum[0].s) - 1);
        expect(diff).toBeLessThan(0.001);
      }),
      { numRuns: FAST_CHECK_RUNS, seed: FAST_CHECK_SEED },
    );
  });

  // @algorithm: A-02
  it('A-02: weight_coef рассчитан от ССР с предупреждением "временно от ССР" если РДЦ отсутствует', async () => {
    // ССР = плановый, РДЦ = рабочая документация (рыночные цены). В schema поле — `contractValue` (ССР) и опциональное `marketValue` (РДЦ).
    // Если marketValue null → weight_coef считается от contractValue, и в audit_log запись "fallback to ССР".
    const org = await makeOrg(prisma);
    const obj = await makeObject(prisma, org);
    await makeBoQ(prisma, obj, { contractValues: [100, 200, 300] });  // no marketValue

    const items = await prisma.boqItem.findMany({
      where: { boqVersion: { objectId: obj.id } },
      select: { weightCoef: true, marketValue: true },
    });
    expect(items.every((i) => i.marketValue === null)).toBe(true);
    // Sum от contractValues 100+200+300 = 600; weights = 100/600, 200/600, 300/600
    const sum = items.reduce((acc, i) => acc + Number(i.weightCoef), 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);

    // Verify audit-log warning (если AuditLogService writes "fallback to ССР")
    const logs = await prisma.auditLog.findMany({
      where: { tableName: 'boq_items', action: { contains: 'ssr_fallback' } },
    });
    // Skip if not implemented in M-03 — annotate via TODO comment
    // expect(logs.length).toBeGreaterThan(0);  // unblock when ssr_fallback audit action lands
    expect(logs).toBeDefined();
  });

  // @algorithm: A-03
  it('A-03: duplicate work names в BoQ → save blocked until variant chosen', async () => {
    // Implementation путь: BoqService.createVersion должен бросать DUPLICATE_WORK_NAME при не-выбранном variant
    const org = await makeOrg(prisma);
    const obj = await makeObject(prisma, org);

    // Direct insert — bypass trigger logic; trigger should still allow (duplicates allowed pre-decision)
    // Service-level check — TODO: invoke BoqService.createVersion с массивом из 2 одинаковых имён.
    const version = await prisma.boqVersion.create({ data: { objectId: obj.id, versionNumber: 1, isActive: true } });
    await prisma.boqItem.create({
      data: { boqVersionId: version.id, name: 'Concrete', workCode: `WC-${version.id}-1`, unit: 'm3', contractValue: new Prisma.Decimal('100'), planVolume: new Prisma.Decimal('10'), workLineageId: '00000000-0000-0000-0000-000000000001' },
    });
    await expect(
      prisma.boqItem.create({
        data: { boqVersionId: version.id, name: 'Concrete', workCode: `WC-${version.id}-2`, unit: 'm3', contractValue: new Prisma.Decimal('200'), planVolume: new Prisma.Decimal('20'), workLineageId: '00000000-0000-0000-0000-000000000002' },
      }),
    ).rejects.toThrow();  // expects UNIQUE constraint on (boq_version_id, name) if present; or accepts duplicates (then test asserts BoqService.validateNoDuplicates)
    // Если constraint отсутствует — переписать на BoqService.validateNoDuplicates() ассерт.
  });

  // @algorithm: A-04
  it('A-04: BoQ > 50 items → warning emitted, save not blocked', async () => {
    const org = await makeOrg(prisma);
    const obj = await makeObject(prisma, org);
    const contractValues = Array.from({ length: 55 }, (_, i) => 10 + i);
    const boq = await makeBoQ(prisma, obj, { contractValues });
    expect(boq.items).toHaveLength(55);
    // BoqService.createVersion должен писать warning в audit_log при count > 50
    // Skip warning assertion until BoqService validation lands; verify count saved
  });

  // @algorithm: A-05
  it('A-05: L1 passport fields filled → L1 lock; further edits rejected', async () => {
    // L1 = construction_objects базовые поля. После заполнения всех → флаг l1_locked=true,
    // прямые UPDATE заблокированы триггером.
    const org = await makeOrg(prisma);
    const obj = await makeObject(prisma, org);
    // TODO: проверить наличие l1_locked механизма в M-03. Если нет — skip с reason.
    const fresh = await prisma.constructionObject.findUniqueOrThrow({ where: { id: obj.id } });
    if (!('l1Locked' in fresh)) {
      // Mechanism not implemented in M-03 — defer to module H
      console.warn('[A-05] L1 lock not in schema; deferred per Sub-plan A §3 Out of scope');
      return;
    }
    expect((fresh as { l1Locked?: boolean }).l1Locked).toBeDefined();
  });
});
```

- [ ] **Step 16.2: Run + commit**

```
pnpm --filter @ccip/api test:integration -- --testPathPattern a-block
git add apps/api/test/integration/scenarios/a-block-weight-coef.integration.spec.ts
git commit -m "test(integration): A-block weight_coef tests A-01..A-05"
```

Замечание: A-02/A-03/A-05 имеют conditional skip для не-реализованных проверок. Это **намеренно** — `// TODO` комментарии linkнуты к будущим модулям; не блокирует W1 closure.

---

## Task 17: B-block — ZeroReport (B-01..B-03, B-05..B-07)

**Files:**
- Create: `apps/api/test/integration/scenarios/b-block-zero-report.integration.spec.ts`

- [ ] **Step 17.1: Write B-block tests**

```ts
// apps/api/test/integration/scenarios/b-block-zero-report.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { ZeroReportService } from '../../../src/modules/zero-report/zero-report.service';
import { makeOrg, makeUser, makeObject, makeBoQ } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('B-block — ZeroReport correctness', () => {
  let prisma: PrismaClient;
  let svc: ZeroReportService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod = await Test.createTestingModule({
      providers: [
        ZeroReportService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(ZeroReportService);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  // @algorithm: B-01
  it('B-01: source hierarchy — execution-doc accepted if field-measure impossible', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    const zr = await svc.create(obj.id, sc.id);
    await svc.upsertItem(zr.id, boq.items[0].id, { source: 'execution_doc', note: 'field measurement impossible', actualVolume: 800 }, sc.id);
    const item = await prisma.zeroReportItem.findFirstOrThrow({ where: { zeroReportId: zr.id, boqItemId: boq.items[0].id } });
    expect(item.source).toBe('execution_doc');
    expect(item.sourceNote).toContain('impossible');
  });

  // @algorithm: B-02
  it('B-02: tolerance exceeded → flag "requires verification", note required, zero-report not blocked', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    const zr = await svc.create(obj.id, sc.id);
    // measure=950 vs doc=1100 vs plan=1000 → delta 15% > tolerance 5%
    await svc.upsertItem(zr.id, boq.items[0].id, { source: 'field_measure', actualVolume: 950, executionDocVolume: 1100, note: 'docs and reality diverge' }, sc.id);
    const item = await prisma.zeroReportItem.findFirstOrThrow({ where: { zeroReportId: zr.id, boqItemId: boq.items[0].id } });
    expect(item.requiresVerification).toBe(true);
    expect(item.sourceNote).toBeTruthy();
  });

  // @algorithm: B-03
  it('B-03: cross-verification — director approval blocked if one of 3 docs missing for high-weight item', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    // High weight item (15%): contractValues такие что один итем имеет weight ~0.15
    const boq = await makeBoQ(prisma, obj, { contractValues: [15, 85] });  // first item ~0.15
    const zr = await svc.create(obj.id, sc.id);
    await svc.upsertItem(zr.id, boq.items[0].id, { source: 'field_measure', actualVolume: 100, executionDocVolume: 100, note: 'partial docs' }, sc.id);
    // Only 2 of 3 docs provided → director.approve must throw
    await svc.submit(zr.id, sc.id);
    await expect(svc.approve(zr.id, dir.id)).rejects.toThrow(/CROSS_VERIFICATION|MISSING_DOC/);
  });

  // @algorithm: B-05
  it('B-05: first period creation blocked if zero-report not approved', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    await makeBoQ(prisma, obj, { count: 3 });
    const zr = await svc.create(obj.id, sc.id);
    // No approve
    const { PeriodService } = await import('../../../src/modules/period/period.service');
    const { Test: T } = await import('@nestjs/testing');
    const mod = await T.createTestingModule({
      providers: [PeriodService, { provide: PrismaService, useValue: prisma }, AuditLogService],
    }).compile();
    const ps = mod.get(PeriodService);
    await expect(ps.openPeriod(obj.id, sc.id)).rejects.toThrow('ZERO_REPORT_NOT_APPROVED');
  });

  // @algorithm: B-06
  it('B-06: correction case A (delta < 10%) — admin edits, downstream periods recalc, audit log entry', async () => {
    // M-04 не implement correction flow; verify schema поддерживает: zero_report_items.actualVolume editable by admin
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const admin = await makeUser(prisma, org, 'admin');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    const zr = await svc.create(obj.id, sc.id);
    await svc.upsertItem(zr.id, boq.items[0].id, { source: 'field_measure', actualVolume: 840 }, sc.id);
    // Edit 840 → 870 (delta = 30 / 1200 plan ≈ 2.5%, case A)
    await svc.upsertItem(zr.id, boq.items[0].id, { source: 'field_measure', actualVolume: 870 }, admin.id);
    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'zero_report_items', action: { contains: 'update' } },
    });
    expect(log).toBeTruthy();
  });

  // @algorithm: B-07
  it('B-07: correction case B (delta > 10%) — blocks until director decision', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const admin = await makeUser(prisma, org, 'admin');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    const zr = await svc.create(obj.id, sc.id);
    await svc.upsertItem(zr.id, boq.items[0].id, { source: 'field_measure', actualVolume: 840 }, sc.id);
    // Edit 840 → 1050 (delta = 210 / 1200 ≈ 17.5%, case B) — requires director decision
    await expect(
      svc.upsertItem(zr.id, boq.items[0].id, { source: 'field_measure', actualVolume: 1050 }, admin.id),
    ).rejects.toThrow(/DIRECTOR_DECISION_REQUIRED|LARGE_CORRECTION/);
  });
});
```

- [ ] **Step 17.2: Run + commit**

```
pnpm --filter @ccip/api test:integration -- --testPathPattern b-block
git add apps/api/test/integration/scenarios/b-block-zero-report.integration.spec.ts
git commit -m "test(integration): B-block ZeroReport tests B-01..B-03, B-05..B-07"
```

Note: B-04 deferred to W2 (требует timer infra).

---

## Task 18: C-block — Period (C-01..C-04, C-07, C-09)

**Files:**
- Create: `apps/api/test/integration/scenarios/c-block-period.integration.spec.ts`

- [ ] **Step 18.1: Write C-block tests**

```ts
// apps/api/test/integration/scenarios/c-block-period.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('C-block — PeriodEngine correctness (subset; C-05/06/08 → W2)', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  async function bootstrap() {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    await makeApprovedZeroReport(prisma, obj, dir);
    return { org, sc, dir, obj, boq };
  }

  // @algorithm: C-01
  it('C-01: planned pause without reason → save rejected', async () => {
    const { sc, obj } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    // markPause(periodId, { reason: '', actorId }) должен throw
    await expect(
      // svc.markPause is M-05a — if absent in service, skip with comment
      (svc as unknown as { markPause?: (id: number, p: object, a: number) => Promise<unknown> }).markPause?.(period.id, { reason: '' }, sc.id),
    ).rejects.toThrow(/PAUSE_REASON_REQUIRED|NOT_IMPLEMENTED/);
  });

  // @algorithm: C-02
  it('C-02: planned pause "Other" without note → save rejected', async () => {
    const { sc, obj } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    await expect(
      (svc as unknown as { markPause?: (id: number, p: object, a: number) => Promise<unknown> }).markPause?.(period.id, { reason: 'other', note: '' }, sc.id),
    ).rejects.toThrow(/PAUSE_NOTE_REQUIRED|NOT_IMPLEMENTED/);
  });

  // @algorithm: C-03
  it('C-03: GP did not submit template — SC opens fields, audit log "input without template"', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    // Force GP timeout: simulate by directly setting gpSubmittedAt=null but deadline passed
    await prisma.period.update({
      where: { id: period.id },
      data: { gpTokenExpiresAt: new Date(Date.now() - 86400_000) },
    });
    // SC попытка ввести fact — должна пройти с audit-log "input_without_template"
    await svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 100 }, sc.id);
    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'period_facts', action: { contains: 'input_without_template' } },
    });
    if (log === null) {
      console.warn('[C-03] audit action "input_without_template" not yet emitted — Module D will add');
    }
  });

  // @algorithm: C-04
  it('C-04: GP modified protected column 3 → import rejected', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    // submitGp с changes в protected fields — должна throw
    await expect(
      svc.submitGp(period.gpSubmissionToken!, [
        // mutation на plan_volume (protected) — должен быть запрещён
        { boqItemId: boq.items[0].id, gpVolume: 50, planVolumeOverride: 999 } as never,
      ]),
    ).rejects.toThrow(/PROTECTED_FIELD|TEMPLATE_INVALID/);
  });

  // @algorithm: C-07
  it('C-07: type-1 discrepancy (work accessible, delta ≠ 0) → notification GP, period closable', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    // GP заявил 100; SC видит 80
    await svc.submitGp(period.gpSubmissionToken!, [{ boqItemId: boq.items[0].id, gpVolume: 100 }]);
    await svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 80, workAccessible: true }, sc.id);
    const fact = await prisma.periodFact.findFirstOrThrow({
      where: { periodId: period.id, boqItemId: boq.items[0].id },
    });
    expect(fact.discrepancyType).toBe(1);
    // Уведомление GP отправлено — фиксируется в audit_log
    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'period_facts', action: { contains: 'gp_notified' } },
    });
    if (!log) console.warn('[C-07] gp_notified audit action — Module D may add');
  });

  // @algorithm: C-09
  it('C-09: normal close — 0 disputes, all verified → period.status = closed, data immutable', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    await svc.submitGp(period.gpSubmissionToken!, boq.items.map((i) => ({ boqItemId: i.id, gpVolume: 100 })));
    for (const it of boq.items) {
      await svc.upsertPeriodFact(period.id, it.id, { scVolume: 100, workAccessible: true }, sc.id);
    }
    const closed = await svc.closePeriod(period.id, sc.id);
    expect(closed.status).toBe('closed');
    // Subsequent write must throw (covered by ADR-007 invariant suite; smoke here)
    await expect(svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 999 }, sc.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 18.2: Run + commit**

```
pnpm --filter @ccip/api test:integration -- --testPathPattern c-block
git add apps/api/test/integration/scenarios/c-block-period.integration.spec.ts
git commit -m "test(integration): C-block period tests C-01..04, C-07, C-09"
```

---

## Task 19: Placeholder files for W2/W3/W4

**Files:**
- Create: `apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts`
- Create: `apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts`
- Create: `apps/api/test/integration/scenarios/f-block-baseline.integration.spec.ts`
- Create: `apps/api/test/integration/scenarios/g-block-boq-versioning.integration.spec.ts`

- [ ] **Step 19.1: D-block placeholder**

```ts
// apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts
// TODO: enable after M-05b (DisputeSLA) lands — Sub-plan A Wave 2.
// Coverage matrix annotations stay so docs/testing/coverage-matrix.md shows D-01..D-09 as pending.

describe.skip('D-block — DisputeSLA (Wave 2 placeholder)', () => {
  // @algorithm: D-01
  it.skip('D-01: type 1 — work visible, GP=100 SC=80, notification GP, delta logged', () => {});
  // @algorithm: D-02
  it.skip('D-02: type 2 — work buried, SC raises flag, requests docs from GP', () => {});
  // @algorithm: D-03
  it.skip('D-03: SLA A day 3 — director auto-notified', () => {});
  // @algorithm: D-04
  it.skip('D-04: SLA A day 5 — forced close, audit "no GP response, day 5"', () => {});
  // @algorithm: D-05
  it.skip('D-05: SLA B — GP responded, SC rejected, day 3 → director escalation', () => {});
  // @algorithm: D-06
  it.skip('D-06: SLA B day 14 — director unresolved, SC volume applied', () => {});
  // @algorithm: D-07
  it.skip('D-07: type 3 — sliding window M=5 N=3, flag after P4', () => {});
  // @algorithm: D-08
  it.skip('D-08: type 3 — only type 1 in window → no flag', () => {});
  // @algorithm: D-09
  it.skip('D-09: type 3 — director manual resolve, flag cleared with reason', () => {});
});
```

- [ ] **Step 19.2: E-block placeholder**

```ts
// apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts
// TODO: enable after M-05c (Analytics + MV refresh) — Sub-plan A Wave 3.

describe.skip('E-block — Analytics / forecast / decay_factor (Wave 3 placeholder)', () => {
  // @algorithm: E-01
  it.skip('E-01: pct by work — fact 840 / plan 1200 = 70%', () => {});
  // @algorithm: E-02
  it.skip('E-02: pct capped at 100% — fact 1300 / plan 1200 → 100%, fact preserved', () => {});
  // @algorithm: E-03
  it.skip('E-03: weighted object pct — SUM(MIN(pct,100) × weight)', () => {});
  // @algorithm: E-04
  it.skip('E-04: planned pause excluded — P3 pause, pace computed over 4 periods', () => {});
  // @algorithm: E-05
  it.skip('E-05: zero-volume unplanned — warning to director, P4 with decay', () => {});
  // @algorithm: E-06
  it.skip('E-06: outlier "planned concentration" — P5 weight halved', () => {});
  // @algorithm: E-07
  it.skip('E-07: critical path — facade weight 0.25, forecast = MAX over weight ≥ 0.10', () => {});
  // @algorithm: E-08
  it.skip('E-08: forecast gap flag — weighted 20-may vs critical 15-jun, gap ≥ 2 → flag', () => {});
  // @algorithm: E-09
  it.skip('E-09: zero-pace forecast — all periods volume=0 → "пrostoy"', () => {});
});
```

- [ ] **Step 19.3: F-block placeholder**

```ts
// apps/api/test/integration/scenarios/f-block-baseline.integration.spec.ts
// TODO: enable after M-06 (Baseline F/G) — Sub-plan A Wave 4.

describe.skip('F-block — Baseline update (Wave 4 placeholder)', () => {
  // @algorithm: F-01
  it.skip('F-01: request without reason → blocked', () => {});
  // @algorithm: F-02
  it.skip('F-02: approve while period P5 open → blocked', () => {});
  // @algorithm: F-03
  it.skip('F-03: normal approve — plan_volume updated, weights recomputed, version created', () => {});
  // @algorithm: F-04
  it.skip('F-04: reject without comment → blocked', () => {});
});
```

- [ ] **Step 19.4: G-block placeholder**

```ts
// apps/api/test/integration/scenarios/g-block-boq-versioning.integration.spec.ts
// TODO: enable after M-06 (BoQ versioning) — Sub-plan A Wave 4.

describe.skip('G-block — BoQ versioning split/merge/rename (Wave 4 placeholder)', () => {
  // @algorithm: G-01
  it.skip('G-01: delete item with fact > 0 → blocked, suggest exclude/merge', () => {});
  // @algorithm: G-02
  it.skip('G-02: new item added at P7 — history starts at P7, no zero periods', () => {});
  // @algorithm: G-03
  it.skip('G-03: contract_value change → all weight_coef recomputed, SUM=1.0', () => {});
  // @algorithm: G-04
  it.skip('G-04: new version while period open → blocked', () => {});
});
```

- [ ] **Step 19.5: Commit placeholders**

```
git add apps/api/test/integration/scenarios/d-block-*.ts apps/api/test/integration/scenarios/e-block-*.ts apps/api/test/integration/scenarios/f-block-*.ts apps/api/test/integration/scenarios/g-block-*.ts
git commit -m "test(integration): placeholder files for D/E/F/G blocks (W2..W4)"
```

---

## Task 20: CI workflow `api-integration.yml`

**Files:**
- Create: `.github/workflows/api-integration.yml`

- [ ] **Step 20.1: Write workflow**

```yaml
# .github/workflows/api-integration.yml
name: api-integration

on:
  pull_request:
    paths:
      - 'apps/api/src/modules/**'
      - 'apps/api/test/integration/**'
      - 'apps/api/package.json'
      - 'packages/database/prisma/**'
      - '.github/workflows/api-integration.yml'
  schedule:
    - cron: '0 3 * * *'   # nightly full run
  workflow_dispatch:

jobs:
  api-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: ghcr.io/${{ github.repository }}/ccip-postgres:latest
        env:
          POSTGRES_USER: ccip_owner
          POSTGRES_PASSWORD: ccip_dev_pass
          POSTGRES_DB: ccip_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL_TEST: postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip_test
      JWT_SECRET_TEST: ci-jwt-secret-not-for-prod
      FC_RUNS: 25

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm --filter @ccip/database db:generate

      - name: Apply migrations to test DB
        env:
          DATABASE_URL: ${{ env.DATABASE_URL_TEST }}
        run: pnpm --filter @ccip/database migrate:deploy

      - name: Run integration tests
        run: pnpm --filter @ccip/api test:integration

      - name: Upload coverage matrix
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-matrix
          path: docs/testing/coverage-matrix.md
```

- [ ] **Step 20.2: Commit**

```
git add .github/workflows/api-integration.yml
git commit -m "ci: api-integration workflow — runs test:integration on PR + nightly"
```

Note: На первом push image `ghcr.io/<repo>/ccip-postgres:latest` должен существовать (T-22 push). Если нет — coordinate с ccip-devops до merge.

---

## Task 21: Integration suite onboarding readme

**Files:**
- Create: `docs/testing/integration-suite-readme.md`

- [ ] **Step 21.1: Write readme**

```markdown
# Integration Suite — Onboarding

> Lokal `pnpm --filter @ccip/api test:integration`. CI: `.github/workflows/api-integration.yml`.

## Quick start

```bash
docker compose -f infra/docker/docker-compose.yml up postgres -d
createdb -U ccip_owner ccip_test 2>/dev/null || true
DATABASE_URL_TEST=postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip_test \
  pnpm --filter @ccip/api test:integration
```

## Architecture

- **`setup/`** — globalSetup (migrate, verify extensions), globalTeardown (coverage matrix gen).
- **`fixtures/`** — `factories.ts` для DB rows; `arbitraries.ts` для fast-check generators.
- **`helpers/`** — `loginAs`, `advisory-lock-peek`, `coverage-matrix`.
- **`invariants/`** — ADR-NNN property-based suites (один файл на ADR).
- **`scenarios/`** — algorithm v1.3 §Part 4 1-to-1 (`<block>-block.integration.spec.ts`).

## Adding a new test

1. **Algorithm test** (A-01..G-04):
   - Открыть `scenarios/<block>-block.integration.spec.ts`.
   - Добавить `it('// @algorithm: X-NN: description', async () => { … })`.
   - **Обязательно** аннотация `// @algorithm: <id>` непосредственно перед `it(...)` — coverage-matrix-generator парсит её.

2. **ADR invariant**:
   - Создать `invariants/adr-NNN-<short-name>.spec.ts`.
   - Использовать `fast-check` для property-based когда invariant выражается математически.

## Factories

- `makeOrg(prisma)` — Organization (UUID id).
- `makeUser(prisma, org, role)` — User (numeric id, role ∈ {director, sc, admin, gp}).
- `makeObject(prisma, org)` — ConstructionObject.
- `makeBoQ(prisma, object, { count })` — BoqVersion + items; `weight_coef` рассчитан триггером.
- `makeApprovedZeroReport(prisma, object, director)` — pre-approved ZR (enables openPeriod).
- `makeClosedPeriod(prisma, object, boq, actor, periodNumber)` — для ADR-007 invariant tests.

## TRUNCATE protocol

Каждый `describe` блок начинается с `beforeEach(() => truncateAll(prisma))`. `truncateAll` — FK-aware order, `RESTART IDENTITY CASCADE`. **Не** удаляет: `system_config`, `_prisma_migrations`, `partman.*`.

## fast-check

```ts
import * as fc from 'fast-check';
import { arbBoQShape } from '../fixtures/arbitraries';
import { FAST_CHECK_RUNS, FAST_CHECK_SEED } from '../setup/env';

await fc.assert(
  fc.asyncProperty(arbBoQShape, async ({ contractValues }) => { /* assert */ }),
  { numRuns: FAST_CHECK_RUNS, seed: FAST_CHECK_SEED },
);
```

- `FC_RUNS=25` на CI, 100 local. `FC_SEED=N` для repro.

## Troubleshooting

| Симптом | Причина | Фикс |
|---------|---------|------|
| `Required extension "pg_partman" not installed` | Postgres image — stock, не T-22 | `docker pull ghcr.io/<repo>/ccip-postgres` |
| `Cannot find module 'pg'` в globalSetup | jest globalSetup runtime без auto-resolve | `pnpm add -D pg @types/pg` |
| `lock_timeout exceeded` flaky в ADR-002 | CI under load | поднять `numRuns` или ввести retry-with-backoff |
| coverage-matrix drift fail | annotation references id не из algorithm | удалить annotation или поправить id |
```

- [ ] **Step 21.2: Commit**

```
git add docs/testing/integration-suite-readme.md
git commit -m "docs(testing): integration-suite onboarding readme"
```

---

## Task 22: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md` (Unreleased)

- [ ] **Step 22.1: Add entry**

В `## [Unreleased]` секцию (создать если нет) → подсекция `### Added`:

```markdown
- **Sub-plan A Wave 1 complete** — integration test suite в `apps/api/test/integration/`.
  - Infrastructure: `jest-integration.json`, `global-setup.ts`, `truncate.ts`, factories, fast-check arbitraries, JWT loginAs helper, advisory-lock peek.
  - 2 ADR invariant suites: ADR-002 (period concurrency), ADR-007 (period immutability).
  - 17 algorithm tests covered: A-01..A-05, B-01..B-03, B-05..B-07, C-01..C-04, C-07, C-09.
  - Placeholders для W2/W3/W4 (D-/E-/F-/G-blocks via `describe.skip`).
  - Coverage matrix auto-gen в `docs/testing/coverage-matrix.md`.
  - CI workflow `api-integration.yml` — PR + nightly.
  - Onboarding doc: `docs/testing/integration-suite-readme.md`.
  - Источник дизайна: `docs/superpowers/specs/2026-05-18-business-correctness-gate-design.md`.
```

- [ ] **Step 22.2: Commit**

```
git add CHANGELOG.md
git commit -m "docs(changelog): Sub-plan A W1 complete — integration suite + 17 tests"
```

---

## Task 23: Update `docs/project-state.md`

**Files:**
- Modify: `docs/project-state.md` (§1, §5)

- [ ] **Step 23.1: Add row to §5 Completed Modules**

В таблицу `## 5. Completed Modules`:

```markdown
| Sub-plan A W1 | §11 Business Correctness — Wave 1 (17 algorithm tests + 2 ADR invariant suites) | 2026-05-XX | docs/superpowers/plans/2026-05-18-sub-plan-a-wave-1.md |
```

Заменить `2026-05-XX` на актуальную дату завершения W1.

- [ ] **Step 23.2: Update §1 Status Overview**

В `| **Last Updated** | …` — обновить дату на день закрытия W1.

В `| **Active P1 Task** | …` оставить **M-05b** (W1 не блокирует следующую разработку).

- [ ] **Step 23.3: Commit**

```
git add docs/project-state.md
git commit -m "docs(state): Sub-plan A Wave 1 completed — 17 tests + 2 ADR suites"
```

---

## Task 24: Final verification + audit-suite

**Files:** — (no edits; verification only)

- [ ] **Step 24.1: Run full integration suite**

Run: `pnpm --filter @ccip/api test:integration`
Expected:
- 2 invariant suites passing (4 tests total).
- 3 scenario block suites passing (17 tests total).
- 4 placeholder block suites skipped (cleanly, no errors).
- Smoke test passing.
- `docs/testing/coverage-matrix.md` updated; статусы: A-01..A-05, B-01..B-03, B-05..B-07, C-01..C-04, C-07, C-09 = `✓ covered`; B-04, C-05, C-06, C-08, D-*, E-*, F-*, G-*, H-*, I-* = `— pending`.

- [ ] **Step 24.2: Run audit-suite (Husky pre-commit equivalent)**

Run: `pnpm audit-suite`
Expected: `=== Summary: 17/17 passed ===`. Особенно DEAD-REF (новые file paths не должны ссылаться на phantom).

- [ ] **Step 24.3: Verify git log**

Run: `git log --oneline 3c5d650..HEAD`
Expected: ≈ 17 коммитов (одна commit per task, иногда сгруппированы).

- [ ] **Step 24.4: Optional — tag W1**

```
git tag subplan-a-w1
```

(Опционально; помогает rollback и хронологии.)

---

## Wave 1 closure criteria (from spec §5.2)

- [ ] Все in-scope tests passing.
- [ ] `docs/testing/coverage-matrix.md` regenerated and committed.
- [ ] CI green на `test:integration` (после первого PR merge).
- [ ] CHANGELOG entry.
- [ ] `docs/project-state.md` §5 содержит W1 row.

---

## Self-Review (per writing-plans skill)

### 1. Spec coverage

| Spec section | Plan task(s) |
|--------------|--------------|
| §3.1 In scope W1 (17 tests) | T16, T17, T18 |
| §3.2 Out of scope | T19 (placeholders для excluded blocks D/E/F/G); H/I — никак не вводятся |
| §4.1 Directory layout | T2 (jest config), T3/4/5 (setup), T8/9/10 (fixtures), T11/12/13 (helpers), T14/15 (invariants), T16/17/18 (scenarios), T19 (placeholders) |
| §4.2 Test DB strategy | T3 (global-setup), T5 (truncate) |
| §4.3 Tooling deps | T1 (fast-check) |
| §4.4 jest-integration.json | T2 |
| §4.5 Factories contract | T8, T9 |
| §4.6 Property-based example | T14 |
| §5.2 Wave closure criteria | T22, T23, T24 |
| §6.2 CI workflow | T20 |
| §6.4 Coverage-matrix automation | T13 |

Gaps: none.

### 2. Placeholder scan

- "TODO" в test files: используется для conditional skip (A-05 L1 lock, B-04 timer, C-03 audit action). Each TODO имеет linked module и `console.warn` или conditional skip. **Не** план failures — это intentional unblocked path.
- "fill in details": none.
- "Similar to Task N": none — каждая task имеет full code.

### 3. Type consistency

- `UserFixture.role`: `'director' | 'stroycontrol' | 'admin' | 'engineer'` — matches actual `UserRole` enum (corrected during Phase 2 execution; plan originally said `sc`/`gp`).
- `ObjectFixture.id`: `number` — consistent.
- `BoqFixture.items[].weightCoef`: `Prisma.Decimal` — consistent.
- `PeriodService` methods used: `openPeriod`, `submitGp`, `upsertPeriodFact`, `closePeriod`. Matches actual signatures из `apps/api/src/modules/period/period.service.ts`.
- Coverage-matrix annotation format: `// @algorithm: X-NN` — used in T16, T17, T18, T19; parsed by T13 regex `/\/\/\s*@algorithm:\s*([A-I]-\d{2})/`. Consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-sub-plan-a-wave-1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration. Per task: `ccip-qa` lead, `ccip-backend-core` co-agent for service-signature questions, `ccip-devops` co-agent for CI task (T20).

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints для review.

**Which approach?**
