import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ObjectParticipantsService } from './object-participants.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { ChangeGeneralContractorDto } from './dto/change-general-contractor.dto';

const ORG_ID = 'org-uuid-001';
const USER_ID = 1;
const OBJECT_ID = 10;

const mockUser = { organizationId: ORG_ID };
const mockObject = { organizationId: ORG_ID };

const makeDto = (
  overrides: Partial<ChangeGeneralContractorDto> = {},
): ChangeGeneralContractorDto => ({
  orgName: 'ООО СтройГенПодряд',
  validFrom: '2026-07-15',
  reason: 'Расторжение договора с прежним ГП',
  ...overrides,
});

describe('ObjectParticipantsService', () => {
  let service: ObjectParticipantsService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser) },
      constructionObject: {
        findUnique: jest.fn().mockResolvedValue(mockObject),
      },
      period: { findFirst: jest.fn().mockResolvedValue(null) },
      discrepancy: { count: jest.fn().mockResolvedValue(0) },
      objectParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: 5,
          participantRole: 'general_contractor',
          orgName: 'ООО СтройГенПодряд',
          contactPerson: null,
          contactEmail: null,
          validFrom: new Date('2026-07-15'),
          isCurrent: true,
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditLogService>;

    const module = await Test.createTestingModule({
      providers: [
        ObjectParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get(ObjectParticipantsService);
  });

  describe('changeGeneralContractor', () => {
    it('throws NotFoundException when object is outside the user org', async () => {
      (prisma.constructionObject.findUnique as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      });

      await expect(
        service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the object has an open period', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue({ id: 3 });

      await expect(
        service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when there are open discrepancies', async () => {
      (prisma.discrepancy.count as jest.Mock).mockResolvedValue(2);

      await expect(
        service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('closes the current GC record (SCD2) and creates the new one', async () => {
      await service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto());

      expect(prisma.objectParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          objectId: OBJECT_ID,
          participantRole: 'general_contractor',
          isCurrent: true,
        },
        data: expect.objectContaining({
          isCurrent: false,
          changedBy: USER_ID,
          changedReason: 'Расторжение договора с прежним ГП',
        }),
      });
      expect(prisma.objectParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            participantRole: 'general_contractor',
            orgName: 'ООО СтройГенПодряд',
            isCurrent: true,
          }),
        }),
      );
    });

    it('writes an audit log entry for the change', async () => {
      await service.changeGeneralContractor(USER_ID, OBJECT_ID, makeDto());

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'object_participants',
          action: 'general_contractor_changed',
          performedBy: USER_ID,
          organizationId: ORG_ID,
        }),
      );
    });
  });
});
