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
