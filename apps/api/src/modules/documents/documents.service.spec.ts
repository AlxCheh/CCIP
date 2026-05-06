import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from './storage.service';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const OBJECT_ID = 10;
const NOW = new Date('2026-05-06T10:00:00Z');

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
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

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: jest.Mocked<PrismaService>;
  let storage: jest.Mocked<StorageService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ organizationId: ORG_ID }) },
      constructionObject: { findUnique: jest.fn().mockResolvedValue({ organizationId: ORG_ID }) },
      l2Document: { create: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;

    storage = {
      upload: jest.fn().mockResolvedValue('some/key'),
    } as unknown as jest.Mocked<StorageService>;

    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  // ─── upload ──────────────────────────────────────────────────────────────────

  describe('upload', () => {
    const dto = { docType: 'ssr', version: '1.0' };

    const mockDoc = {
      id: 1, docType: 'ssr', version: '1.0',
      filePath: `${ORG_ID}/${OBJECT_ID}/ssr/1234567890-plan.pdf`,
      uploadedAt: NOW,
    };

    beforeEach(() => {
      (prisma.l2Document.create as jest.Mock).mockResolvedValue(mockDoc);
    });

    it('uploads file to storage with correct S3 key format', async () => {
      await service.upload(USER_ID, OBJECT_ID, dto, makeFile());

      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${ORG_ID}/${OBJECT_ID}/ssr/\\d+-plan\\.pdf$`)),
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('sanitizes filename — replaces special characters', async () => {
      await service.upload(USER_ID, OBJECT_ID, dto, makeFile({ originalname: 'смета v1.0 (финал).pdf' }));

      const uploadedKey = (storage.upload as jest.Mock).mock.calls[0][0] as string;
      const filename = uploadedKey.split('/').pop()!;
      expect(filename).toMatch(/^[\d]+-[a-zA-Z0-9._-]+$/);
    });

    it('saves L2Document record with correct data', async () => {
      await service.upload(USER_ID, OBJECT_ID, dto, makeFile());

      expect(prisma.l2Document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            docType: 'ssr',
            version: '1.0',
            uploadedBy: USER_ID,
          }),
        }),
      );
    });

    it('filePath in DB matches key passed to storage', async () => {
      await service.upload(USER_ID, OBJECT_ID, dto, makeFile());

      const uploadedKey = (storage.upload as jest.Mock).mock.calls[0][0] as string;
      const createCall = (prisma.l2Document.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.filePath).toBe(uploadedKey);
    });

    it('returns document with uploadedAt as ISO string', async () => {
      const result = await service.upload(USER_ID, OBJECT_ID, dto, makeFile());

      expect(result.id).toBe(1);
      expect(result.docType).toBe('ssr');
      expect(result.uploadedAt).toBe(NOW.toISOString());
    });

    it('throws NotFoundException when object not found', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.upload(USER_ID, OBJECT_ID, dto, makeFile()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when object belongs to different org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.upload(USER_ID, OBJECT_ID, dto, makeFile()),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not call storage.upload when access check fails', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.upload(USER_ID, OBJECT_ID, dto, makeFile()),
      ).rejects.toThrow();

      expect(storage.upload).not.toHaveBeenCalled();
    });
  });
});
