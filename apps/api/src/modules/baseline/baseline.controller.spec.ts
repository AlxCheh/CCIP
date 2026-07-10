import { Test } from '@nestjs/testing';
import { BaselineController } from './baseline.controller';
import { BaselineService } from './baseline.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';

const USER_ID = 42;
const OBJECT_ID = 10;

const mockReq = {
  user: { id: String(USER_ID), email: 'sc@example.com', role: 'stroycontrol' },
};

const makeDto = (): CreateBaselineUpdateRequestDto => ({
  boqItemId: 1,
  newPlanVolume: 600,
  reason: 'Уточнение объёма по факту обмера',
});

describe('BaselineController', () => {
  let controller: BaselineController;
  let baselineService: jest.Mocked<BaselineService>;

  beforeEach(async () => {
    baselineService = {
      createRequest: jest.fn().mockResolvedValue({}),
      approveRequest: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<BaselineService>;

    const module = await Test.createTestingModule({
      controllers: [BaselineController],
      providers: [{ provide: BaselineService, useValue: baselineService }],
    }).compile();

    controller = module.get(BaselineController);
  });

  describe('createRequest', () => {
    it('delegates to baselineService.createRequest with numeric userId, objectId and dto', async () => {
      await controller.createRequest(OBJECT_ID, makeDto(), mockReq);

      expect(baselineService.createRequest).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        makeDto(),
      );
    });
  });

  describe('approve', () => {
    it('delegates to baselineService.approveRequest with numeric userId, requestId and dto', async () => {
      await controller.approve(7, { reviewNotes: 'ок' }, mockReq);

      expect(baselineService.approveRequest).toHaveBeenCalledWith(
        USER_ID,
        7,
        { reviewNotes: 'ок' },
      );
    });
  });
});
