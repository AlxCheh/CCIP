import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { ChangeGeneralContractorDto } from './dto/change-general-contractor.dto';

const GENERAL_CONTRACTOR_ROLE = 'general_contractor';

@Injectable()
export class ObjectParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async changeGeneralContractor(
    userId: number,
    objectId: number,
    dto: ChangeGeneralContractorDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });
    const obj = await this.prisma.constructionObject.findUnique({
      where: { id: objectId },
      select: { organizationId: true },
    });
    if (!obj || obj.organizationId !== user.organizationId) {
      throw new NotFoundException('OBJECT_NOT_FOUND');
    }

    const validFrom = new Date(dto.validFrom);

    const newParticipant = await this.prisma.$transaction(async (tx) => {
      const openPeriod = await tx.period.findFirst({
        where: { objectId, status: 'open' },
      });
      if (openPeriod) {
        throw new ConflictException('PERIOD_OPEN_CANNOT_CHANGE_GC');
      }

      const openDisputes = await tx.discrepancy.count({
        where: { status: 'open', periodFact: { period: { objectId } } },
      });
      if (openDisputes > 0) {
        throw new ConflictException('OPEN_DISPUTES_EXIST');
      }

      await tx.objectParticipant.updateMany({
        where: {
          objectId,
          participantRole: GENERAL_CONTRACTOR_ROLE,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
          validTo: validFrom,
          changedAt: new Date(),
          changedBy: userId,
          changedReason: dto.reason,
        },
      });

      return tx.objectParticipant.create({
        data: {
          objectId,
          participantRole: GENERAL_CONTRACTOR_ROLE,
          orgName: dto.orgName,
          contactPerson: dto.contactPerson,
          contactEmail: dto.contactEmail,
          validFrom,
          isCurrent: true,
        },
        select: {
          id: true,
          participantRole: true,
          orgName: true,
          contactPerson: true,
          contactEmail: true,
          validFrom: true,
          isCurrent: true,
        },
      });
    });

    await this.auditLog.log({
      tableName: 'object_participants',
      recordId: BigInt(newParticipant.id),
      action: 'general_contractor_changed',
      newData: { objectId, orgName: dto.orgName, reason: dto.reason },
      performedBy: userId,
      organizationId: obj.organizationId,
    });

    return {
      ...newParticipant,
      validFrom: newParticipant.validFrom.toISOString().slice(0, 10),
    };
  }
}
