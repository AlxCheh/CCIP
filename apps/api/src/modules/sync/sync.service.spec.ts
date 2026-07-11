import { ForbiddenException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PeriodService } from '../period/period.service';
import { StorageService } from '../documents/storage.service';
import { VersionConflictException } from '../period/version-conflict.exception';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const PERIOD_ID = 100;
const BOQ_ITEM_ID = 50;
const DEVICE_ID = 'device-abc';

const makeOp = (overrides: Record<string, unknown> = {}) => ({
  clientOpId: 'op-uuid-1',
  operation: 'submit_fact',
  clientTimestamp: '2026-07-10T08:00:00Z',
  boqVersionNumber: '1.0',
  lastKnownVersion: 1,
  payload: { periodId: PERIOD_ID, boqItemId: BOQ_ITEM_ID, scVolume: 80 },
  ...overrides,
});

const makeQueueRow = (overrides: Record<string, unknown> = {}) => ({
  id: BigInt(11),
  deviceId: DEVICE_ID,
  clientOpId: 'op-uuid-1',
  status: 'pending',
  conflictData: null,
  payload: { periodId: PERIOD_ID, boqItemId: BOQ_ITEM_ID, scVolume: 80 },
  ...overrides,
});

describe('SyncService', () => {
  let service: SyncService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLog: jest.Mocked<AuditLogService>;
  let periodService: jest.Mocked<PeriodService>;
  let storage: jest.Mocked<StorageService>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ organizationId: ORG_ID }),
        findMany: jest.fn().mockResolvedValue([{ id: 9 }]),
      },
      period: {
        findUnique: jest.fn().mockResolvedValue({
          id: PERIOD_ID,
          status: 'verification',
          object: { organizationId: ORG_ID },
          boqVersion: { versionNumber: '1.0' },
        }),
      },
      periodFact: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 200, scVolume: 75, version: 3 }),
      },
      syncQueue: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeQueueRow()),
        update: jest.fn().mockResolvedValue(makeQueueRow()),
      },
      discrepancy: { create: jest.fn().mockResolvedValue({ id: 30 }) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({
          performedBy: 2,
          performedAt: new Date('2026-07-09T12:00:00Z'),
        }),
      },
      photo: { create: jest.fn().mockResolvedValue({ id: 77 }) },
    } as unknown as jest.Mocked<PrismaService>;

    auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditLogService>;
    periodService = {
      upsertPeriodFact: jest.fn().mockResolvedValue({ id: 200, version: 2 }),
    } as unknown as jest.Mocked<PeriodService>;
    storage = { upload: jest.fn().mockResolvedValue('key') } as unknown as jest.Mocked<StorageService>;

    const module = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: PeriodService, useValue: periodService },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(SyncService);
  });

  describe('processOperations', () => {
    it('applies a valid operation: queue row created, CAS delegated, row applied', async () => {
      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp()],
      });

      expect(prisma.syncQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceId: DEVICE_ID,
            clientOpId: 'op-uuid-1',
            operation: 'submit_fact',
            status: 'pending',
            lastKnownVersion: 1,
            boqVersionNumber: '1.0',
          }),
        }),
      );
      expect(periodService.upsertPeriodFact).toHaveBeenCalledWith(
        PERIOD_ID,
        BOQ_ITEM_ID,
        80,
        USER_ID,
        expect.objectContaining({ expectedVersion: 1 }),
      );
      expect(prisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'applied' } }),
      );
      expect(results).toEqual([
        expect.objectContaining({ clientOpId: 'op-uuid-1', status: 'applied' }),
      ]);
    });

    it('returns the stored result for a duplicate clientOpId without re-applying', async () => {
      (prisma.syncQueue.findUnique as jest.Mock).mockResolvedValue(
        makeQueueRow({ status: 'applied' }),
      );

      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp()],
      });

      expect(periodService.upsertPeriodFact).not.toHaveBeenCalled();
      expect(prisma.syncQueue.create).not.toHaveBeenCalled();
      expect(results[0]).toEqual(
        expect.objectContaining({ status: 'applied', duplicate: true }),
      );
    });

    it('rejects an invalid item per-item without failing the batch', async () => {
      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [{ operation: 'unknown_op' }, makeOp()],
      });

      expect(results[0]).toEqual(
        expect.objectContaining({ status: 'rejected' }),
      );
      expect(results[1]).toEqual(
        expect.objectContaining({ status: 'applied' }),
      );
      // инвалидный элемент не попадает в очередь (operation CHECK в БД)
      expect(prisma.syncQueue.create).toHaveBeenCalledTimes(1);
    });

    it('rejects with BOQ_VERSION_MISMATCH on ADR-006 version gating', async () => {
      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp({ boqVersionNumber: '0.9' })],
      });

      expect(periodService.upsertPeriodFact).not.toHaveBeenCalled();
      expect(results[0]).toEqual(
        expect.objectContaining({
          status: 'rejected',
          reason: 'BOQ_VERSION_MISMATCH',
        }),
      );
    });

    it('marks conflict with server/device snapshots and stops the batch (last-write-wins impossible)', async () => {
      (periodService.upsertPeriodFact as jest.Mock).mockRejectedValue(
        new VersionConflictException({ factId: 200, scVolume: 75, version: 3 }),
      );

      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp(), makeOp({ clientOpId: 'op-uuid-2' })],
      });

      expect(results[0]).toEqual(
        expect.objectContaining({
          status: 'conflict',
          conflictData: expect.objectContaining({
            server: expect.objectContaining({ scVolume: 75, version: 3 }),
            device: expect.objectContaining({ scVolume: 80, lastKnownVersion: 1 }),
          }),
        }),
      );
      // sync-engine §9: остаток батча не применяется и не попадает в очередь
      expect(results[1]).toEqual(
        expect.objectContaining({ clientOpId: 'op-uuid-2', status: 'skipped' }),
      );
      expect(periodService.upsertPeriodFact).toHaveBeenCalledTimes(1);
      expect(prisma.syncQueue.create).toHaveBeenCalledTimes(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sync_conflict_detected' }),
      );
    });

    it('escalates a closed-period conflict: discrepancy type 3 + admin notification + escalated', async () => {
      (periodService.upsertPeriodFact as jest.Mock).mockRejectedValue(
        new ForbiddenException('PERIOD_ALREADY_CLOSED'),
      );

      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp()],
      });

      expect(prisma.discrepancy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 3, status: 'open' }),
        }),
      );
      expect(prisma.notification.createMany).toHaveBeenCalled();
      expect(prisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'escalated' }),
        }),
      );
      expect(results[0]).toEqual(
        expect.objectContaining({ status: 'escalated' }),
      );
    });

    it('rejects with the domain reason code on domain refusal', async () => {
      (periodService.upsertPeriodFact as jest.Mock).mockRejectedValue(
        new ConflictException('PERIOD_WRONG_STATUS'),
      );

      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp()],
      });

      expect(results[0]).toEqual(
        expect.objectContaining({
          status: 'rejected',
          reason: 'PERIOD_WRONG_STATUS',
        }),
      );
    });

    it('rejects with PERIOD_NOT_FOUND when the period belongs to another org', async () => {
      (prisma.period.findUnique as jest.Mock).mockResolvedValue({
        id: PERIOD_ID,
        status: 'verification',
        object: { organizationId: 'other-org' },
        boqVersion: { versionNumber: '1.0' },
      });

      const { results } = await service.processOperations(USER_ID, {
        deviceId: DEVICE_ID,
        operations: [makeOp()],
      });

      expect(periodService.upsertPeriodFact).not.toHaveBeenCalled();
      expect(results[0]).toEqual(
        expect.objectContaining({ status: 'rejected', reason: 'PERIOD_NOT_FOUND' }),
      );
    });
  });

  describe('resolveConflict', () => {
    const resolveDto = { syncQueueId: 11, chosenValue: 80, note: 'обмер подтверждён' };

    beforeEach(() => {
      (prisma.syncQueue.findUnique as jest.Mock).mockResolvedValue(
        makeQueueRow({
          status: 'conflict',
          conflictData: {
            server: { scVolume: 75, version: 3 },
            device: { scVolume: 80, lastKnownVersion: 1 },
          },
        }),
      );
    });

    it('throws NotFoundException when the queue row does not exist', async () => {
      (prisma.syncQueue.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.resolveConflict(USER_ID, resolveDto),
      ).rejects.toThrow('SYNC_OPERATION_NOT_FOUND');
    });

    it('throws ConflictException when the row is not in conflict status', async () => {
      (prisma.syncQueue.findUnique as jest.Mock).mockResolvedValue(
        makeQueueRow({ status: 'applied' }),
      );

      await expect(
        service.resolveConflict(USER_ID, resolveDto),
      ).rejects.toThrow('SYNC_NOT_IN_CONFLICT');
    });

    it('re-reads the fresh server value from DB, applies the chosen value and marks resolved', async () => {
      await service.resolveConflict(USER_ID, resolveDto);

      // ADR-003: перечитывание из БД, не из conflict_data
      expect(prisma.periodFact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { periodId: PERIOD_ID, boqItemId: BOQ_ITEM_ID },
        }),
      );
      expect(periodService.upsertPeriodFact).toHaveBeenCalledWith(
        PERIOD_ID,
        BOQ_ITEM_ID,
        80,
        USER_ID,
      );
      expect(prisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'applied',
            resolvedBy: USER_ID,
          }),
        }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sync_conflict_resolved',
          reason: 'обмер подтверждён',
        }),
      );
    });

    it('escalates and throws PERIOD_ALREADY_CLOSED_ESCALATE when the period is closed', async () => {
      (prisma.period.findUnique as jest.Mock).mockResolvedValue({
        id: PERIOD_ID,
        status: 'closed',
        object: { organizationId: ORG_ID },
        boqVersion: { versionNumber: '1.0' },
      });

      await expect(
        service.resolveConflict(USER_ID, resolveDto),
      ).rejects.toThrow('PERIOD_ALREADY_CLOSED_ESCALATE');

      expect(prisma.discrepancy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 3 }),
        }),
      );
      expect(prisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'escalated' }),
        }),
      );
      expect(periodService.upsertPeriodFact).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the period belongs to another org', async () => {
      (prisma.period.findUnique as jest.Mock).mockResolvedValue({
        id: PERIOD_ID,
        status: 'verification',
        object: { organizationId: 'other-org' },
        boqVersion: { versionNumber: '1.0' },
      });

      await expect(
        service.resolveConflict(USER_ID, resolveDto),
      ).rejects.toThrow('PERIOD_NOT_FOUND');
    });
  });
});
