// apps/api/test/integration/fixtures/factories.ts
import { PrismaClient, Prisma } from '@ccip/database';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

// ─── NOTE: Schema corrections applied (deviations from plan) ─────────────────
// Plan used role 'sc' and 'gp' — actual enum values: admin|director|stroycontrol|engineer
// Plan omitted Organization.slug (required unique field) — added below
// Plan omitted BoqItem.workCode (required, unique per version) — added below
// Plan used BoqItem.workName — actual field is: name
// Plan used BoqVersion.versionNumber as Int — actual type is String
// Plan omitted ZeroReport.boqVersionId (required FK) — added below
// ConstructionObject has no gcUserId field — plan overrides arg adapted to createdBy

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
      // slug is required unique — derive from name or generate unique value
      slug: overrides.name
        ? overrides.name.toLowerCase().replace(/\s+/g, '-').slice(0, 60) + '-' + randomUUID().slice(0, 6)
        : `org-${randomUUID().slice(0, 8)}`,
    },
  });
  return { id: org.id, name: org.name };
}

// UserRole enum values: admin | director | stroycontrol | engineer
// Plan used 'sc' → mapped to 'stroycontrol'; plan used 'gp' → mapped to 'engineer'
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
      name: `Test ${role}`,
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
  overrides: Partial<{ name: string; createdBy: number | null }> = {},
): Promise<ObjectFixture> {
  const obj = await prisma.constructionObject.create({
    data: {
      organizationId: org.id,
      name: overrides.name ?? `Object ${randomUUID().slice(0, 6)}`,
      createdBy: overrides.createdBy ?? null,
    },
  });
  return { id: obj.id, organizationId: obj.organizationId, name: obj.name };
}

// ─── BoQ ─────────────────────────────────────────────────────────────────────

export interface BoqFixture {
  versionId: number;
  items: Array<{ id: number; workLineageId: string; contractValue: Prisma.Decimal; planVolume: Prisma.Decimal; weightCoef: Prisma.Decimal | null }>;
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
    data: { objectId: object.id, versionNumber: '1', isActive: true },
  });
  const values =
    opts.contractValues ??
    Array.from({ length: opts.count ?? 5 }, () => 10 + Math.random() * 90);
  const items: BoqFixture['items'] = [];
  for (let i = 0; i < values.length; i++) {
    const item = await prisma.boqItem.create({
      data: {
        boqVersionId: version.id,
        workCode: `WC-${version.id}-${i + 1}`,
        name: `Work ${i + 1}`,
        unit: 'm3',
        contractValue: new Prisma.Decimal(values[i].toFixed(2)),
        planVolume: new Prisma.Decimal('100.00'),
        workLineageId: randomUUID(),
        // weight_coef set by trigger trg_boq_items_weight_coef (or null if trigger absent in test DB)
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

// ─── ZeroReport ──────────────────────────────────────────────────────────────

export async function makeApprovedZeroReport(
  prisma: PrismaClient,
  object: ObjectFixture,
  director: UserFixture,
  boqVersionId?: number,
): Promise<{ id: number }> {
  // ZeroReport.boqVersionId is required — resolve from object's active boq version if not provided
  let resolvedBoqVersionId = boqVersionId;
  if (!resolvedBoqVersionId) {
    const activeVersion = await prisma.boqVersion.findFirst({
      where: { objectId: object.id, isActive: true },
      select: { id: true },
    });
    if (!activeVersion) {
      throw new Error(
        `makeApprovedZeroReport: object ${object.id} has no active BoQ version. ` +
          `Call makeBoQ first or pass boqVersionId explicitly.`,
      );
    }
    resolvedBoqVersionId = activeVersion.id;
  }
  const zr = await prisma.zeroReport.create({
    data: {
      objectId: object.id,
      boqVersionId: resolvedBoqVersionId,
      status: 'approved',
      approvedBy: director.id,
      approvedAt: new Date(),
    },
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
