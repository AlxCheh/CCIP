import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MvStalenessService } from '../analytics/mv-staleness.service';

type RawCurrentStatus = {
  objReadinessPct: string | null;
  weightedForecastDate: Date | null;
  criticalPathForecastDate: Date | null;
  gapFlag: boolean | null;
};

function toDateString(v: Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

@Injectable()
export class ObjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staleness: MvStalenessService,
  ) {}

  async getDetail(userId: number, objectId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });

    const obj = await this.prisma.constructionObject.findUnique({
      where: { id: objectId },
      select: {
        id: true,
        name: true,
        objectClass: true,
        address: true,
        permitNumber: true,
        permitDate: true,
        connectionDate: true,
        status: true,
        organizationId: true,
      },
    });

    if (!obj || obj.organizationId !== user.organizationId) {
      throw new NotFoundException('OBJECT_NOT_FOUND');
    }

    const mvRows = await this.prisma.$queryRawUnsafe<RawCurrentStatus[]>(
      `SELECT
        obj_readiness_pct::text  AS "objReadinessPct",
        weighted_forecast_date   AS "weightedForecastDate",
        critical_path_forecast_date AS "criticalPathForecastDate",
        gap_flag                 AS "gapFlag"
      FROM mv_object_current_status
      WHERE object_id = $1
      LIMIT 1`,
      objectId,
    );

    const [participants, activeBoq, currentPeriod, history, meta] =
      await Promise.all([
        this.prisma.objectParticipant.findMany({
          where: { objectId, isCurrent: true },
          select: {
            participantRole: true,
            orgName: true,
            contactPerson: true,
            contactEmail: true,
            validFrom: true,
          },
          orderBy: { validFrom: 'asc' },
        }),

        this.prisma.boqVersion
          .findFirst({
            where: { objectId, isActive: true },
            select: {
              id: true,
              versionNumber: true,
              _count: { select: { boqItems: true } },
            },
          })
          .then((v) =>
            v
              ? {
                  id: v.id,
                  versionNumber: v.versionNumber,
                  itemsCount: v._count.boqItems,
                }
              : null,
          ),

        this.prisma.period.findFirst({
          where: { objectId },
          orderBy: { periodNumber: 'desc' },
          select: {
            id: true,
            periodNumber: true,
            status: true,
            openedAt: true,
            closedAt: true,
          },
        }),

        this.prisma.readinessSnapshot.findMany({
          where: { objectId },
          orderBy: { period: { periodNumber: 'desc' } },
          select: {
            periodId: true,
            objectReadinessPct: true,
            weightedForecastDate: true,
            criticalPathForecastDate: true,
            gapFlag: true,
            period: {
              select: {
                periodNumber: true,
                closedAt: true,
                boqVersion: { select: { versionNumber: true } },
              },
            },
          },
        }),

        this.staleness.getStalenessMeta(),
      ]);

    const mvRow = mvRows[0] ?? null;
    const hasAnalytics = mvRow !== null;

    return {
      object: {
        id: obj.id,
        name: obj.name,
        objectClass: obj.objectClass,
        address: obj.address,
        permitNumber: obj.permitNumber,
        permitDate: toDateString(obj.permitDate),
        connectionDate: toDateString(obj.connectionDate),
        status: obj.status,
      },
      participants: participants.map((p) => ({
        role: p.participantRole,
        orgName: p.orgName,
        contactPerson: p.contactPerson,
        contactEmail: p.contactEmail,
        validFrom: p.validFrom.toISOString().slice(0, 10),
      })),
      activeBoq,
      currentPeriod: currentPeriod
        ? {
            id: currentPeriod.id,
            periodNumber: currentPeriod.periodNumber,
            status: currentPeriod.status,
            openedAt: currentPeriod.openedAt.toISOString(),
            closedAt: currentPeriod.closedAt?.toISOString() ?? null,
          }
        : null,
      hasAnalytics,
      current: hasAnalytics
        ? {
            objReadinessPct:
              mvRow.objReadinessPct !== null
                ? parseFloat(mvRow.objReadinessPct)
                : null,
            weightedForecastDate: toDateString(mvRow.weightedForecastDate),
            criticalPathForecastDate: toDateString(
              mvRow.criticalPathForecastDate,
            ),
            gapFlag: mvRow.gapFlag ?? false,
          }
        : null,
      history: history.map((s) => ({
        periodId: s.periodId,
        periodNumber: s.period.periodNumber,
        closedAt: s.period.closedAt?.toISOString() ?? null,
        objectReadinessPct: parseFloat(s.objectReadinessPct.toString()),
        weightedForecastDate: toDateString(s.weightedForecastDate),
        criticalPathForecastDate: toDateString(s.criticalPathForecastDate),
        gapFlag: s.gapFlag,
        boqVersionNumber: s.period.boqVersion.versionNumber,
      })),
      meta,
    };
  }
}
