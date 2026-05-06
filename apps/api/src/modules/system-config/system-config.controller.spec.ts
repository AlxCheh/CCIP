import { Test } from '@nestjs/testing';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';

const USER_ID = 42;

const mockReq = { user: { id: String(USER_ID), email: 'admin@example.com', role: 'admin' } };

describe('SystemConfigController', () => {
  let controller: SystemConfigController;
  let systemConfigService: jest.Mocked<SystemConfigService>;

  beforeEach(async () => {
    systemConfigService = {
      list: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<SystemConfigService>;

    const module = await Test.createTestingModule({
      controllers: [SystemConfigController],
      providers: [{ provide: SystemConfigService, useValue: systemConfigService }],
    }).compile();

    controller = module.get(SystemConfigController);
  });

  // ─── list ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to systemConfigService.list with numeric userId', async () => {
      await controller.list(mockReq);

      expect(systemConfigService.list).toHaveBeenCalledWith(USER_ID);
    });

    it('parses user id string to number before passing to service', async () => {
      const reqWithDifferentId = { user: { id: '5', email: 'a@b.com', role: 'director' } };
      await controller.list(reqWithDifferentId);

      expect(systemConfigService.list).toHaveBeenCalledWith(5);
    });

    it('returns the full config list from service', async () => {
      const expected = [
        { key: 'min_readiness_pct', value: 70, description: 'Minimum readiness percent' },
        { key: 'staleness_days', value: 7, description: 'Days until stale' },
      ];
      systemConfigService.list.mockResolvedValue(expected as any);

      const result = await controller.list(mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto: UpdateConfigDto = { value: 75 };

    it('delegates to systemConfigService.update with numeric userId, key and dto', async () => {
      await controller.update('min_readiness_pct', dto, mockReq);

      expect(systemConfigService.update).toHaveBeenCalledWith(
        USER_ID,
        'min_readiness_pct',
        dto,
      );
    });

    it('passes the key param as-is to the service', async () => {
      await controller.update('staleness_days', dto, mockReq);

      expect(systemConfigService.update).toHaveBeenCalledWith(
        USER_ID,
        'staleness_days',
        dto,
      );
    });

    it('parses user id string to number before passing to service', async () => {
      const reqWithDifferentId = { user: { id: '99', email: 'a@b.com', role: 'admin' } };
      await controller.update('any_key', dto, reqWithDifferentId);

      expect(systemConfigService.update).toHaveBeenCalledWith(99, 'any_key', dto);
    });

    it('returns the updated config entry from service', async () => {
      const expected = { key: 'min_readiness_pct', value: 75, description: 'Minimum readiness percent' };
      systemConfigService.update.mockResolvedValue(expected as any);

      const result = await controller.update('min_readiness_pct', dto, mockReq);

      expect(result).toEqual(expected);
    });
  });
});
