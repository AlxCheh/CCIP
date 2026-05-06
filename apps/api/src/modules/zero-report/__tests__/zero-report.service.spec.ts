import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZeroReportService } from '../zero-report.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateZeroReportDto } from '../dto/create-zero-report.dto';
import { UpsertZeroReportItemDto } from '../dto/upsert-zero-report-item.dto';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const DIRECTOR_ID = 2;
const OBJECT_ID = 10;
const BOQ_VERSION_ID = 5;
const ZERO_REPORT_ID = 100;
const BOQ_ITEM_ID = 50;

const mockUser = { id: USER_ID, organizationId: ORG_ID, role: 'site_engineer' };
const mockDirector = {
  id: DIRECTOR_ID,
  organizationId: ORG_ID,
  role: 'director',
};
const mockObject = { id: OBJECT_ID, organizationId: ORG_ID };

const makeZeroReport = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: ZERO_REPORT_ID,
  objectId: OBJECT_ID,
  boqVersionId: BOQ_VERSION_ID,
  status: 'draft',
  submittedAt: null,
  submittedBy: null,
  approvedAt: null,
  approvedBy: null,
  alertSentAt: null,
  notes: null,
  createdAt: new Date('2026-05-06T10:00:00Z'),
  ...overrides,
});

const makeItem = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  zeroReportId: ZERO_REPORT_ID,
  boqItemId: BOQ_ITEM_ID,
  factVolume: 100,
  source: 'field',
  doc1Value: null,
  doc2Value: null,
  doc3Value: null,
  crossVerified: false,
  notes: null,
  ...overrides,
});

const makeCreateDto = (): CreateZeroReportDto => ({
  boqVersionId: BOQ_VERSION_ID,
});

const makeItemDto = (
  overrides: Partial<UpsertZeroReportItemDto> = {},
): UpsertZeroReportItemDto => ({
  boqItemId: BOQ_ITEM_ID,
  factVolume: 100,
  source: 'field',
  ...overrides,
});

