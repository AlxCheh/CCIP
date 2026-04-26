import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async openPeriod(objectId: number, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(objectId)})::bigint)`;

      const obj = await tx.constructionObject.findUniqueOrThrow({
        where: { id: objectId },
        select: { organizationId: true },
      });

      const zeroReport = await tx.zeroReport.findFirst({
        where: { objectId, status: 'approved' },
      });
      if (!zeroReport) {
        throw new ForbiddenException('ZERO_REPORT_NOT_APPROVED');
      }

      const openPeriod = await tx.period.findFirst({
        where: { objectId, status: 'open' },
      });
      if (openPeriod) {
        throw new ConflictException('PERIOD_ALREADY_OPEN');
      }

      const last = await tx.period.findFirst({
        where: { objectId },
        orderBy: { periodNumber: 'desc' },
      });

      const boqVersion = await tx.boqVersion.findFirstOrThrow({
        where: { objectId, isActive: true },
        select: { id: true },
      });

      const period = await tx.period.create({
        data: {
          objectId,
          boqVersionId: boqVersion.id,
          periodNumber: (last?.periodNumber ?? 0) + 1,
          status: 'open',
          openedBy: actorId,
          openedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          tableName: 'periods',
          recordId: BigInt(period.id),
          action: 'period_opened',
          newData: { objectId, periodNumber: period.periodNumber },
          performedBy: actorId,
          organizationId: obj.organizationId,
        },
      });

      return period;
    });
  }

  async closePeriod(periodId: number, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
        include: { object: { select: { organizationId: true } } },
      });

      if (period.status !== 'open') {
        throw new ConflictException('PERIOD_NOT_OPEN');
      }

      const updated = await tx.period.update({
        where: { id: periodId },
        data: { status: 'closed', closedAt: new Date(), closedBy: actorId },
      });

      await tx.auditLog.create({
        data: {
          tableName: 'periods',
          recordId: BigInt(periodId),
          action: 'period_closed',
          performedBy: actorId,
          organizationId: period.object.organizationId,
        },
      });

      return updated;
    });
  }

  async findByObject(objectId: number) {
    return this.prisma.period.findMany({
      where: { objectId },
      orderBy: { periodNumber: 'desc' },
    });
  }
}
