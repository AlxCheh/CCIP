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
});
