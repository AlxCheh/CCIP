import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SystemConfigService } from './system-config.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const NOW = new Date('2026-05-06T10:00:00Z');

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ organizationId: ORG_ID }) },
      systemConfig: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        SystemConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SystemConfigService);
  });

  // ─── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all configs for user org', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([
        { key: 'N_flag_threshold', valueType: 'numeric', valueNumeric: 3, description: 'Min discrepancies', updatedAt: NOW },
        { key: 'decay_factor', valueType: 'numeric', valueNumeric: 0.9, description: 'Decay factor', updatedAt: null },
      ]);

      const result = await service.list(USER_ID);

      expect(prisma.systemConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG_ID } }),
      );
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('N_flag_threshold');
      expect(result[0].value).toBe(3);
    });

    it('converts valueNumeric to number', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([
        { key: 'weight_threshold', valueType: 'numeric', valueNumeric: 0.1, description: null, updatedAt: NOW },
      ]);

      const result = await service.list(USER_ID);

      expect(typeof result[0].value).toBe('number');
      expect(result[0].value).toBe(0.1);
    });

    it('returns null value when valueNumeric is null', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([
        { key: 'N_flag_threshold', valueType: 'numeric', valueNumeric: null, description: null, updatedAt: null },
      ]);

      const result = await service.list(USER_ID);

      expect(result[0].value).toBeNull();
      expect(result[0].updatedAt).toBeNull();
    });

    it('returns updatedAt as ISO string when present', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([
        { key: 'N_flag_threshold', valueType: 'numeric', valueNumeric: 3, description: null, updatedAt: NOW },
      ]);

      const result = await service.list(USER_ID);

      expect(result[0].updatedAt).toBe(NOW.toISOString());
    });

    it('returns empty array when no configs exist', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.list(USER_ID);

      expect(result).toEqual([]);
    });

    it('propagates error when user is not found', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockRejectedValue(
        new Error('No User found'),
      );

      await expect(service.list(USER_ID)).rejects.toThrow('No User found');
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const mockConfig = {
      key: 'N_flag_threshold',
      valueType: 'numeric',
      valueNumeric: 5,
      description: 'Min discrepancies',
      updatedAt: NOW,
    };

    beforeEach(() => {
      (prisma.systemConfig.upsert as jest.Mock).mockResolvedValue(mockConfig);
    });

    it('throws BadRequestException for unknown key', async () => {
      await expect(
        service.update(USER_ID, 'unknown_key', { value: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException with key name in message', async () => {
      await expect(
        service.update(USER_ID, 'bad_key', { value: 10 }),
      ).rejects.toThrow('bad_key');
    });

    it('calls upsert with correct composite key and new value', async () => {
      await service.update(USER_ID, 'N_flag_threshold', { value: 5 });

      expect(prisma.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_key: { organizationId: ORG_ID, key: 'N_flag_threshold' } },
          update: expect.objectContaining({ valueNumeric: 5, updatedBy: USER_ID }),
          create: expect.objectContaining({
            key: 'N_flag_threshold',
            organizationId: ORG_ID,
            valueType: 'numeric',
            valueNumeric: 5,
          }),
        }),
      );
    });

    it('sets updatedAt to approximately current time', async () => {
      const before = Date.now();
      await service.update(USER_ID, 'N_flag_threshold', { value: 5 });
      const after = Date.now();

      const upsertArgs = (prisma.systemConfig.upsert as jest.Mock).mock.calls[0][0];
      const updatedAt: Date = upsertArgs.update.updatedAt;

      expect(updatedAt).toBeInstanceOf(Date);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('returns updated config with value as number', async () => {
      const result = await service.update(USER_ID, 'N_flag_threshold', { value: 5 });

      expect(result.key).toBe('N_flag_threshold');
      expect(result.value).toBe(5);
      expect(result.updatedAt).toBe(NOW.toISOString());
    });

    it('propagates error when user is not found', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockRejectedValue(
        new Error('No User found'),
      );

      await expect(
        service.update(USER_ID, 'N_flag_threshold', { value: 5 }),
      ).rejects.toThrow('No User found');
    });

    it.each([
      'N_flag_threshold', 'M_flag_window', 'weight_threshold',
      'forecast_gap_alert', 'tolerance_threshold', 'overrun_warning_limit',
      'avg_pace_periods', 'decay_factor', 'spike_threshold',
      'zero_report_alert_days', 'baseline_correction_threshold',
    ])('accepts known key: %s', async (key) => {
      await expect(
        service.update(USER_ID, key, { value: 1 }),
      ).resolves.not.toThrow();
    });
  });
});
