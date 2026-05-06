import { Test } from '@nestjs/testing';
import { ZeroReportController } from '../zero-report.controller';
import { ZeroReportService } from '../zero-report.service';
import { CreateZeroReportDto } from '../dto/create-zero-report.dto';
import { UpsertZeroReportItemDto } from '../dto/upsert-zero-report-item.dto';

const USER_ID = 1;
const DIRECTOR_ID = 2;
const OBJECT_ID = 10;

const mockScReq = {
  user: { id: String(USER_ID), email: 'sc@example.com', role: 'site_engineer' },
};
const mockDirectorReq = {
  user: {
    id: String(DIRECTOR_ID),
    email: 'director@example.com',
    role: 'director',
  },
};

const makeCreateDto = (): CreateZeroReportDto => ({ boqVersionId: 5 });
const makeItemDto = (): UpsertZeroReportItemDto => ({
  boqItemId: 50,
  factVolume: 100,
  source: 'field',
});

const mockReport = {
  id: 100,
  objectId: OBJECT_ID,
  boqVersionId: 5,
  status: 'draft',
  submittedAt: null,
  submittedBy: null,
  approvedAt: null,
  approvedBy: null,
  notes: null,
};

const mockItem = {
  id: 1,
  zeroReportId: 100,
  boqItemId: 50,
  factVolume: 100,
  source: 'field',
  doc1Value: null,
  doc2Value: null,
  doc3Value: null,
  crossVerified: false,
  notes: null,
};

describe('ZeroReportController', () => {
  let controller: ZeroReportController;
  let zeroReportService: jest.Mocked<ZeroReportService>;

  beforeEach(async () => {
    zeroReportService = {
      create: jest.fn().mockResolvedValue(mockReport),
      getByObject: jest.fn().mockResolvedValue({ ...mockReport, items: [] }),
      upsertItem: jest.fn().mockResolvedValue(mockItem),
      submit: jest
        .fn()
        .mockResolvedValue({ ...mockReport, status: 'submitted' }),
      approve: jest
        .fn()
        .mockResolvedValue({ ...mockReport, status: 'approved' }),
    } as unknown as jest.Mocked<ZeroReportService>;

    const module = await Test.createTestingModule({
      controllers: [ZeroReportController],
      providers: [{ provide: ZeroReportService, useValue: zeroReportService }],
    }).compile();

    controller = module.get(ZeroReportController);
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to zeroReportService.create with numeric userId, objectId and dto', async () => {
      await controller.create(OBJECT_ID, makeCreateDto(), mockScReq);

      expect(zeroReportService.create).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        makeCreateDto(),
      );
    });

    it('parses user id string to number before passing to service', async () => {
      const req = {
        user: { id: '99', email: 'sc@test.com', role: 'site_engineer' },
      };
      await controller.create(OBJECT_ID, makeCreateDto(), req);

      expect(zeroReportService.create).toHaveBeenCalledWith(
        99,
        OBJECT_ID,
        expect.anything(),
      );
    });

    it('returns the service result', async () => {
      zeroReportService.create.mockResolvedValue(mockReport as any);

      const result = await controller.create(
        OBJECT_ID,
        makeCreateDto(),
        mockScReq,
      );

      expect(result).toEqual(mockReport);
    });
  });

  // ─── getByObject ──────────────────────────────────────────────────────────────

  describe('getByObject', () => {
    it('delegates to zeroReportService.getByObject with userId and objectId', async () => {
      await controller.getByObject(OBJECT_ID, mockScReq);

      expect(zeroReportService.getByObject).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
      );
    });

    it('returns the service result with items', async () => {
      const expected = { ...mockReport, items: [mockItem] };
      zeroReportService.getByObject.mockResolvedValue(expected as any);

      const result = await controller.getByObject(OBJECT_ID, mockScReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── upsertItem ───────────────────────────────────────────────────────────────

  describe('upsertItem', () => {
    it('delegates to zeroReportService.upsertItem with userId, objectId and dto', async () => {
      await controller.upsertItem(OBJECT_ID, makeItemDto(), mockScReq);

      expect(zeroReportService.upsertItem).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        makeItemDto(),
      );
    });

    it('returns the service result', async () => {
      zeroReportService.upsertItem.mockResolvedValue(mockItem);

      const result = await controller.upsertItem(
        OBJECT_ID,
        makeItemDto(),
        mockScReq,
      );

      expect(result).toEqual(mockItem);
    });
  });

  // ─── submit ───────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('delegates to zeroReportService.submit with userId and objectId', async () => {
      await controller.submit(OBJECT_ID, mockScReq);

      expect(zeroReportService.submit).toHaveBeenCalledWith(USER_ID, OBJECT_ID);
    });

    it('returns submitted report from service', async () => {
      const expected = { ...mockReport, status: 'submitted' };
      zeroReportService.submit.mockResolvedValue(expected as any);

      const result = await controller.submit(OBJECT_ID, mockScReq);

      expect(result).toEqual(expected);
    });
  });

  // ─── approve ──────────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('delegates to zeroReportService.approve with director userId and objectId', async () => {
      await controller.approve(OBJECT_ID, mockDirectorReq);

      expect(zeroReportService.approve).toHaveBeenCalledWith(
        DIRECTOR_ID,
        OBJECT_ID,
      );
    });

    it('parses director user id string to number', async () => {
      const req = {
        user: { id: '99', email: 'director@test.com', role: 'director' },
      };
      await controller.approve(OBJECT_ID, req);

      expect(zeroReportService.approve).toHaveBeenCalledWith(99, OBJECT_ID);
    });

    it('returns approved report from service', async () => {
      const expected = { ...mockReport, status: 'approved' };
      zeroReportService.approve.mockResolvedValue(expected as any);

      const result = await controller.approve(OBJECT_ID, mockDirectorReq);

      expect(result).toEqual(expected);
    });
  });
});