describe('ZeroReportService', () => {
  let service: ZeroReportService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser) },
      constructionObject: {
        findUnique: jest.fn().mockResolvedValue(mockObject),
      },
      boqVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: BOQ_VERSION_ID,
          objectId: OBJECT_ID,
          isActive: true,
        }),
      },
      boqItem: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: BOQ_ITEM_ID, boqVersionId: BOQ_VERSION_ID }),
      },
      zeroReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeZeroReport()),
        findUnique: jest.fn().mockResolvedValue(makeZeroReport()),
        update: jest.fn().mockResolvedValue(makeZeroReport()),
      },
      zeroReportItem: {
        upsert: jest.fn().mockResolvedValue(makeItem()),
        findMany: jest.fn().mockResolvedValue([makeItem()]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        ZeroReportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ZeroReportService);
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a draft zero-report for the object', async () => {
      const result = await service.create(USER_ID, OBJECT_ID, makeCreateDto());

      expect(prisma.zeroReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            boqVersionId: BOQ_VERSION_ID,
            status: 'draft',
          }),
        }),
      );
      expect(result.status).toBe('draft');
      expect(result.objectId).toBe(OBJECT_ID);
    });

    it('throws ConflictException if active zero-report already exists for object', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport(),
      );

      await expect(
        service.create(USER_ID, OBJECT_ID, makeCreateDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException with ZERO_REPORT_ALREADY_EXISTS code', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport(),
      );

      await expect(
        service.create(USER_ID, OBJECT_ID, makeCreateDto()),
      ).rejects.toThrow('ZERO_REPORT_ALREADY_EXISTS');
    });

    it('throws NotFoundException when object does not exist', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.create(USER_ID, OBJECT_ID, makeCreateDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        id: OBJECT_ID,
        organizationId: 'other-org',
      });

      await expect(
        service.create(USER_ID, OBJECT_ID, makeCreateDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when boqVersion does not exist', async () => {
      (prisma.boqVersion.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(USER_ID, OBJECT_ID, makeCreateDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when boqVersion does not belong to object', async () => {
      (prisma.boqVersion.findUnique as jest.Mock).mockResolvedValue({
        id: BOQ_VERSION_ID,
        objectId: 999,
        isActive: true,
      });

      await expect(
        service.create(USER_ID, OBJECT_ID, makeCreateDto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── getByObject ─────────────────────────────────────────────────────────────

  describe('getByObject', () => {
    it('returns zero-report with items for the object', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue({
        ...makeZeroReport(),
        items: [makeItem()],
      });

      const result = await service.getByObject(USER_ID, OBJECT_ID);

      expect(result.id).toBe(ZERO_REPORT_ID);
      expect(result.status).toBe('draft');
      expect(result.items).toHaveLength(1);
    });

    it('throws NotFoundException when no zero-report exists for object', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getByObject(USER_ID, OBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException with ZERO_REPORT_NOT_FOUND code', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getByObject(USER_ID, OBJECT_ID)).rejects.toThrow(
        'ZERO_REPORT_NOT_FOUND',
      );
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        id: OBJECT_ID,
        organizationId: 'other-org',
      });

      await expect(service.getByObject(USER_ID, OBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── upsertItem ──────────────────────────────────────────────────────────────

  describe('upsertItem', () => {
    it('upserts zero-report item with factVolume and source', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft' }),
      );

      const result = await service.upsertItem(
        USER_ID,
        OBJECT_ID,
        makeItemDto(),
      );

      expect(prisma.zeroReportItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            zeroReportId_boqItemId: {
              zeroReportId: ZERO_REPORT_ID,
              boqItemId: BOQ_ITEM_ID,
            },
          }),
          create: expect.objectContaining({ factVolume: 100, source: 'field' }),
          update: expect.objectContaining({ factVolume: 100, source: 'field' }),
        }),
      );
      expect(result.boqItemId).toBe(BOQ_ITEM_ID);
    });

    it('throws NotFoundException when no zero-report exists for object', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.upsertItem(USER_ID, OBJECT_ID, makeItemDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when status is not draft', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'submitted' }),
      );

      await expect(
        service.upsertItem(USER_ID, OBJECT_ID, makeItemDto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException with ZERO_REPORT_INVALID_STATUS when not draft', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'approved' }),
      );

      await expect(
        service.upsertItem(USER_ID, OBJECT_ID, makeItemDto()),
      ).rejects.toThrow('ZERO_REPORT_INVALID_STATUS');
    });

    it('stores doc1Value, doc2Value, doc3Value and sets crossVerified when all docs provided', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft' }),
      );
      const itemWithDocs = makeItem({
        doc1Value: 98,
        doc2Value: 99,
        doc3Value: 100,
        crossVerified: true,
      });
      (prisma.zeroReportItem.upsert as jest.Mock).mockResolvedValue(
        itemWithDocs,
      );

      const dto = makeItemDto({ doc1Value: 98, doc2Value: 99, doc3Value: 100 });
      const result = await service.upsertItem(USER_ID, OBJECT_ID, dto);

      expect(result.crossVerified).toBe(true);
    });
  });

  // ─── submit ──────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('transitions status from draft to submitted', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft' }),
      );
      (prisma.zeroReport.update as jest.Mock).mockResolvedValue(
        makeZeroReport({
          status: 'submitted',
          submittedAt: new Date(),
          submittedBy: USER_ID,
        }),
      );

      const result = await service.submit(USER_ID, OBJECT_ID);

      expect(prisma.zeroReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ZERO_REPORT_ID },
          data: expect.objectContaining({
            status: 'submitted',
            submittedBy: USER_ID,
          }),
        }),
      );
      expect(result.status).toBe('submitted');
    });

    it('throws NotFoundException when no zero-report exists', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.submit(USER_ID, OBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when status is not draft', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'submitted' }),
      );

      await expect(service.submit(USER_ID, OBJECT_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws UnprocessableEntityException with ZERO_REPORT_INVALID_STATUS when already submitted', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'approved' }),
      );

      await expect(service.submit(USER_ID, OBJECT_ID)).rejects.toThrow(
        'ZERO_REPORT_INVALID_STATUS',
      );
    });
  });

  // ─── approve ─────────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('transitions status from submitted to approved', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDirector,
      );
      // First call: find current report; second call: check for existing approved (returns null)
      (prisma.zeroReport.findFirst as jest.Mock)
        .mockResolvedValueOnce(makeZeroReport({ status: 'submitted' }))
        .mockResolvedValueOnce(null);
      (prisma.zeroReport.update as jest.Mock).mockResolvedValue(
        makeZeroReport({
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: DIRECTOR_ID,
        }),
      );

      const result = await service.approve(DIRECTOR_ID, OBJECT_ID);

      expect(prisma.zeroReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ZERO_REPORT_ID },
          data: expect.objectContaining({
            status: 'approved',
            approvedBy: DIRECTOR_ID,
          }),
        }),
      );
      expect(result.status).toBe('approved');
    });

    it('throws NotFoundException when no zero-report exists', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDirector,
      );
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.approve(DIRECTOR_ID, OBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when status is not submitted', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDirector,
      );
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft' }),
      );

      await expect(service.approve(DIRECTOR_ID, OBJECT_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws UnprocessableEntityException with ZERO_REPORT_INVALID_STATUS when already approved', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDirector,
      );
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'approved' }),
      );

      await expect(service.approve(DIRECTOR_ID, OBJECT_ID)).rejects.toThrow(
        'ZERO_REPORT_INVALID_STATUS',
      );
    });

    it('invariant: cannot approve when another approved zero-report exists for object', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDirector,
      );
      (prisma.zeroReport.findFirst as jest.Mock)
        .mockResolvedValueOnce(makeZeroReport({ status: 'submitted' })) // find current
        .mockResolvedValueOnce(makeZeroReport({ id: 999, status: 'approved' })); // find existing approved

      await expect(service.approve(DIRECTOR_ID, OBJECT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    // Critical #1 — approve uses $transaction
    it('wraps approve logic in a prisma $transaction', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDirector,
      );
      (prisma.zeroReport.findFirst as jest.Mock)
        .mockResolvedValueOnce(makeZeroReport({ status: 'submitted' }))
        .mockResolvedValueOnce(null);
      (prisma.zeroReport.update as jest.Mock).mockResolvedValue(
        makeZeroReport({
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: DIRECTOR_ID,
        }),
      );

      await service.approve(DIRECTOR_ID, OBJECT_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── Critical #1 — create uses $transaction ───────────────────────────────

  describe('create (transaction)', () => {
    it('wraps create logic in a prisma $transaction', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await service.create(USER_ID, OBJECT_ID, makeCreateDto());

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── Critical #2 — boqItemId validated against boqVersionId ──────────────

  describe('upsertItem (boqVersionId validation)', () => {
    it('throws UnprocessableEntityException when boqItemId belongs to different boqVersion', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft', boqVersionId: BOQ_VERSION_ID }),
      );
      (prisma.boqItem.findUnique as jest.Mock).mockResolvedValue({
        id: BOQ_ITEM_ID,
        boqVersionId: 999, // different version
      });

      await expect(
        service.upsertItem(USER_ID, OBJECT_ID, makeItemDto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException with BOQ_ITEM_VERSION_MISMATCH code', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft', boqVersionId: BOQ_VERSION_ID }),
      );
      (prisma.boqItem.findUnique as jest.Mock).mockResolvedValue({
        id: BOQ_ITEM_ID,
        boqVersionId: 999,
      });

      await expect(
        service.upsertItem(USER_ID, OBJECT_ID, makeItemDto()),
      ).rejects.toThrow('BOQ_ITEM_VERSION_MISMATCH');
    });

    it('throws NotFoundException with BOQ_ITEM_NOT_FOUND when boqItem does not exist', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft', boqVersionId: BOQ_VERSION_ID }),
      );
      (prisma.boqItem.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.upsertItem(USER_ID, OBJECT_ID, makeItemDto()),
      ).rejects.toThrow('BOQ_ITEM_NOT_FOUND');
    });
  });

  // ─── Important #4 — submit requires at least one item ────────────────────

  describe('submit (item count validation)', () => {
    it('throws UnprocessableEntityException when report has no items', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft' }),
      );
      (prisma.zeroReportItem.count as jest.Mock).mockResolvedValue(0);

      await expect(service.submit(USER_ID, OBJECT_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws UnprocessableEntityException with ZERO_REPORT_NO_ITEMS code when no items', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(
        makeZeroReport({ status: 'draft' }),
      );
      (prisma.zeroReportItem.count as jest.Mock).mockResolvedValue(0);

      await expect(service.submit(USER_ID, OBJECT_ID)).rejects.toThrow(
        'ZERO_REPORT_NO_ITEMS',
      );
    });
  });

  // ─── Important #5 — alertSentAt in formatReport ───────────────────────────

  describe('getByObject (alertSentAt)', () => {
    it('returns alertSentAt field as null for a new report', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue({
        ...makeZeroReport({ alertSentAt: null }),
        items: [],
      });

      const result = await service.getByObject(USER_ID, OBJECT_ID);

      expect(result).toHaveProperty('alertSentAt');
      expect(result.alertSentAt).toBeNull();
    });

    it('returns alertSentAt as ISO string when set', async () => {
      const sentAt = new Date('2026-05-06T12:00:00Z');
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue({
        ...makeZeroReport({ alertSentAt: sentAt }),
        items: [],
      });

      const result = await service.getByObject(USER_ID, OBJECT_ID);

      expect(result.alertSentAt).toBe('2026-05-06T12:00:00.000Z');
    });
  });
});
