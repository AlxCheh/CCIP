import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ObjectsService } from './objects.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MvStalenessService } from '../analytics/mv-staleness.service';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const OBJECT_ID = 10;

const mockUser = { organizationId: ORG_ID };
const mockObject = { organizationId: ORG_ID };
const NOW = new Date('2026-05-06T10:00:00Z');

describe('ObjectsService', () => {
  let service: ObjectsService;
  let prisma: jest.Mocked<PrismaService>;
  let staleness: jest.Mocked<MvStalenessService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser) },
      constructionObject: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(mockObject),
      },
      objectParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      boqVersion: { findFirst: jest.fn().mockResolvedValue(null) },
      period: { findFirst: jest.fn().mockResolvedValue(null) },
      readinessSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PrismaService>;

    staleness = {
      getStalenessMeta: jest.fn().mockResolvedValue({ isStale: false, refreshedAt: NOW.toISOString() }),
    } as unknown as jest.Mocked<MvStalenessService>;

    const module = await Test.createTestingModule({
      providers: [
        ObjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MvStalenessService, useValue: staleness },
      ],
    }).compile();

    service = module.get(ObjectsService);
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const mockCreated = {
      id: OBJECT_ID, name: 'Склад №1', objectClass: 'II', address: 'Москва',
      permitNumber: 'RU-123', permitDate: new Date('2025-01-15'),
      connectionDate: new Date('2027-06-01'), status: 'active', createdAt: NOW,
    };

    beforeEach(() => {
      (prisma.constructionObject.create as jest.Mock).mockResolvedValue(mockCreated);
    });

    it('creates object with organizationId from user', async () => {
      await service.create(USER_ID, { name: 'Склад №1' });

      expect(prisma.constructionObject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Склад №1',
            organizationId: ORG_ID,
            createdBy: USER_ID,
          }),
        }),
      );
    });

    it('converts permitDate and connectionDate strings to Date', async () => {
      await service.create(USER_ID, {
        name: 'Склад №1',
        permitDate: '2025-01-15',
        connectionDate: '2027-06-01',
      });

      expect(prisma.constructionObject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            permitDate: new Date('2025-01-15'),
            connectionDate: new Date('2027-06-01'),
          }),
        }),
      );
    });

    it('returns formatted dates as ISO date strings', async () => {
      const result = await service.create(USER_ID, { name: 'Склад №1' });

      expect(result.permitDate).toBe('2025-01-15');
      expect(result.connectionDate).toBe('2027-06-01');
      expect(result.createdAt).toBe(NOW.toISOString());
    });

    it('works without optional fields', async () => {
      (prisma.constructionObject.create as jest.Mock).mockResolvedValue({
        ...mockCreated, permitDate: null, connectionDate: null,
      });

      const result = await service.create(USER_ID, { name: 'Склад №1' });

      expect(result.permitDate).toBeNull();
      expect(result.connectionDate).toBeNull();
    });
  });

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns objects scoped to user org ordered by createdAt desc', async () => {
      (prisma.constructionObject.findMany as jest.Mock).mockResolvedValue([
        { id: 1, name: 'A', objectClass: 'II', status: 'active', connectionDate: null, createdAt: NOW },
        { id: 2, name: 'B', objectClass: 'III', status: 'active', connectionDate: new Date('2027-01-01'), createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.list(USER_ID);

      expect(prisma.constructionObject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG_ID } }),
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
      expect(result[1].connectionDate).toBe('2027-01-01');
    });

    it('returns empty array when no objects exist', async () => {
      (prisma.constructionObject.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.list(USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── addParticipant ──────────────────────────────────────────────────────────

  describe('addParticipant', () => {
    const dto = {
      participantRole: 'general_contractor',
      orgName: 'ООО Строй',
      validFrom: '2026-05-01',
      contactPerson: 'Иванов И.И.',
      contactEmail: 'ivanov@stroy.ru',
    };

    const mockParticipant = {
      id: 1,
      participantRole: 'general_contractor',
      orgName: 'ООО Строй',
      contactPerson: 'Иванов И.И.',
      contactEmail: 'ivanov@stroy.ru',
      validFrom: new Date('2026-05-01'),
      isCurrent: true,
    };

    beforeEach(() => {
      (prisma.objectParticipant.create as jest.Mock).mockResolvedValue(mockParticipant);
    });

    it('closes existing current record for same role before creating new one', async () => {
      await service.addParticipant(USER_ID, OBJECT_ID, dto);

      expect(prisma.objectParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            objectId: OBJECT_ID,
            participantRole: 'general_contractor',
            isCurrent: true,
          },
          data: expect.objectContaining({
            isCurrent: false,
            validTo: new Date('2026-05-01'),
            changedBy: USER_ID,
          }),
        }),
      );
    });

    it('creates new participant with isCurrent=true', async () => {
      await service.addParticipant(USER_ID, OBJECT_ID, dto);

      expect(prisma.objectParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            participantRole: 'general_contractor',
            orgName: 'ООО Строй',
            isCurrent: true,
          }),
        }),
      );
    });

    it('returns participant with validFrom as ISO date string', async () => {
      const result = await service.addParticipant(USER_ID, OBJECT_ID, dto);

      expect(result.validFrom).toBe('2026-05-01');
      expect(result.isCurrent).toBe(true);
    });

    it('throws NotFoundException when object not found', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addParticipant(USER_ID, OBJECT_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.addParticipant(USER_ID, OBJECT_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getDetail ───────────────────────────────────────────────────────────────

  describe('getDetail', () => {
    const mockObjFull = {
      id: OBJECT_ID, name: 'Склад №1', objectClass: 'II', address: 'Москва',
      permitNumber: 'RU-123', permitDate: null, connectionDate: null,
      status: 'active', organizationId: ORG_ID,
    };

    beforeEach(() => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(mockObjFull);
    });

    it('returns object detail with hasAnalytics=false when MV has no rows', async () => {
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([]);

      const result = await service.getDetail(USER_ID, OBJECT_ID);

      expect(result.object.id).toBe(OBJECT_ID);
      expect(result.hasAnalytics).toBe(false);
      expect(result.current).toBeNull();
    });

    it('returns hasAnalytics=true with analytics data when MV row exists', async () => {
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{
        objReadinessPct: '72.50',
        weightedForecastDate: new Date('2027-08-01'),
        criticalPathForecastDate: new Date('2027-09-01'),
        gapFlag: false,
      }]);

      const result = await service.getDetail(USER_ID, OBJECT_ID);

      expect(result.hasAnalytics).toBe(true);
      expect(result.current?.objReadinessPct).toBe(72.5);
      expect(result.current?.gapFlag).toBe(false);
    });

    it('includes current participants mapped with role field', async () => {
      (prisma.objectParticipant.findMany as jest.Mock).mockResolvedValue([{
        participantRole: 'general_contractor',
        orgName: 'ООО Строй',
        contactPerson: 'Иванов',
        contactEmail: 'i@s.ru',
        validFrom: new Date('2026-01-01'),
      }]);

      const result = await service.getDetail(USER_ID, OBJECT_ID);

      expect(result.participants[0].role).toBe('general_contractor');
      expect(result.participants[0].validFrom).toBe('2026-01-01');
    });

    it('includes activeBoq summary when version exists', async () => {
      (prisma.boqVersion.findFirst as jest.Mock).mockResolvedValue({
        id: 1, versionNumber: '1.0', _count: { boqItems: 5 },
      });

      const result = await service.getDetail(USER_ID, OBJECT_ID);

      expect(result.activeBoq).toEqual({ id: 1, versionNumber: '1.0', itemsCount: 5 });
    });

    it('sets activeBoq=null when no active version', async () => {
      (prisma.boqVersion.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getDetail(USER_ID, OBJECT_ID);

      expect(result.activeBoq).toBeNull();
    });

    it('throws NotFoundException when object not found', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getDetail(USER_ID, OBJECT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        ...mockObjFull, organizationId: 'other-org',
      });

      await expect(
        service.getDetail(USER_ID, OBJECT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
