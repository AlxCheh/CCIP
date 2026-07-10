# M-06: Baseline Update (F/G) + GC Change (H) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UpdateBaseline (Блок F/G) and смена ГП (Блок H) per `docs/delivery/phase-4-7-backend-modules.md` §6.1–6.2, closing module M-06 in `docs/project-state.md`.

**Architecture:** Two independent features in the `ccip-backend-core` domain, both gated by "period not open" and both versioned/audited. UpdateBaseline creates a new `BoqVersion` (full item copy, one item's `plan_volume` changed, `work_lineage_id` inherited per ADR-006 rename rule, old version deactivated) — mirrors the existing `BoqService.createInitial` pattern in `apps/api/src/modules/boq/boq.service.ts`. GC change is an SCD Type 2 swap on `ObjectParticipant` — mirrors the existing `ObjectsService.addParticipant` pattern in `apps/api/src/modules/objects/objects.service.ts`, but lives in a new `ObjectParticipantsService` per the artifact name in the phase file, with two extra guards (no open period, zero open discrepancies) that generic participant management doesn't need. Both actions are audit-logged via the existing `AuditLogService`.

**Tech Stack:** NestJS, Prisma (`@ccip/database`), PostgreSQL, class-validator, Jest.

---

## Design Notes (read before starting)

- **Schema is already complete** — `BaselineUpdateRequest` model exists at `packages/database/prisma/schema.prisma:480-503` with all fields needed (`objectId`, `boqItemId`, `oldPlanVolume`, `newPlanVolume`, `reason`, `supportingDocument`, `status`, `reviewedBy`, `reviewedAt`, `reviewNotes`, `appliesFromPeriodId`). No migration needed.
- **`versionNumber` increment scheme:** new versions increment the minor by `0.1` (`"1.0"` → `"1.1"` → `"1.2"`), computed as `(parseFloat(current) + 0.1).toFixed(1)`. This is a new convention (only `"1.0"` exists today via `createInitial`) — documented here since ADR-006 doesn't pin it down.
- **weight_coef recompute:** handled entirely by the existing DB trigger on `boq_items` INSERT (same trigger `BoqService.createInitial` relies on). We never compute it manually — we just re-insert all items into the new version and verify `SUM(weight_coef) ≈ 1.0` afterward, exactly like `createInitial` does.
- **Lineage:** per ADR-006's "rename" branch (this is a single-item plan_volume edit, not a split/merge), every copied item — including the unchanged ones — keeps its `work_lineage_id`, and gets `predecessorItemId` pointed at the old-version item it was copied from. No rows are written to `boq_item_lineage_links` (that table is only for split/merge).
- **Out of scope (explicitly, per phase file):** §6.3 (Admin-correct-fact) and §6.4 (Notifications) are separate phase-file items not named in M-06's title in `project-state.md` — not touched by this plan. GC-change notification to the new GC ("§10.3 пробел" in the phase file) is an explicit documented gap, not implemented here.
- **Why a new `ObjectParticipantsService` instead of extending `ObjectsService.addParticipant`:** the phase file names this exact artifact, and `addParticipant` is already tested (M-03, done) generic participant CRUD with no business guards — adding GC-specific guards there would conflate a generic operation with a governance-gated one. Small duplication of the SCD2 swap block is accepted to keep the already-shipped `ObjectsService` untouched.

## File Structure

- Create: `apps/api/src/modules/baseline/baseline.module.ts`
- Create: `apps/api/src/modules/baseline/baseline.service.ts`
- Create: `apps/api/src/modules/baseline/baseline.controller.ts`
- Create: `apps/api/src/modules/baseline/dto/create-baseline-update-request.dto.ts`
- Create: `apps/api/src/modules/baseline/dto/approve-baseline-update.dto.ts`
- Create: `apps/api/src/modules/baseline/baseline.service.spec.ts`
- Create: `apps/api/src/modules/baseline/baseline.controller.spec.ts`
- Create: `apps/api/src/modules/objects/object-participants.service.ts`
- Create: `apps/api/src/modules/objects/dto/change-general-contractor.dto.ts`
- Create: `apps/api/src/modules/objects/object-participants.service.spec.ts`
- Modify: `apps/api/src/modules/objects/objects.module.ts`
- Modify: `apps/api/src/modules/objects/objects.controller.ts`
- Modify: `apps/api/src/modules/objects/objects.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `docs/project-state.md`
- Modify: `docs/delivery/phase-4-7-backend-modules.md`

---

### Task 1: Baseline module DTOs

**Files:**
- Create: `apps/api/src/modules/baseline/dto/create-baseline-update-request.dto.ts`
- Create: `apps/api/src/modules/baseline/dto/approve-baseline-update.dto.ts`

No test file — DTOs are declarative `class-validator` shapes; the codebase has no `*.dto.spec.ts` precedent (checked `boq/dto/`, `objects/dto/`).

- [ ] **Step 1: Write `create-baseline-update-request.dto.ts`**

```typescript
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBaselineUpdateRequestDto {
  @IsInt()
  boqItemId: number;

  @IsNumber()
  @IsPositive()
  newPlanVolume: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  supportingDocument?: string;
}
```

- [ ] **Step 2: Write `approve-baseline-update.dto.ts`**

```typescript
import { IsInt, IsOptional, IsString } from 'class-validator';

export class ApproveBaselineUpdateDto {
  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @IsOptional()
  @IsInt()
  appliesFromPeriodId?: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/baseline/dto/create-baseline-update-request.dto.ts apps/api/src/modules/baseline/dto/approve-baseline-update.dto.ts
git commit -m "feat(baseline): add DTOs for baseline update request/approve"
```

---

### Task 2: `BaselineService.createRequest`

**Files:**
- Create: `apps/api/src/modules/baseline/baseline.service.ts`
- Test: `apps/api/src/modules/baseline/baseline.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BaselineService } from './baseline.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const OBJECT_ID = 10;

const mockUser = { organizationId: ORG_ID };
const mockObject = { organizationId: ORG_ID };

const makeDto = (
  overrides: Partial<CreateBaselineUpdateRequestDto> = {},
): CreateBaselineUpdateRequestDto => ({
  boqItemId: 1,
  newPlanVolume: 600,
  reason: 'Уточнение объёма по факту обмера',
  ...overrides,
});

describe('BaselineService', () => {
  let service: BaselineService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser) },
      constructionObject: {
        findUnique: jest.fn().mockResolvedValue(mockObject),
      },
      boqItem: {
        findFirst: jest.fn(),
        createMany: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { weightCoef: 1.0 } }),
      },
      boqVersion: {
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      period: { findFirst: jest.fn().mockResolvedValue(null) },
      baselineUpdateRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditLogService>;

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get(BaselineService);
  });

  // ─── createRequest ────────────────────────────────────────────────────────────

  describe('createRequest', () => {
    it('throws NotFoundException when object is outside the user org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.createRequest(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when boqItem is not in the active version', async () => {
      (prisma.boqItem.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createRequest(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('snapshots oldPlanVolume from the current active item and creates a pending request', async () => {
      (prisma.boqItem.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        planVolume: 500,
      });
      (prisma.baselineUpdateRequest.create as jest.Mock).mockResolvedValue({
        id: 7,
        objectId: OBJECT_ID,
        boqItemId: 1,
        oldPlanVolume: 500,
        newPlanVolume: 600,
        reason: 'Уточнение объёма по факту обмера',
        status: 'pending',
        requestedAt: new Date('2026-07-09T10:00:00Z'),
      });

      const result = await service.createRequest(USER_ID, OBJECT_ID, makeDto());

      expect(prisma.baselineUpdateRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            boqItemId: 1,
            requestedBy: USER_ID,
            oldPlanVolume: 500,
            newPlanVolume: 600,
            status: 'pending',
          }),
        }),
      );
      expect(result.status).toBe('pending');
      expect(result.oldPlanVolume).toBe(500);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ccip/api test baseline.service.spec.ts`
Expected: FAIL — `Cannot find module './baseline.service'`

- [ ] **Step 3: Write `baseline.service.ts` (createRequest + shared access check only — approveRequest stubbed to throw for now)**

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';
import { ApproveBaselineUpdateDto } from './dto/approve-baseline-update.dto';

@Injectable()
export class BaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async checkObjectAccess(userId: number, objectId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });
    const obj = await this.prisma.constructionObject.findUnique({
      where: { id: objectId },
      select: { organizationId: true },
    });
    if (!obj || obj.organizationId !== user.organizationId) {
      throw new NotFoundException('OBJECT_NOT_FOUND');
    }
    return obj;
  }

  async createRequest(
    userId: number,
    objectId: number,
    dto: CreateBaselineUpdateRequestDto,
  ) {
    await this.checkObjectAccess(userId, objectId);

    const boqItem = await this.prisma.boqItem.findFirst({
      where: {
        id: dto.boqItemId,
        boqVersion: { objectId, isActive: true },
      },
      select: { id: true, planVolume: true },
    });
    if (!boqItem) {
      throw new NotFoundException('BOQ_ITEM_NOT_IN_ACTIVE_VERSION');
    }

    const request = await this.prisma.baselineUpdateRequest.create({
      data: {
        objectId,
        boqItemId: dto.boqItemId,
        requestedBy: userId,
        oldPlanVolume: boqItem.planVolume,
        newPlanVolume: dto.newPlanVolume,
        reason: dto.reason,
        supportingDocument: dto.supportingDocument,
        status: 'pending',
      },
    });

    return {
      id: request.id,
      objectId: request.objectId,
      boqItemId: request.boqItemId,
      oldPlanVolume: Number(request.oldPlanVolume),
      newPlanVolume: Number(request.newPlanVolume),
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
    };
  }

  async approveRequest(
    _userId: number,
    _requestId: number,
    _dto: ApproveBaselineUpdateDto,
  ): Promise<never> {
    throw new Error('not implemented yet — see Task 3');
  }
}
```

- [ ] **Step 4: Run tests to verify `createRequest` tests pass**

Run: `pnpm --filter @ccip/api test baseline.service.spec.ts`
Expected: PASS (3/3 `createRequest` tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/baseline/baseline.service.ts apps/api/src/modules/baseline/baseline.service.spec.ts
git commit -m "feat(baseline): implement BaselineService.createRequest"
```

---

### Task 3: `BaselineService.approveRequest`

**Files:**
- Modify: `apps/api/src/modules/baseline/baseline.service.ts`
- Modify: `apps/api/src/modules/baseline/baseline.service.spec.ts`

- [ ] **Step 1: Add failing tests for `approveRequest`**

Append inside the `describe('BaselineService', ...)` block, after `createRequest`'s `describe`:

```typescript
  // ─── approveRequest ───────────────────────────────────────────────────────────

  describe('approveRequest', () => {
    const pendingRequest = {
      id: 7,
      objectId: OBJECT_ID,
      boqItemId: 1,
      oldPlanVolume: 500,
      newPlanVolume: 600,
      reason: 'Уточнение объёма по факту обмера',
      supportingDocument: null,
      status: 'pending',
    };

    const activeVersion = {
      id: 1,
      versionNumber: '1.0',
      boqItems: [
        {
          id: 1,
          workLineageId: 'lineage-1',
          workCode: 'W-01',
          name: 'Земляные работы',
          unit: null,
          planVolume: 500,
          contractValue: 600_000,
          isCritical: false,
          status: 'active',
        },
        {
          id: 2,
          workLineageId: 'lineage-2',
          workCode: 'W-02',
          name: 'Бетон фундамент',
          unit: null,
          planVolume: 200,
          contractValue: 400_000,
          isCritical: false,
          status: 'active',
        },
      ],
    };

    beforeEach(() => {
      (prisma.baselineUpdateRequest.findUnique as jest.Mock).mockResolvedValue(
        pendingRequest,
      );
      (prisma.boqVersion.findFirstOrThrow as jest.Mock).mockResolvedValue(
        activeVersion,
      );
      (prisma.boqVersion.create as jest.Mock).mockResolvedValue({
        id: 2,
        versionNumber: '1.1',
      });
      (prisma.baselineUpdateRequest.update as jest.Mock).mockResolvedValue({
        id: 7,
        status: 'approved',
      });
    });

    it('throws NotFoundException when the request does not exist', async () => {
      (prisma.baselineUpdateRequest.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.approveRequest(USER_ID, 999, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the request was already reviewed', async () => {
      (prisma.baselineUpdateRequest.findUnique as jest.Mock).mockResolvedValue({
        ...pendingRequest,
        status: 'approved',
      });

      await expect(
        service.approveRequest(USER_ID, 7, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the object has an open period', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: 5 });

      await expect(
        service.approveRequest(USER_ID, 7, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new BoqVersion with plan_volume overridden only for the target item, lineage inherited', async () => {
      await service.approveRequest(USER_ID, 7, {});

      expect(prisma.boqVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            versionNumber: '1.1',
            changeType: 'baseline_update',
            isActive: true,
          }),
        }),
      );
      expect(prisma.boqItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              workLineageId: 'lineage-1',
              planVolume: 600,
              predecessorItemId: 1,
            }),
            expect.objectContaining({
              workLineageId: 'lineage-2',
              planVolume: 200,
              predecessorItemId: 2,
            }),
          ]),
        }),
      );
    });

    it('deactivates the old version and marks the request approved', async () => {
      await service.approveRequest(USER_ID, 7, { reviewNotes: 'ок' });

      expect(prisma.boqVersion.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
      expect(prisma.baselineUpdateRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: expect.objectContaining({
            status: 'approved',
            reviewedBy: USER_ID,
            reviewNotes: 'ок',
          }),
        }),
      );
    });

    it('throws UnprocessableEntityException when SUM(weight_coef) != 1.0 after re-insert', async () => {
      (prisma.boqItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { weightCoef: 0.5 },
      });

      await expect(
        service.approveRequest(USER_ID, 7, {}),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('writes an audit log entry for the approval', async () => {
      await service.approveRequest(USER_ID, 7, {});

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'boq_versions',
          action: 'baseline_updated',
          performedBy: USER_ID,
          organizationId: ORG_ID,
        }),
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @ccip/api test baseline.service.spec.ts`
Expected: FAIL — `approveRequest` throws `not implemented yet`

- [ ] **Step 3: Replace the `approveRequest` stub with the real implementation**

```typescript
  async approveRequest(
    userId: number,
    requestId: number,
    dto: ApproveBaselineUpdateDto,
  ) {
    const request = await this.prisma.baselineUpdateRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('BASELINE_REQUEST_NOT_FOUND');
    }
    if (request.status !== 'pending') {
      throw new ConflictException('BASELINE_REQUEST_ALREADY_REVIEWED');
    }

    const obj = await this.checkObjectAccess(userId, request.objectId);

    const { newVersion, updatedRequest } = await this.prisma.$transaction(
      async (tx) => {
        const openPeriod = await tx.period.findFirst({
          where: { objectId: request.objectId, status: 'open' },
        });
        if (openPeriod) {
          throw new ConflictException('PERIOD_OPEN_CANNOT_UPDATE_BASELINE');
        }

        const activeVersion = await tx.boqVersion.findFirstOrThrow({
          where: { objectId: request.objectId, isActive: true },
          include: { boqItems: true },
        });

        const nextVersionNumber = (
          parseFloat(activeVersion.versionNumber) + 0.1
        ).toFixed(1);

        const newVersion = await tx.boqVersion.create({
          data: {
            objectId: request.objectId,
            versionNumber: nextVersionNumber,
            changeType: 'baseline_update',
            changeReason: request.reason,
            changeDocument: request.supportingDocument,
            createdBy: userId,
            isActive: true,
          },
        });

        await tx.boqItem.createMany({
          data: activeVersion.boqItems.map((item) => ({
            boqVersionId: newVersion.id,
            workLineageId: item.workLineageId,
            workCode: item.workCode,
            name: item.name,
            unit: item.unit,
            planVolume:
              item.id === request.boqItemId
                ? request.newPlanVolume
                : item.planVolume,
            contractValue: item.contractValue,
            isCritical: item.isCritical,
            status: item.status,
            predecessorItemId: item.id,
          })),
        });

        const agg = await tx.boqItem.aggregate({
          where: { boqVersionId: newVersion.id, status: 'active' },
          _sum: { weightCoef: true },
        });
        const sum = Number(agg._sum.weightCoef ?? 0);
        if (Math.abs(sum - 1.0) > 0.001) {
          throw new UnprocessableEntityException(
            `BOQ_WEIGHT_INVALID: sum of weight_coef is ${sum.toFixed(6)}, expected 1.0.`,
          );
        }

        await tx.boqVersion.update({
          where: { id: activeVersion.id },
          data: { isActive: false },
        });

        const updatedRequest = await tx.baselineUpdateRequest.update({
          where: { id: request.id },
          data: {
            status: 'approved',
            reviewedBy: userId,
            reviewedAt: new Date(),
            reviewNotes: dto.reviewNotes,
            appliesFromPeriodId: dto.appliesFromPeriodId,
          },
        });

        return { newVersion, updatedRequest };
      },
    );

    await this.auditLog.log({
      tableName: 'boq_versions',
      recordId: BigInt(newVersion.id),
      action: 'baseline_updated',
      newData: {
        objectId: request.objectId,
        boqItemId: request.boqItemId,
        oldPlanVolume: Number(request.oldPlanVolume),
        newPlanVolume: Number(request.newPlanVolume),
        versionNumber: newVersion.versionNumber,
      },
      performedBy: userId,
      organizationId: obj.organizationId,
    });

    return {
      requestId: updatedRequest.id,
      status: updatedRequest.status,
      newBoqVersion: {
        id: newVersion.id,
        versionNumber: newVersion.versionNumber,
      },
    };
  }
```

Also delete the now-unused `_userId`/`_requestId`/`_dto` stub signature — replaced wholesale by the block above.

- [ ] **Step 4: Run tests to verify everything passes**

Run: `pnpm --filter @ccip/api test baseline.service.spec.ts`
Expected: PASS (all `createRequest` + `approveRequest` tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/baseline/baseline.service.ts apps/api/src/modules/baseline/baseline.service.spec.ts
git commit -m "feat(baseline): implement BaselineService.approveRequest"
```

---

### Task 4: `BaselineController` + module wiring

**Files:**
- Create: `apps/api/src/modules/baseline/baseline.controller.ts`
- Create: `apps/api/src/modules/baseline/baseline.module.ts`
- Test: `apps/api/src/modules/baseline/baseline.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing controller test**

```typescript
import { Test } from '@nestjs/testing';
import { BaselineController } from './baseline.controller';
import { BaselineService } from './baseline.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';

const USER_ID = 42;
const OBJECT_ID = 10;

const mockReq = {
  user: { id: String(USER_ID), email: 'sc@example.com', role: 'stroycontrol' },
};

const makeDto = (): CreateBaselineUpdateRequestDto => ({
  boqItemId: 1,
  newPlanVolume: 600,
  reason: 'Уточнение объёма по факту обмера',
});

describe('BaselineController', () => {
  let controller: BaselineController;
  let baselineService: jest.Mocked<BaselineService>;

  beforeEach(async () => {
    baselineService = {
      createRequest: jest.fn().mockResolvedValue({}),
      approveRequest: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<BaselineService>;

    const module = await Test.createTestingModule({
      controllers: [BaselineController],
      providers: [{ provide: BaselineService, useValue: baselineService }],
    }).compile();

    controller = module.get(BaselineController);
  });

  describe('createRequest', () => {
    it('delegates to baselineService.createRequest with numeric userId, objectId and dto', async () => {
      await controller.createRequest(OBJECT_ID, makeDto(), mockReq);

      expect(baselineService.createRequest).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        makeDto(),
      );
    });
  });

  describe('approve', () => {
    it('delegates to baselineService.approveRequest with numeric userId, requestId and dto', async () => {
      await controller.approve(7, { reviewNotes: 'ок' }, mockReq);

      expect(baselineService.approveRequest).toHaveBeenCalledWith(
        USER_ID,
        7,
        { reviewNotes: 'ок' },
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ccip/api test baseline.controller.spec.ts`
Expected: FAIL — `Cannot find module './baseline.controller'`

- [ ] **Step 3: Write `baseline.controller.ts`**

```typescript
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { BaselineService } from './baseline.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';
import { ApproveBaselineUpdateDto } from './dto/approve-baseline-update.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BaselineController {
  constructor(private readonly baselineService: BaselineService) {}

  @Post('objects/:objectId/baseline-update-requests')
  @Roles('stroycontrol', 'admin')
  @HttpCode(HttpStatus.CREATED)
  createRequest(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Body() dto: CreateBaselineUpdateRequestDto,
    @Request() req: AuthRequest,
  ) {
    return this.baselineService.createRequest(
      parseInt(req.user.id, 10),
      objectId,
      dto,
    );
  }

  @Post('baseline-update-requests/:id/approve')
  @Roles('admin')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveBaselineUpdateDto,
    @Request() req: AuthRequest,
  ) {
    return this.baselineService.approveRequest(
      parseInt(req.user.id, 10),
      id,
      dto,
    );
  }
}
```

- [ ] **Step 4: Write `baseline.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { BaselineService } from './baseline.service';
import { BaselineController } from './baseline.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [BaselineController],
  providers: [BaselineService],
})
export class BaselineModule {}
```

- [ ] **Step 5: Register `BaselineModule` in `apps/api/src/app.module.ts`**

Add the import near the other module imports (after `import { DisputeSlaModule } from './modules/dispute-sla/dispute-sla.module';`):

```typescript
import { BaselineModule } from './modules/baseline/baseline.module';
```

Add `BaselineModule` to the `imports` array (after `DisputeSlaModule,`):

```typescript
    DisputeSlaModule,
    BaselineModule,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @ccip/api test baseline.controller.spec.ts`
Expected: PASS (2/2)

Run: `pnpm --filter @ccip/api test` (full suite — confirms `app.module.ts` still boots)
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/baseline/baseline.controller.ts apps/api/src/modules/baseline/baseline.controller.spec.ts apps/api/src/modules/baseline/baseline.module.ts apps/api/src/app.module.ts
git commit -m "feat(baseline): wire BaselineController/BaselineModule into AppModule"
```

---

### Task 5: `ObjectParticipantsService.changeGeneralContractor`

**Files:**
- Create: `apps/api/src/modules/objects/dto/change-general-contractor.dto.ts`
- Create: `apps/api/src/modules/objects/object-participants.service.ts`
- Test: `apps/api/src/modules/objects/object-participants.service.spec.ts`

- [ ] **Step 1: Write `change-general-contractor.dto.ts`**

```typescript
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeGeneralContractorDto {
  @IsString()
  @MaxLength(500)
  orgName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string;

  @IsDateString()
  validFrom: string;

  @IsString()
  reason: string;
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ObjectParticipantsService } from './object-participants.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { ChangeGeneralContractorDto } from './dto/change-general-contractor.dto';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const OBJECT_ID = 10;

const mockUser = { organizationId: ORG_ID };
const mockObject = { organizationId: ORG_ID };

const makeDto = (
  overrides: Partial<ChangeGeneralContractorDto> = {},
): ChangeGeneralContractorDto => ({
  orgName: 'ООО СтройГенПодряд',
  validFrom: '2026-07-15',
  reason: 'Расторжение договора с прежним ГП',
  ...overrides,
});

describe('ObjectParticipantsService', () => {
  let service: ObjectParticipantsService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser) },
      constructionObject: {
        findUnique: jest.fn().mockResolvedValue(mockObject),
      },
      period: { findFirst: jest.fn().mockResolvedValue(null) },
      discrepancy: { count: jest.fn().mockResolvedValue(0) },
      objectParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: 5,
          participantRole: 'general_contractor',
          orgName: 'ООО СтройГенПодряд',
          contactPerson: null,
          contactEmail: null,
          validFrom: new Date('2026-07-15'),
          isCurrent: true,
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditLogService>;

    const module = await Test.createTestingModule({
      providers: [
        ObjectParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get(ObjectParticipantsService);
  });

  describe('changeGeneralContractor', () => {
    it('throws NotFoundException when object is outside the user org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the object has an open period', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: 3 });

      await expect(
        service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when there are open discrepancies', async () => {
      (prisma.discrepancy.count as jest.Mock).mockResolvedValue(2);

      await expect(
        service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('closes the current GC record (SCD2) and creates the new one', async () => {
      await service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto());

      expect(prisma.objectParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          objectId: OBJECT_ID,
          participantRole: 'general_contractor',
          isCurrent: true,
        },
        data: expect.objectContaining({
          isCurrent: false,
          changedBy: USER_ID,
          changedReason: 'Расторжение договора с прежним ГП',
        }),
      });
      expect(prisma.objectParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            participantRole: 'general_contractor',
            orgName: 'ООО СтройГенПодряд',
            isCurrent: true,
          }),
        }),
      );
    });

    it('writes an audit log entry for the change', async () => {
      await service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto());

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'object_participants',
          action: 'general_contractor_changed',
          performedBy: USER_ID,
          organizationId: ORG_ID,
        }),
      );
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @ccip/api test object-participants.service.spec.ts`
Expected: FAIL — `Cannot find module './object-participants.service'`

- [ ] **Step 4: Write `object-participants.service.ts`**

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { ChangeGeneralContractorDto } from './dto/change-general-contractor.dto';

const GENERAL_CONTRACTOR_ROLE = 'general_contractor';

@Injectable()
export class ObjectParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async changeGeneralContractor(
    userId: number,
    objectId: number,
    dto: ChangeGeneralContractorDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });
    const obj = await this.prisma.constructionObject.findUnique({
      where: { id: objectId },
      select: { organizationId: true },
    });
    if (!obj || obj.organizationId !== user.organizationId) {
      throw new NotFoundException('OBJECT_NOT_FOUND');
    }

    const validFrom = new Date(dto.validFrom);

    const newParticipant = await this.prisma.$transaction(async (tx) => {
      const openPeriod = await tx.period.findFirst({
        where: { objectId, status: 'open' },
      });
      if (openPeriod) {
        throw new ConflictException('PERIOD_OPEN_CANNOT_CHANGE_GC');
      }

      const openDisputes = await tx.discrepancy.count({
        where: { status: 'open', periodFact: { period: { objectId } } },
      });
      if (openDisputes > 0) {
        throw new ConflictException('OPEN_DISPUTES_EXIST');
      }

      await tx.objectParticipant.updateMany({
        where: {
          objectId,
          participantRole: GENERAL_CONTRACTOR_ROLE,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
          validTo: validFrom,
          changedAt: new Date(),
          changedBy: userId,
          changedReason: dto.reason,
        },
      });

      return tx.objectParticipant.create({
        data: {
          objectId,
          participantRole: GENERAL_CONTRACTOR_ROLE,
          orgName: dto.orgName,
          contactPerson: dto.contactPerson,
          contactEmail: dto.contactEmail,
          validFrom,
          isCurrent: true,
        },
        select: {
          id: true,
          participantRole: true,
          orgName: true,
          contactPerson: true,
          contactEmail: true,
          validFrom: true,
          isCurrent: true,
        },
      });
    });

    await this.auditLog.log({
      tableName: 'object_participants',
      recordId: BigInt(newParticipant.id),
      action: 'general_contractor_changed',
      newData: { objectId, orgName: dto.orgName, reason: dto.reason },
      performedBy: userId,
      organizationId: obj.organizationId,
    });

    return {
      ...newParticipant,
      validFrom: newParticipant.validFrom.toISOString().slice(0, 10),
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ccip/api test object-participants.service.spec.ts`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/objects/dto/change-general-contractor.dto.ts apps/api/src/modules/objects/object-participants.service.ts apps/api/src/modules/objects/object-participants.service.spec.ts
git commit -m "feat(objects): implement ObjectParticipantsService.changeGeneralContractor"
```

---

### Task 6: Wire GC-change endpoint into `ObjectsController` / `ObjectsModule`

**Files:**
- Modify: `apps/api/src/modules/objects/objects.controller.ts`
- Modify: `apps/api/src/modules/objects/objects.controller.spec.ts`
- Modify: `apps/api/src/modules/objects/objects.module.ts`

- [ ] **Step 1: Add a failing test to `objects.controller.spec.ts`**

Read the existing file first (`apps/api/src/modules/objects/objects.controller.spec.ts`) to match its exact mock-setup style (it already mocks `ObjectsService`; this step adds a second mocked provider). Add this `describe` block inside the top-level `describe('ObjectsController', ...)`, alongside the existing ones, and add `objectParticipantsService` as a second provider in the `Test.createTestingModule` call (mirroring how `boqService` is provided in `boq.controller.spec.ts`):

```typescript
  describe('changeGeneralContractor', () => {
    it('delegates to objectParticipantsService.changeGeneralContractor with numeric userId, objectId and dto', async () => {
      const dto = {
        orgName: 'ООО СтройГенПодряд',
        validFrom: '2026-07-15',
        reason: 'Расторжение договора с прежним ГП',
      };

      await controller.changeGeneralContractor(OBJECT_ID, dto, mockReq);

      expect(
        objectParticipantsService.changeGeneralContractor,
      ).toHaveBeenCalledWith(USER_ID, OBJECT_ID, dto);
    });
  });
```

Add the mocked provider in `beforeEach`:

```typescript
    objectParticipantsService = {
      changeGeneralContractor: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ObjectParticipantsService>;
```

and pass `{ provide: ObjectParticipantsService, useValue: objectParticipantsService }` alongside the existing `ObjectsService` provider in `Test.createTestingModule`. Add the import:

```typescript
import { ObjectParticipantsService } from './object-participants.service';
```

and declare `let objectParticipantsService: jest.Mocked<ObjectParticipantsService>;` next to the existing `objectsService` declaration.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ccip/api test objects.controller.spec.ts`
Expected: FAIL — `controller.changeGeneralContractor is not a function`

- [ ] **Step 3: Update `objects.controller.ts`**

Add the import:

```typescript
import { ObjectParticipantsService } from './object-participants.service';
import { ChangeGeneralContractorDto } from './dto/change-general-contractor.dto';
```

Update the constructor:

```typescript
  constructor(
    private readonly objectsService: ObjectsService,
    private readonly objectParticipantsService: ObjectParticipantsService,
  ) {}
```

Add the endpoint (after `addParticipant`):

```typescript
  @Post(':id/general-contractor')
  @Roles('admin')
  changeGeneralContractor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeGeneralContractorDto,
    @Request() req: AuthRequest,
  ) {
    return this.objectParticipantsService.changeGeneralContractor(
      parseInt(req.user.id, 10),
      id,
      dto,
    );
  }
```

- [ ] **Step 4: Register `ObjectParticipantsService` and `AuditLogModule` in `objects.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ObjectsService } from './objects.service';
import { ObjectParticipantsService } from './object-participants.service';
import { ObjectsController } from './objects.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, AnalyticsModule],
  controllers: [ObjectsController],
  providers: [ObjectsService, ObjectParticipantsService],
})
export class ObjectsModule {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ccip/api test objects.controller.spec.ts`
Expected: PASS

Run: `pnpm --filter @ccip/api test` (full suite)
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/objects/objects.controller.ts apps/api/src/modules/objects/objects.controller.spec.ts apps/api/src/modules/objects/objects.module.ts
git commit -m "feat(objects): wire changeGeneralContractor endpoint into ObjectsController"
```

---

### Task 7: Close M-06 in project docs

**Files:**
- Modify: `docs/project-state.md`
- Modify: `docs/delivery/phase-4-7-backend-modules.md`

- [ ] **Step 1: Update `docs/project-state.md`**

In §2 Module Status, change the M-06 row (currently `| M-06 | P3 | Baseline F/G + GC Change H | 6 | ○ pending | — |`) to:

```
| M-06 | P3 | Baseline F/G + GC Change H | 6 | ✓ done | — |
```

Update `**Last Updated**` in §1 to the date this task is actually completed.

- [ ] **Step 2: Update `docs/delivery/phase-4-7-backend-modules.md`**

In §6.1, replace the `(planned)` artifact path `apps/api/src/modules/baseline-update/baseline-update.module.ts` with the real path `apps/api/src/modules/baseline/baseline.module.ts` (keep the surrounding indented code fence as-is).

In §6.2, the artifact line currently reads `Артефакт: метод в ObjectParticipantsService` — append the file path:

```
Артефакт: `apps/api/src/modules/objects/object-participants.service.ts`
```

- [ ] **Step 3: Commit**

```bash
git add docs/project-state.md docs/delivery/phase-4-7-backend-modules.md
git commit -m "docs(state): M-06 done — UpdateBaseline F/G + GC change H shipped"
```

---

## Self-Review Notes

- **Spec coverage:** §6.1 (`POST .../baseline-update-requests`, `POST .../approve`, plan_volume update, weight_coef recalc via trigger, lineage inheritance ADR-006) → Tasks 2–4. §6.2 (`changeGeneralContractor()`, period-not-open guard, zero-open-discrepancies guard, SCD2 swap) → Tasks 5–6. Doc closure → Task 7.
- **Explicitly not covered (documented above as out of scope):** §6.3 Admin-correction, §6.4 Notifications, GC-change notification gap (phase file §10.3) — none are part of M-06's title in `project-state.md`.
- **Type consistency check:** `BaselineService.approveRequest` return shape (`{ requestId, status, newBoqVersion: { id, versionNumber } }`) is only consumed by `BaselineController.approve`, which just returns it — no downstream mismatch. `ObjectParticipantsService.changeGeneralContractor` return shape matches `ObjectsService.addParticipant`'s existing shape for consistency (same field names: `id`, `participantRole`, `orgName`, `contactPerson`, `contactEmail`, `validFrom`, `isCurrent`).
