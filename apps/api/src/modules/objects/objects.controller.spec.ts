import { Test } from '@nestjs/testing';
import { ObjectsController } from './objects.controller';
import { ObjectsService } from './objects.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { CreateParticipantDto } from './dto/create-participant.dto';

const USER_ID = 42;
const OBJECT_ID = 10;

const mockReq = {
  user: { id: String(USER_ID), email: 'admin@example.com', role: 'admin' },
};

describe('ObjectsController', () => {
  let controller: ObjectsController;
  let objectsService: jest.Mocked<ObjectsService>;

  beforeEach(async () => {
    objectsService = {
      create: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue([]),
      getDetail: jest.fn().mockResolvedValue({}),
      addParticipant: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ObjectsService>;

    const module = await Test.createTestingModule({
      controllers: [ObjectsController],
      providers: [{ provide: ObjectsService, useValue: objectsService }],
    }).compile();

    controller = module.get(ObjectsController);
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateObjectDto = { name: 'Склад №1', objectClass: 'II' };

    it('delegates to objectsService.create with numeric userId and dto', async () => {
      await controller.create(dto, mockReq);

      expect(objectsService.create).toHaveBeenCalledWith(USER_ID, dto);
    });

    it('returns the service result', async () => {
      const expected = { id: OBJECT_ID, name: 'Склад №1', status: 'active' };
      objectsService.create.mockResolvedValue(expected as any);

      const result = await controller.create(dto, mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── list ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to objectsService.list with numeric userId', async () => {
      await controller.list(mockReq);

      expect(objectsService.list).toHaveBeenCalledWith(USER_ID);
    });

    it('returns the service result', async () => {
      const expected = [
        { id: 1, name: 'A', status: 'active' },
        { id: 2, name: 'B', status: 'active' },
      ];
      objectsService.list.mockResolvedValue(expected as any);

      const result = await controller.list(mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── getDetail ────────────────────────────────────────────────────────────────

  describe('getDetail', () => {
    it('delegates to objectsService.getDetail with numeric userId and id', async () => {
      await controller.getDetail(OBJECT_ID, mockReq);

      expect(objectsService.getDetail).toHaveBeenCalledWith(USER_ID, OBJECT_ID);
    });

    it('parses user id string to number before passing to service', async () => {
      const reqWithDifferentId = {
        user: { id: '7', email: 'a@b.com', role: 'admin' },
      };
      await controller.getDetail(OBJECT_ID, reqWithDifferentId);

      expect(objectsService.getDetail).toHaveBeenCalledWith(7, OBJECT_ID);
    });

    it('returns the service result', async () => {
      const expected = {
        object: { id: OBJECT_ID },
        hasAnalytics: false,
        current: null,
      };
      objectsService.getDetail.mockResolvedValue(expected as any);

      const result = await controller.getDetail(OBJECT_ID, mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── addParticipant ───────────────────────────────────────────────────────────

  describe('addParticipant', () => {
    const dto: CreateParticipantDto = {
      participantRole: 'general_contractor',
      orgName: 'ООО Строй',
      validFrom: '2026-05-01',
    };

    it('delegates to objectsService.addParticipant with userId, objectId and dto', async () => {
      await controller.addParticipant(OBJECT_ID, dto, mockReq);

      expect(objectsService.addParticipant).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        dto,
      );
    });

    it('returns the service result', async () => {
      const expected = {
        id: 1,
        participantRole: 'general_contractor',
        orgName: 'ООО Строй',
        validFrom: '2026-05-01',
        isCurrent: true,
      };
      objectsService.addParticipant.mockResolvedValue(expected as any);

      const result = await controller.addParticipant(OBJECT_ID, dto, mockReq);

      expect(result).toEqual(expected);
    });
  });
});
