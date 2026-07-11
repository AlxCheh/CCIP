import { Test } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

const USER_ID = 42;

const mockReq = {
  user: { id: String(USER_ID), email: 'sc@example.com', role: 'stroycontrol' },
};

describe('SyncController', () => {
  let controller: SyncController;
  let syncService: jest.Mocked<SyncService>;

  beforeEach(async () => {
    syncService = {
      processOperations: jest.fn().mockResolvedValue({ results: [] }),
      resolveConflict: jest.fn().mockResolvedValue({}),
      uploadPhoto: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<SyncService>;

    const module = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [{ provide: SyncService, useValue: syncService }],
    }).compile();

    controller = module.get(SyncController);
  });

  it('operations: delegates with numeric userId and dto', async () => {
    const dto = { deviceId: 'd1', operations: [{}] };

    await controller.processOperations(dto, mockReq);

    expect(syncService.processOperations).toHaveBeenCalledWith(USER_ID, dto);
  });

  it('resolve: delegates with numeric userId and dto', async () => {
    const dto = { syncQueueId: 11, chosenValue: 80, note: 'ок' };

    await controller.resolve(dto, mockReq);

    expect(syncService.resolveConflict).toHaveBeenCalledWith(USER_ID, dto);
  });

  it('photos: rejects a missing file and delegates when present', async () => {
    const dto = { deviceId: 'd1', clientOpId: 'p1', periodId: 100 };
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File;

    await expect(
      controller.uploadPhoto(dto, undefined as unknown as Express.Multer.File, mockReq),
    ).rejects.toThrow('FILE_REQUIRED');

    await controller.uploadPhoto(dto, file, mockReq);
    expect(syncService.uploadPhoto).toHaveBeenCalledWith(USER_ID, dto, file);
  });
});
