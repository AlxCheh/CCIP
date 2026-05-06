import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');

describe('StorageService', () => {
  let service: StorageService;
  let mockSend: jest.Mock;

  const buildModule = async (overrideConfig?: Record<string, string>) => {
    const configValues: Record<string, string> = {
      S3_BUCKET: 'ccip-bucket',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY: 'minioadmin',
      S3_SECRET_KEY: 'minioadmin',
      ...overrideConfig,
    };

    const module = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const val = configValues[key];
              if (val === undefined) throw new Error(`Missing config: ${key}`);
              return val;
            },
            get: (key: string, defaultValue?: string) =>
              configValues[key] ?? defaultValue,
          },
        },
      ],
    }).compile();

    return module.get(StorageService);
  };

  beforeEach(async () => {
    mockSend = jest.fn().mockResolvedValue({});

    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => ({ send: mockSend }) as unknown as S3Client,
    );
    (
      PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>
    ).mockImplementation(
      (params) => ({ ...params }) as unknown as PutObjectCommand,
    );

    service = await buildModule();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── constructor ──────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initialises S3Client with endpoint, credentials and forcePathStyle', () => {
      expect(S3Client).toHaveBeenCalledWith({
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'minioadmin',
          secretAccessKey: 'minioadmin',
        },
        forcePathStyle: true,
      });
    });

    it('falls back to us-east-1 when S3_REGION is not configured', async () => {
      const configWithoutRegion: Record<string, string> = {
        S3_BUCKET: 'ccip-bucket',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
      };

      const module = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: {
              getOrThrow: (key: string) => {
                const val = configWithoutRegion[key];
                if (val === undefined)
                  throw new Error(`Missing config: ${key}`);
                return val;
              },
              get: (_key: string, defaultValue?: string) => defaultValue,
            },
          },
        ],
      }).compile();

      const svc = module.get(StorageService);
      expect(svc).toBeDefined();
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' }),
      );
    });
  });

  // ─── upload ───────────────────────────────────────────────────────────────────

  describe('upload', () => {
    it('sends PutObjectCommand with correct bucket, key, body and contentType', async () => {
      const buffer = Buffer.from('file-content');
      const key = 'org-uuid/10/ssr/1234567890-plan.pdf';

      await service.upload(key, buffer, 'application/pdf');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'ccip-bucket',
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('returns the S3 key unchanged on success', async () => {
      const key = 'org-uuid/10/rdc/456-drawing.pdf';
      const result = await service.upload(
        key,
        Buffer.from('data'),
        'application/pdf',
      );

      expect(result).toBe(key);
    });

    it('supports different MIME content types', async () => {
      await service.upload('k', Buffer.from('img'), 'image/jpeg');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'image/jpeg' }),
      );
    });

    it('works with an empty buffer', async () => {
      const result = await service.upload(
        'empty-key',
        Buffer.alloc(0),
        'application/pdf',
      );

      expect(result).toBe('empty-key');
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Body: Buffer.alloc(0) }),
      );
    });

    it('throws InternalServerErrorException when S3 send fails', async () => {
      mockSend.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.upload('any/key', Buffer.from('data'), 'application/pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('wraps S3 error with STORAGE_UPLOAD_FAILED message', async () => {
      mockSend.mockRejectedValue(new Error('Access Denied'));

      await expect(
        service.upload('any/key', Buffer.from('data'), 'application/pdf'),
      ).rejects.toThrow('STORAGE_UPLOAD_FAILED');
    });

    it('does not swallow the original error type — always maps to 500', async () => {
      mockSend.mockRejectedValue({ code: 'NoSuchBucket' });

      const err = await service
        .upload('k', Buffer.from('x'), 'application/pdf')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InternalServerErrorException);
    });
  });
});
