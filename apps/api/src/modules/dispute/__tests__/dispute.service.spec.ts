import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DisputeService } from '../dispute.service';
import { DisputeSlaService } from '../../dispute-sla/dispute-sla.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockPrisma = {
  period:      { findUniqueOrThrow: jest.fn() },
  periodFact:  { findFirst: jest.fn(), update: jest.fn() },
  photo:       { findFirst: jest.fn() },
  discrepancy: { create: jest.fn(), findMany: jest.fn() },
};
const mockDisputeSlaService = { scheduleEvents: jest.fn() };

const openPeriod = (overrides = {}) => ({
  id: 1, status: 'verification', object: { organizationId: 'org-1' }, ...overrides,
});
const factWithDelta = (overrides = {}) => ({
  id: 10, periodId: 1, boqItemId: 7, scVolume: 80, gpVolume: 100, discrepancyType: 1,
  discrepancyStatus: 'open', createdAt: new Date(), ...overrides,
});

describe('DisputeService', () => {
  let service: DisputeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: PrismaService,     useValue: mockPrisma },
        { provide: DisputeSlaService, useValue: mockDisputeSlaService },
      ],
    }).compile();
    service = module.get(DisputeService);
  });

  describe('createDispute', () => {
    it('throws NotFoundException when period not found', async () => {
      mockPrisma.period.findUniqueOrThrow.mockRejectedValue(new NotFoundException());
      await expect(service.createDispute(99, 7, 1, { disputeReason: 'blocked' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when period is not in verification status', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod({ status: 'open' }));
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'blocked' }))
        .rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when period fact does not exist', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(null);
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'blocked' }))
        .rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no delta (volumes match)', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(
        factWithDelta({ scVolume: 100, gpVolume: 100 }),
      );
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'x' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no photo exists for period+boqItem', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(factWithDelta());
      mockPrisma.photo.findFirst.mockResolvedValue(null);
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'buried' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when disputeReason is empty', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(factWithDelta());
      mockPrisma.photo.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.createDispute(1, 7, 1, { disputeReason: '   ' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates Discrepancy row, updates PeriodFact to type=2, schedules SLA events', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(factWithDelta());
      mockPrisma.photo.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.discrepancy.create.mockResolvedValue({ id: 30, createdAt: new Date() });

      const result = await service.createDispute(1, 7, 1, { disputeReason: 'access blocked' });

      expect(mockPrisma.periodFact.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { discrepancyType: 2, discrepancyStatus: 'open' },
      });
      expect(mockPrisma.discrepancy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          periodFactId: 10,
          type: 2,
          status: 'open',
          scPosition: 'access blocked',
        }),
      });
      expect(mockDisputeSlaService.scheduleEvents).toHaveBeenCalledWith(
        expect.objectContaining({ discrepancyId: 30, periodId: 1, boqItemId: 7 }),
      );
      expect(result).toMatchObject({ id: 30 });
    });
  });

  describe('listDiscrepancies', () => {
    it('returns all Discrepancy rows for the period', async () => {
      mockPrisma.discrepancy.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await service.listDiscrepancies(5);
      expect(mockPrisma.discrepancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { periodFact: { periodId: 5 } } }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
