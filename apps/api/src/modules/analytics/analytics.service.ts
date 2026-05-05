import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MvStalenessService } from './mv-staleness.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

type RawDashboardRow = {
  objectId: number;
  name: string;
  objectClass: string | null;
  status: string;
  hasAnalytics: boolean;
  objReadinessPct: string | null;
  weightedForecastDate: Date | null;
  criticalPathForecastDate: Date | null;
  gapFlag: boolean;
};

type RawCount = { count: bigint };

function buildOrderBy(sort: DashboardQueryDto['sort']): string {
  switch (sort) {
    case 'readinessAsc':
      return 'COALESCE(m.obj_readiness_pct, -1) ASC, o.name ASC';
    case 'readinessDesc':
      return 'COALESCE(m.obj_readiness_pct, -1) DESC, o.name ASC';
    case 'forecastAsc':
      return 'm.weighted_forecast_date ASC NULLS LAST, o.name ASC';
    case 'forecastDesc':
      return 'm.weighted_forecast_date DESC NULLS LAST, o.name ASC';
    case 'nameAsc':
      return 'o.name ASC';
    case 'gapFirst':
    default:
      return 'COALESCE(m.gap_flag, false) DESC, COALESCE(m.obj_readiness_pct, -1) ASC, o.name ASC';
  }
}

function toDateString(v: Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staleness: MvStalenessService,
  ) {}

  async getDashboard(userId: number, dto: DashboardQueryDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });

    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };

    const conditions: string[] = [
      `o.organization_id = ${p(user.organizationId)}::uuid`,
    ];

    if (dto.status) conditions.push(`o.status = ${p(dto.status)}`);
    if (dto.objectClass)
      conditions.push(`o.object_class = ${p(dto.objectClass)}`);
    if (dto.search)
      conditions.push(`o.name ILIKE ${p('%' + dto.search + '%')}`);
    if (dto.gapOnly) conditions.push(`COALESCE(m.gap_flag, false) = true`);

    const where = conditions.join(' AND ');
    const orderBy = buildOrderBy(dto.sort);
    const limit = dto.pageSize ?? 50;
    const offset = ((dto.page ?? 1) - 1) * limit;

    const countParams = [...params];
    const countSql = `
      SELECT COUNT(*)::bigint AS count
      FROM objects o
      LEFT JOIN mv_object_current_status m ON m.object_id = o.id
      WHERE ${where}
    `;

    const listParams = [...params, limit, offset];
    const limitN = params.length + 1;
    const offsetN = params.length + 2;
    const listSql = `
      SELECT
        o.id                                    AS "objectId",
        o.name,
        o.object_class                          AS "objectClass",
        o.status,
        (m.object_id IS NOT NULL)               AS "hasAnalytics",
        m.obj_readiness_pct::text               AS "objReadinessPct",
        m.weighted_forecast_date                AS "weightedForecastDate",
        m.critical_path_forecast_date           AS "criticalPathForecastDate",
        COALESCE(m.gap_flag, false)             AS "gapFlag"
      FROM objects o
      LEFT JOIN mv_object_current_status m ON m.object_id = o.id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT $${limitN} OFFSET $${offsetN}
    `;

    const [rows, countResult, meta] = await Promise.all([
      this.prisma.$queryRawUnsafe<RawDashboardRow[]>(listSql, ...listParams),
      this.prisma.$queryRawUnsafe<RawCount[]>(countSql, ...countParams),
      this.staleness.getStalenessMeta(),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items: rows.map((r) => ({
        objectId: Number(r.objectId),
        name: r.name,
        objectClass: r.objectClass,
        status: r.status,
        hasAnalytics: r.hasAnalytics,
        objReadinessPct:
          r.objReadinessPct !== null ? parseFloat(r.objReadinessPct) : null,
        weightedForecastDate: toDateString(r.weightedForecastDate),
        criticalPathForecastDate: toDateString(r.criticalPathForecastDate),
        gapFlag: r.gapFlag,
      })),
      pagination: { page: dto.page ?? 1, pageSize: limit, total },
      meta,
    };
  }
}
