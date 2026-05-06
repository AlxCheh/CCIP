import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const USER_ID = 42;
const OBJECT_ID = 10;

const mockReq = {
  user: { id: String(USER_ID), email: 'admin@example.com', role: 'admin' },
};

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'plan.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  buffer: Buffer.from('fake-pdf'),
  size: 8,
  stream: null as never,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let documentsService: jest.Mocked<DocumentsService>;

  beforeEach(async () => {
    documentsService = {
      upload: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<DocumentsService>;

    const module = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: documentsService }],
    }).compile();

    controller = module.get(DocumentsController);
  });

  // ─── upload ───────────────────────────────────────────────────────────────────

  describe('upload', () => {
    const dto: UploadDocumentDto = { docType: 'ssr', version: '1.0' };

    it('throws BadRequestException when no file is provided', () => {
      expect(() =>
        controller.upload(
          OBJECT_ID,
          dto,
          undefined as unknown as Express.Multer.File,
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('throws with FILE_REQUIRED message when file is absent', () => {
      expect(() =>
        controller.upload(
          OBJECT_ID,
          dto,
          undefined as unknown as Express.Multer.File,
          mockReq,
        ),
      ).toThrow('FILE_REQUIRED');
    });

    it('does not call service when file is absent', () => {
      try {
        controller.upload(
          OBJECT_ID,
          dto,
          undefined as unknown as Express.Multer.File,
          mockReq,
        );
      } catch {
        // expected throw
      }

      expect(documentsService.upload).not.toHaveBeenCalled();
    });

    it('delegates to documentsService.upload with numeric userId, objectId, dto and file', async () => {
      const file = makeFile();
      await controller.upload(OBJECT_ID, dto, file, mockReq);

      expect(documentsService.upload).toHaveBeenCalledWith(
        USER_ID,
        OBJECT_ID,
        dto,
        file,
      );
    });

    it('parses user id string to number before passing to service', async () => {
      const reqWithDifferentId = {
        user: { id: '7', email: 'a@b.com', role: 'admin' },
      };
      await controller.upload(OBJECT_ID, dto, makeFile(), reqWithDifferentId);

      expect(documentsService.upload).toHaveBeenCalledWith(
        7,
        OBJECT_ID,
        dto,
        expect.anything(),
      );
    });

    it('returns the service result', async () => {
      const expected = {
        id: 1,
        docType: 'ssr',
        version: '1.0',
        filePath: 'org/10/ssr/123-plan.pdf',
        uploadedAt: new Date().toISOString(),
      };
      documentsService.upload.mockResolvedValue(expected);

      const result = await controller.upload(
        OBJECT_ID,
        dto,
        makeFile(),
        mockReq,
      );

      expect(result).toEqual(expected);
    });
  });
});
