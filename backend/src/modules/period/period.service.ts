import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class PeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async openPeriod(objectId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Advisory lock: UUID → bigint через hashtext (ADR-002)
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${objectId})::bigint)`;

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

      const period = await tx.period.create({
        data: {
          objectId,
          periodNumber: (last?.periodNumber ?? 0) + 1,
          status: 'open',
          openedBy: actorId,
          openedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          periodId: period.id,
          actorId,
          action: 'period_opened',
          payload: { objectId, periodNumber: period.periodNumber },
        },
      });

      return period;
    });
  }

  async closePeriod(periodId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
      });

      if (period.status !== 'open') {
        throw new ConflictException('PERIOD_NOT_OPEN');
      }

      const updated = await tx.period.update({
        where: { id: periodId },
        data: { status: 'closed', closedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          periodId,
          actorId,
          action: 'period_closed',
        },
      });

      return updated;
    });
  }

  async findByObject(objectId: string) {
    return this.prisma.period.findMany({
      where: { objectId },
      orderBy: { periodNumber: 'desc' },
    });
  }
}
