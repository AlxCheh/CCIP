import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@ccip/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';

// Days until GP submission token expires (default: 14 days from SystemConfig or constant)
const GP_TOKEN_EXPIRES_DAYS = 14;

// Period statuses that allow SC fact entry
const SC_FACT_ALLOWED_STATUSES = ['gp_submitted', 'verification'];

@Injectable()
export class PeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── openPeriod ──────────────────────────────────────────────────────────────

  async openPeriod(objectId: number, actorId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(('x' || left(md5(${String(objectId)}), 16))::bit(64)::bigint)`;

        const obj = await tx.constructionObject.findUniqueOrThrow({
          where: { id: objectId },
          select: { organizationId: true },
        });

        const zeroReport = await tx.zeroReport.findFirst({
          where: { objectId, status: 'approved' },
        });
        if (!zeroReport)
          throw new ForbiddenException('ZERO_REPORT_NOT_APPROVED');

        const openPeriod = await tx.period.findFirst({
          where: { objectId, status: 'open' },
        });
        if (openPeriod) throw new ConflictException('PERIOD_ALREADY_OPEN');

        const last = await tx.period.findFirst({
          where: { objectId },
          orderBy: { periodNumber: 'desc' },
        });

        const boqVersion = await tx.boqVersion.findFirstOrThrow({
          where: { objectId, isActive: true },
          select: { id: true },
        });

        const now = new Date();
        // TODO M-05b: заменить на sla_force_close_at - 1h после реализации SLA scheduler
        // Требует добавления sla_force_close_at в схему/SystemConfig
        const gpTokenExpiresAt = new Date(
          now.getTime() + GP_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
        );

        const period = await tx.period.create({
          data: {
            objectId,
            boqVersionId: boqVersion.id,
            periodNumber: (last?.periodNumber ?? 0) + 1,
            status: 'open',
            openedBy: actorId,
            openedAt: now,
            gpSubmissionToken: randomUUID(),
            gpTokenExpiresAt,
          },
        });

        // TODO M-06: отправить email ГП с gpSubmissionToken через NotificationService
        // Email должен отправляться ПОСЛЕ транзакции (не внутри)

        await this.auditLog.log({
          tableName: 'periods',
          recordId: BigInt(period.id),
          action: 'period_opened',
          newData: { objectId, periodNumber: period.periodNumber },
          performedBy: actorId,
          organizationId: obj.organizationId,
        });

        return period;
      });
    } catch (e: unknown) {
      // PostgreSQL lock timeout error code: 55P03
      if (
        e instanceof Error &&
        'code' in e &&
        (e as { code: string }).code === '55P03'
      ) {
        throw new ConflictException('PERIOD_LOCK_TIMEOUT');
      }
      throw e;
    }
  }

  // ─── findById ────────────────────────────────────────────────────────────────

  async findById(periodId: number, actorId: number) {
    const actor = await this.prisma.user.findUniqueOrThrow({
      where: { id: actorId },
      select: { organizationId: true },
    });

    const period = await this.prisma.period.findFirst({
      where: {
        id: periodId,
        object: { organizationId: actor.organizationId },
      },
      include: { periodFacts: true },
    });

    if (!period) throw new NotFoundException('PERIOD_NOT_FOUND');

    return period;
  }

  // ─── getDetail ──────────────────────────────────────────────────────────────

  async getDetail(periodId: number, actorId: number) {
    const actor = await this.prisma.user.findUniqueOrThrow({
      where: { id: actorId },
      select: { organizationId: true },
    });

    const period = await this.prisma.period.findFirst({
      where: {
        id: periodId,
        object: { organizationId: actor.organizationId },
      },
      include: {
        boqVersion: {
          include: {
            boqItems: {
              select: { id: true, workCode: true, name: true, unit: true, planVolume: true },
              orderBy: { id: 'asc' },
            },
          },
        },
        periodFacts: {
          select: {
            boqItemId: true,
            gpVolume: true,
            scVolume: true,
            discrepancyType: true,
            discrepancyStatus: true,
            acceptedVolume: true,
          },
        },
      },
    });

    if (!period) throw new NotFoundException('PERIOD_NOT_FOUND');

    const factMap = new Map(period.periodFacts.map((f) => [f.boqItemId, f]));

    const positions = period.boqVersion.boqItems.map((item) => {
      const f = factMap.get(item.id);
      return {
        boqItemId: item.id,
        workCode: item.workCode,
        name: item.name,
        unit: item.unit ?? '',
        planVolume: Number(item.planVolume),
        gpVolume: f?.gpVolume != null ? Number(f.gpVolume) : null,
        scVolume: f?.scVolume != null ? Number(f.scVolume) : null,
        discrepancyType: f?.discrepancyType ?? null,
        discrepancyStatus: f?.discrepancyStatus ?? null,
        acceptedVolume: f?.acceptedVolume != null ? Number(f.acceptedVolume) : null,
      };
    });

    const openDiscrepancyCount = await this.prisma.discrepancy.count({
      where: { periodFact: { periodId }, status: 'open' },
    });

    return {
      id: period.id,
      periodNumber: period.periodNumber,
      status: period.status as 'open' | 'gp_submitted' | 'verification' | 'closed',
      openedAt: period.openedAt.toISOString(),
      closedAt: period.closedAt?.toISOString() ?? null,
      objectId: period.objectId,
      boqVersionId: period.boqVersionId,
      positions,
      openDiscrepancyCount,
    };
  }

  // ─── GP token guard ────────────────────────────────────────────────────────────

  /**
   * Validates a GP submission token: existence, expiry, and not-yet-submitted.
   * A missing `gpTokenExpiresAt` is treated as expired so the form and the submit
   * path behave consistently. Narrows `gpTokenExpiresAt` to a non-null `Date`.
   */
  private assertGpTokenValid<
    T extends { gpTokenExpiresAt: Date | null; gpSubmittedAt: Date | null },
  >(period: T | null): asserts period is T & { gpTokenExpiresAt: Date } {
    if (!period) throw new NotFoundException('GP_TOKEN_NOT_FOUND');

    if (!period.gpTokenExpiresAt || period.gpTokenExpiresAt < new Date()) {
      throw new ForbiddenException('GP_TOKEN_EXPIRED');
    }

    if (period.gpSubmittedAt !== null) {
      throw new ForbiddenException('GP_ALREADY_SUBMITTED');
    }
  }

  // ─── assertPeriodEditable ─────────────────────────────────────────────────────

  private assertPeriodEditable(period: { status: string }): void {
    if (period.status === 'closed' || period.status === 'force_closed') {
      throw new ForbiddenException('PERIOD_ALREADY_CLOSED');
    }
  }

  // ─── getGpFormData ────────────────────────────────────────────────────────────

  async getGpFormData(token: string) {
    const period = await this.prisma.period.findFirst({
      where: { gpSubmissionToken: token },
      select: {
        periodNumber: true,
        gpTokenExpiresAt: true,
        gpSubmittedAt: true,
        object: { select: { name: true } },
        boqVersion: {
          select: {
            boqItems: {
              select: { id: true, name: true, unit: true, planVolume: true },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    });

    this.assertGpTokenValid(period);

    return {
      periodNumber: period.periodNumber,
      objectName: period.object.name,
      gpTokenExpiresAt: period.gpTokenExpiresAt.toISOString(),
      items: period.boqVersion.boqItems.map((item) => ({
        boqItemId: item.id,
        name: item.name,
        unit: item.unit ?? '',
        planVolume: Number(item.planVolume),
      })),
    };
  }

  // ─── submitGp ────────────────────────────────────────────────────────────────

  async submitGp(
    token: string,
    gpSubmittedByName: string,
    items: Array<{
      boqItemId: number;
      gpVolume: unknown;
      gpNote?: string;
    }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findFirst({
        where: { gpSubmissionToken: token },
        include: { object: { select: { organizationId: true } } },
      });

      this.assertGpTokenValid(period);

      if (period.status !== 'open') {
        throw new ConflictException('PERIOD_WRONG_STATUS');
      }

      // Upsert PeriodFact for each submitted item
      for (const item of items) {
        await tx.periodFact.upsert({
          where: {
            periodId_boqItemId: {
              periodId: period.id,
              boqItemId: item.boqItemId,
            },
          },
          create: {
            periodId: period.id,
            boqItemId: item.boqItemId,
            gpVolume: item.gpVolume as never,
            gpNote: item.gpNote ?? null,
          },
          update: {
            gpVolume: item.gpVolume as never,
            gpNote: item.gpNote ?? null,
          },
        });
      }

      const updated = await tx.period.update({
        where: { id: period.id },
        data: {
          gpSubmittedAt: new Date(),
          gpSubmittedByName,
          status: 'gp_submitted',
        },
      });

      await this.auditLog.log({
        tableName: 'periods',
        recordId: BigInt(period.id),
        action: 'gp_submitted',
        newData: { gpSubmittedByName, itemCount: items.length },
        organizationId: period.object.organizationId,
      });

      return updated;
    });
  }

  // ─── upsertPeriodFact ────────────────────────────────────────────────────────

  async upsertPeriodFact(
    periodId: number,
    boqItemId: number,
    scVolume: unknown,
    actorId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
        include: { object: { select: { organizationId: true } } },
      });

      this.assertPeriodEditable(period); // ADR-007: closed/force_closed → 403

      if (!SC_FACT_ALLOWED_STATUSES.includes(period.status)) {
        throw new ConflictException('PERIOD_WRONG_STATUS');
      }

      // Find existing fact to retrieve gpVolume for delta computation
      const existingFact = await tx.periodFact.findFirst({
        where: { periodId, boqItemId },
        select: { gpVolume: true },
      });

      // Compute discrepancy based on gpVolume
      const gpVol =
        existingFact?.gpVolume !== undefined && existingFact.gpVolume !== null
          ? Number(existingFact.gpVolume)
          : null;
      const scVol = Number(scVolume);

      let discrepancyType: number | null;
      let discrepancyStatus: string;
      let acceptedVolume: number | null;

      if (gpVol !== null && Math.abs(gpVol - scVol) === 0) {
        discrepancyType = null;
        discrepancyStatus = 'confirmed';
        acceptedVolume = scVol;
      } else {
        discrepancyType = 1;
        discrepancyStatus = 'open';
        acceptedVolume = null;
      }

      const updatedFact = await tx.periodFact.upsert({
        where: { periodId_boqItemId: { periodId, boqItemId } },
        create: {
          periodId,
          boqItemId,
          scVolume: new Prisma.Decimal(scVolume as number),
          discrepancyType,
          discrepancyStatus,
          acceptedVolume:
            acceptedVolume !== null ? new Prisma.Decimal(acceptedVolume) : null,
        },
        update: {
          scVolume: new Prisma.Decimal(scVolume as number),
          discrepancyType,
          discrepancyStatus,
          acceptedVolume:
            acceptedVolume !== null ? new Prisma.Decimal(acceptedVolume) : null,
        },
      });

      // Transition period to verification if it was in gp_submitted
      if (period.status === 'gp_submitted') {
        await tx.period.update({
          where: { id: periodId },
          data: { status: 'verification' },
        });
      }

      await this.auditLog.log({
        tableName: 'period_facts',
        recordId: BigInt(updatedFact.id),
        action: 'period_fact_upserted',
        newData: {
          periodId,
          boqItemId,
          scVolume,
          discrepancyType,
          discrepancyStatus,
        },
        performedBy: actorId,
        organizationId: period.object.organizationId,
      });

      return updatedFact;
    });
  }

  // ─── closePeriod ────────────────────────────────────────────────────────────

  async closePeriod(periodId: number, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
        include: { object: { select: { organizationId: true } } },
      });

      this.assertPeriodEditable(period); // ADR-007: closed/force_closed → 403

      if (period.status !== 'verification') {
        throw new ConflictException('PERIOD_WRONG_STATUS');
      }

      // Check for open discrepancies across all period facts
      const openDiscrepancyCount = await tx.discrepancy.count({
        where: {
          periodFact: { periodId },
          status: 'open',
        },
      });

      if (openDiscrepancyCount > 0) {
        throw new ConflictException('OPEN_DISCREPANCIES_EXIST');
      }

      const updated = await tx.period.update({
        where: { id: periodId },
        data: { status: 'closed', closedAt: new Date(), closedBy: actorId },
      });

      // Create ReadinessSnapshot — placeholder until Analytics Engine (M-05c) is implemented
      // TODO M-05c: заменить 0 на реальный calcReadiness() из AnalyticsService
      // TODO M-05c: добавить INSERT work_pace в эту же транзакцию (ADR-011)
      // TODO M-05b: после транзакции enqueue BullMQ job для REFRESH MATERIALIZED VIEW CONCURRENTLY
      await tx.readinessSnapshot.create({
        data: {
          periodId,
          objectId: period.objectId,
          objectReadinessPct: 0,
        },
      });

      await this.auditLog.log({
        tableName: 'periods',
        recordId: BigInt(periodId),
        action: 'period_closed',
        performedBy: actorId,
        organizationId: period.object.organizationId,
      });

      return updated;
    });
  }

  // ─── findByObject ────────────────────────────────────────────────────────────

  async findByObject(objectId: number) {
    return this.prisma.period.findMany({
      where: { objectId },
      orderBy: { periodNumber: 'desc' },
    });
  }
}
