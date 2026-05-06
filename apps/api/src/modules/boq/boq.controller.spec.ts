import { Test } from '@nestjs/testing';
import { BoqController } from './boq.controller';
import { BoqService } from './boq.service';
import { CreateBoqDto } from './dto/create-boq.dto';

const USER_ID = 42;
const OBJECT_ID = 10;

const mockReq = {
  user: { id: String(USER_ID), email: 'admin@example.com', role: 'admin' },
};

const makeDto = (): CreateBoqDto => ({
  items: [
    {
      workCode: 'W-01',
      name: 'Земляные работы',
      planVolume: 100,
      contractValue: 600_000,
    },
  ],
});

describe('BoqController', () => {
  let controller: BoqController;
  let boqService: jest.Mocked<BoqService>;

  beforeEach(async () => {
    boqService = {
      createInitial: jest.fn().mockResolvedValue({}),
      getActive: jest.fn().mockResolvedValue({}),
      listVersions: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<BoqService>;

    const module = await Test.createTestingModule({
      controllers: [BoqController],
      providers: [{ provide: BoqService, useValue: boqService }],
    }).compile();

    controller = module.get(BoqController);
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to boqService.createInitial with numeric userId, objectId and dto', async () => {
      await controller.create(OBJECT_ID, makeDto(), mockReq);

      expect(boqService.createInitial).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        makeDto(),
      );
    });

    it('parses user id string to number before passing to service', async () => {
      const reqWithLargeId = {
        user: { id: '99', email: 'a@b.com', role: 'admin' },
      };
      await controller.create(OBJECT_ID, makeDto(), reqWithLargeId);

      expect(boqService.createInitial).toHaveBeenCalledWith(
        99,
        OBJECT_ID,
        expect.anything(),
      );
    });

    it('returns the service result', async () => {
      const expected = { versionNumber: '1.0', itemsCount: 1, isActive: true };
      boqService.createInitial.mockResolvedValue(expected as any);

      const result = await controller.create(OBJECT_ID, makeDto(), mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── getActive ────────────────────────────────────────────────────────────────

  describe('getActive', () => {
    it('delegates to boqService.getActive with userId and objectId', async () => {
      await controller.getActive(OBJECT_ID, mockReq);

      expect(boqService.getActive).toHaveBeenCalledWith(USER_ID, OBJECT_ID);
    });

    it('returns the service result', async () => {
      const expected = { versionNumber: '1.0', isActive: true, items: [] };
      boqService.getActive.mockResolvedValue(expected as any);

      const result = await controller.getActive(OBJECT_ID, mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── listVersions ─────────────────────────────────────────────────────────────

  describe('listVersions', () => {
    it('delegates to boqService.listVersions with userId and objectId', async () => {
      await controller.listVersions(OBJECT_ID, mockReq);

      expect(boqService.listVersions).toHaveBeenCalledWith(USER_ID, OBJECT_ID);
    });

    it('returns the service result', async () => {
      const expected = [
        { versionNumber: '1.0', isActive: false, itemsCount: 5 },
        { versionNumber: '1.1', isActive: true, itemsCount: 6 },
      ];
      boqService.listVersions.mockResolvedValue(expected as any);

      const result = await controller.listVersions(OBJECT_ID, mockReq);

      expect(result).toEqual(expected);
    });
  });
});
