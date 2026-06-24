import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let service: jest.Mocked<HealthService>;

  beforeEach(() => {
    service = {
      checkLive: jest.fn().mockResolvedValue({ alive: true }),
      checkReady: jest.fn().mockResolvedValue({ postgres: true, redis: true }),
    } as unknown as jest.Mocked<HealthService>;
    controller = new HealthController(service);
  });

  it('live() returns 200 payload', async () => {
    await expect(controller.live()).resolves.toEqual({ alive: true });
  });

  it('ready() returns payload when checkReady resolves', async () => {
    await expect(controller.ready()).resolves.toEqual({
      postgres: true,
      redis: true,
    });
  });

  it('ready() throws ServiceUnavailableException when checkReady rejects', async () => {
    service.checkReady.mockRejectedValue(new Error('redis down'));
    await expect(controller.ready()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
