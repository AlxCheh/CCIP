import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BoqService } from './boq.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBoqDto } from './dto/create-boq.dto';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const OBJECT_ID = 10;

const mockUser = { organizationId: ORG_ID };
const mockObject = { organizationId: ORG_ID };

const makeDto = (overrides: Partial<CreateBoqDto> = {}): CreateBoqDto => ({
  items: [
    { workCode: 'W-01', name: 'Земляные работы', planVolume: 100, contractValue: 600_000 },
    { workCode: 'W-02', name: 'Бетон фундамент', planVolume: 50, contractValue: 400_000 },
  ],
  ...overrides,
});

describe('BoqService', () => {
  let service: BoqService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser) },
      constructionObject: { findUnique: jest.fn().mockResolvedValue(mockObject) },
      boqVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      boqItem: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { weightCoef: 1.0 } }),
        findMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        BoqService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(BoqService);
  });

  // ─── createInitial ──────────────────────────────────────────────────────────

  describe('createInitial', () => {
    const mockVersion = {
      id: 1,
      versionNumber: '1.0',
      changeType: 'initial',
      changeReason: null,
      isActive: true,
      createdAt: new Date('2026-05-06T10:00:00Z'),
    };

    const mockItems = [
      {
        id: 1, workCode: 'W-01', name: 'Земляные работы', unit: null,
        planVolume: 600000, contractValue: 600000, weightCoef: 0.6,
        isCritical: false, status: 'active',
      },
      {
        id: 2, workCode: 'W-02', name: 'Бетон фундамент', unit: null,
        planVolume: 400000, contractValue: 400000, weightCoef: 0.4,
        isCritical: false, status: 'active',
      },
    ];

    beforeEach(() => {
      (prisma.boqVersion.create as jest.Mock).mockResolvedValue(mockVersion);
      (prisma.boqItem.findMany as jest.Mock).mockResolvedValue(mockItems);
    });

    it('creates version v1.0 with items and returns them', async () => {
      const result = await service.createInitial(USER_ID, OBJECT_ID, makeDto());

      expect(prisma.boqVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            versionNumber: '1.0',
            changeType: 'initial',
            isActive: true,
            createdBy: USER_ID,
          }),
        }),
      );
      expect(prisma.boqItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ workCode: 'W-01', contractValue: 600_000 }),
            expect.objectContaining({ workCode: 'W-02', contractValue: 400_000 }),
          ]),
        }),
      );
      expect(result.versionNumber).toBe('1.0');
      expect(result.itemsCount).toBe(2);
    });

    it('passes changeReason to boqVersion.create', async () => {
      await service.createInitial(USER_ID, OBJECT_ID, makeDto({ changeReason: 'Первоначальная смета' }));

      expect(prisma.boqVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeReason: 'Первоначальная смета' }),
        }),
      );
    });

    it('throws ConflictException if active version already exists', async () => {
      (prisma.boqVersion.findFirst as jest.Mock).mockResolvedValue({ id: 99 });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws UnprocessableEntityException when SUM(weight_coef) != 1.0', async () => {
      (prisma.boqItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { weightCoef: 0.5 },
      });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    // ─── weightCoef boundary ──────────────────────────────────────────────────

    // tolerance = 0.001 strict (Math.abs(sum - 1.0) > 0.001)
    // 0.999/1.001 look like boundaries but fail due to JS float precision:
    // Math.abs(0.999 - 1.0) === 0.0010000000000000009 > 0.001 → throws
    // Safe inner values: 0.9995 / 1.0005 (delta 0.0005, clearly below 0.001)

    it('accepts SUM(weightCoef) = 0.9995 (clearly within ±0.001 tolerance)', async () => {
      (prisma.boqItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { weightCoef: 0.9995 },
      });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).resolves.toMatchObject({ versionNumber: '1.0' });
    });

    it('accepts SUM(weightCoef) = 1.0005 (clearly within ±0.001 tolerance)', async () => {
      (prisma.boqItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { weightCoef: 1.0005 },
      });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).resolves.toMatchObject({ versionNumber: '1.0' });
    });

    it('rejects SUM(weightCoef) = 0.998 (outside tolerance)', async () => {
      (prisma.boqItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { weightCoef: 0.998 },
      });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects SUM(weightCoef) = 1.002 (outside tolerance)', async () => {
      (prisma.boqItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { weightCoef: 1.002 },
      });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('propagates transaction error when $transaction rejects', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('TX_ROLLBACK'));

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow('TX_ROLLBACK');
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when object does not exist', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createInitial(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getActive ──────────────────────────────────────────────────────────────

  describe('getActive', () => {
    it('returns active version with items', async () => {
      const mockVersion = {
        id: 1,
        versionNumber: '1.0',
        changeType: 'initial',
        changeReason: null,
        isActive: true,
        createdAt: new Date('2026-05-06T10:00:00Z'),
        boqItems: [
          {
            id: 1, workCode: 'W-01', name: 'Земляные работы', unit: null,
            planVolume: 600000, contractValue: 600000, weightCoef: 0.6,
            isCritical: false, status: 'active',
          },
        ],
      };
      (prisma.boqVersion.findFirst as jest.Mock).mockResolvedValue(mockVersion);

      const result = await service.getActive(USER_ID, OBJECT_ID);

      expect(result.versionNumber).toBe('1.0');
      expect(result.isActive).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].weightCoef).toBe(0.6);
    });

    it('throws NotFoundException when no active version exists', async () => {
      (prisma.boqVersion.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getActive(USER_ID, OBJECT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.getActive(USER_ID, OBJECT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listVersions ───────────────────────────────────────────────────────────

  describe('listVersions', () => {
    it('returns all versions ordered by createdAt asc', async () => {
      const mockVersions = [
        {
          id: 1, versionNumber: '1.0', changeType: 'initial',
          changeReason: null, isActive: false,
          createdAt: new Date('2026-04-01T00:00:00Z'),
          approvedAt: new Date('2026-04-02T00:00:00Z'),
          _count: { boqItems: 5 },
        },
        {
          id: 2, versionNumber: '1.1', changeType: 'update',
          changeReason: 'Корректировка смет', isActive: true,
          createdAt: new Date('2026-05-01T00:00:00Z'),
          approvedAt: null,
          _count: { boqItems: 6 },
        },
      ];
      (prisma.boqVersion.findMany as jest.Mock).mockResolvedValue(mockVersions);

      const result = await service.listVersions(USER_ID, OBJECT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].versionNumber).toBe('1.0');
      expect(result[0].itemsCount).toBe(5);
      expect(result[1].versionNumber).toBe('1.1');
      expect(result[1].changeReason).toBe('Корректировка смет');
    });

    it('returns empty array when no versions exist', async () => {
      (prisma.boqVersion.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listVersions(USER_ID, OBJECT_ID);

      expect(result).toEqual([]);
    });
  });
});
