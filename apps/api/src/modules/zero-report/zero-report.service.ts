import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@ccip/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CreateZeroReportDto } from './dto/create-zero-report.dto';
import { UpsertZeroReportItemDto } from './dto/upsert-zero-report-item.dto';

// Valid status transitions for Zero Report state machine
const SUBMIT_ALLOWED_STATUSES = ['draft'];
const APPROVE_ALLOWED_STATUSES = ['pending_approval'];
const ITEM_EDIT_ALLOWED_STATUSES = ['draft'];

// @algorithm: docs/algorithm_v1_3.md Блок B, B3 — порог веса для перекрёстной верификации
const DEFAULT_WEIGHT_THRESHOLD = 0.1;

@Injectable()
export class ZeroReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async checkObjectAccess(
    userId: number,
    objectId: number,
  ): Promise<string> {
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
    return user.organizationId;
  }

  private async getWeightThreshold(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<number> {
    const row = await tx.systemConfig.findUnique({
      where: { organizationId_key: { organizationId, key: 'weight_threshold' } },
      select: { valueNumeric: true },
    });
    return row?.valueNumeric != null ? Number(row.valueNumeric) : DEFAULT_WEIGHT_THRESHOLD;
  }

  async create(userId: number, objectId: number, dto: CreateZeroReportDto) {
    await this.checkObjectAccess(userId, objectId);

    // Validate boqVersion exists and belongs to this object
    const boqVersion = await this.prisma.boqVersion.findUnique({
      where: { id: dto.boqVersionId },
      select: { id: true, objectId: true, isActive: true },
    });
    if (!boqVersion) {
      throw new NotFoundException('BOQ_VERSION_NOT_FOUND');
    }
    if (boqVersion.objectId !== objectId) {
      throw new UnprocessableEntityException('BOQ_VERSION_OBJECT_MISMATCH');
    }

    return this.prisma.$transaction(async (tx) => {
      // Invariant: only one active (non-rejected) zero-report per object
      const existing = await tx.zeroReport.findFirst({
        where: {
          objectId,
          status: { not: 'rejected' },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('ZERO_REPORT_ALREADY_EXISTS');
      }

      const report = await tx.zeroReport.create({
        data: {
          objectId,
          boqVersionId: dto.boqVersionId,
          status: 'draft',
          notes: dto.notes ?? null,
        },
      });

      return this.formatReport(report);
    });
  }

  async getByObject(userId: number, objectId: number) {
    await this.checkObjectAccess(userId, objectId);

    const report = await this.prisma.zeroReport.findFirst({
      where: { objectId },
      include: {
        items: {
          orderBy: { boqItemId: 'asc' },
        },
      },
      orderBy: { id: 'desc' },
    });

    if (!report) {
      throw new NotFoundException('ZERO_REPORT_NOT_FOUND');
    }

    return this.formatReportWithItems(report);
  }

  async upsertItem(
    userId: number,
    objectId: number,
    dto: UpsertZeroReportItemDto,
  ) {
    const organizationId = await this.checkObjectAccess(userId, objectId);

    const report = await this.prisma.zeroReport.findFirst({
      where: { objectId },
      select: { id: true, status: true, boqVersionId: true },
      orderBy: { id: 'desc' },
    });

    if (!report) {
      throw new NotFoundException('ZERO_REPORT_NOT_FOUND');
    }
    if (!ITEM_EDIT_ALLOWED_STATUSES.includes(report.status)) {
      throw new UnprocessableEntityException('ZERO_REPORT_INVALID_STATUS');
    }

    // Critical #2: validate boqItemId belongs to the same boqVersion as this report
    const boqItem = await this.prisma.boqItem.findUnique({
      where: { id: dto.boqItemId },
      select: { id: true, boqVersionId: true },
    });
    if (!boqItem) {
      throw new NotFoundException('BOQ_ITEM_NOT_FOUND');
    }
    if (boqItem.boqVersionId !== report.boqVersionId) {
      throw new UnprocessableEntityException('BOQ_ITEM_VERSION_MISMATCH');
    }

    // @algorithm: docs/algorithm_v1_3.md Блок B, CorrectZeroReport — LOG ZeroReportCorrection
    const existingItem = await this.prisma.zeroReportItem.findUnique({
      where: {
        zeroReportId_boqItemId: { zeroReportId: report.id, boqItemId: dto.boqItemId },
      },
      select: { id: true, factVolume: true },
    });

    // Determine crossVerified: all three doc values must be present
    const crossVerified =
      dto.doc1Value !== undefined &&
      dto.doc1Value !== null &&
      dto.doc2Value !== undefined &&
      dto.doc2Value !== null &&
      dto.doc3Value !== undefined &&
      dto.doc3Value !== null;

    const item = await this.prisma.zeroReportItem.upsert({
      where: {
        zeroReportId_boqItemId: {
          zeroReportId: report.id,
          boqItemId: dto.boqItemId,
        },
      },
      create: {
        zeroReportId: report.id,
        boqItemId: dto.boqItemId,
        factVolume: dto.factVolume,
        source: dto.source,
        doc1Value: dto.doc1Value ?? null,
        doc2Value: dto.doc2Value ?? null,
        doc3Value: dto.doc3Value ?? null,
        crossVerified,
        notes: dto.notes ?? null,
      },
      update: {
        factVolume: dto.factVolume,
        source: dto.source,
        doc1Value: dto.doc1Value ?? null,
        doc2Value: dto.doc2Value ?? null,
        doc3Value: dto.doc3Value ?? null,
        crossVerified,
        notes: dto.notes ?? null,
      },
    });

    if (existingItem) {
      await this.auditLog.log({
        tableName: 'zero_report_items',
        recordId: BigInt(item.id),
        action: 'zero_report_item_corrected',
        oldData: { factVolume: Number(existingItem.factVolume) },
        newData: { factVolume: Number(item.factVolume) },
        performedBy: userId,
        organizationId,
      });
    }

    return this.formatItem(item);
  }

  async submit(userId: number, objectId: number) {
    await this.checkObjectAccess(userId, objectId);

    const report = await this.prisma.zeroReport.findFirst({
      where: { objectId },
      select: { id: true, status: true },
      orderBy: { id: 'desc' },
    });

    if (!report) {
      throw new NotFoundException('ZERO_REPORT_NOT_FOUND');
    }
    if (!SUBMIT_ALLOWED_STATUSES.includes(report.status)) {
      throw new UnprocessableEntityException('ZERO_REPORT_INVALID_STATUS');
    }

    // Important #4: require at least one item before submit
    const itemCount = await this.prisma.zeroReportItem.count({
      where: { zeroReportId: report.id },
    });
    if (itemCount === 0) {
      throw new UnprocessableEntityException('ZERO_REPORT_NO_ITEMS');
    }

    const updated = await this.prisma.zeroReport.update({
      where: { id: report.id },
      data: {
        status: 'pending_approval',
        submittedAt: new Date(),
        submittedBy: userId,
      },
    });

    return this.formatReport(updated);
  }

  async approve(userId: number, objectId: number) {
    const organizationId = await this.checkObjectAccess(userId, objectId);

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.zeroReport.findFirst({
        where: { objectId },
        select: { id: true, status: true, boqVersionId: true },
        orderBy: { id: 'desc' },
      });

      if (!report) {
        throw new NotFoundException('ZERO_REPORT_NOT_FOUND');
      }
      if (!APPROVE_ALLOWED_STATUSES.includes(report.status)) {
        throw new UnprocessableEntityException('ZERO_REPORT_INVALID_STATUS');
      }

      // Invariant: only one approved zero-report per object
      const existingApproved = await tx.zeroReport.findFirst({
        where: { objectId, status: 'approved' },
        select: { id: true },
      });
      if (existingApproved) {
        throw new ConflictException('ZERO_REPORT_ALREADY_APPROVED');
      }

      // @algorithm: docs/algorithm_v1_3.md Блок B, B3 — перекрёстная верификация
      // для позиций с weight_coef >= weight_threshold ИЛИ isCritical: все три
      // документа обязательны (crossVerified) до утверждения директором.
      const boqItems = await tx.boqItem.findMany({
        where: { boqVersionId: report.boqVersionId },
        select: { id: true, weightCoef: true, isCritical: true },
      });
      const items = await tx.zeroReportItem.findMany({
        where: { zeroReportId: report.id },
        select: { boqItemId: true, crossVerified: true },
      });
      const itemByBoqItemId = new Map(items.map((i) => [i.boqItemId, i]));
      const weightThreshold = await this.getWeightThreshold(tx, organizationId);

      for (const boqItem of boqItems) {
        const item = itemByBoqItemId.get(boqItem.id);
        if (!item) {
          throw new UnprocessableEntityException('ZERO_REPORT_NOT_ALL_ITEMS');
        }
        const isHeavy =
          boqItem.isCritical ||
          (boqItem.weightCoef != null && Number(boqItem.weightCoef) >= weightThreshold);
        if (isHeavy && !item.crossVerified) {
          throw new UnprocessableEntityException('ZERO_REPORT_CROSS_VERIFICATION_REQUIRED');
        }
      }

      const updated = await tx.zeroReport.update({
        where: { id: report.id },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: userId,
        },
      });

      return this.formatReport(updated);
    });
  }

  private formatReport(report: {
    id: number;
    objectId: number;
    boqVersionId: number;
    status: string;
    submittedAt: Date | null;
    submittedBy: number | null;
    approvedAt: Date | null;
    approvedBy: number | null;
    alertSentAt?: Date | null;
    notes: string | null;
  }) {
    return {
      id: report.id,
      objectId: report.objectId,
      boqVersionId: report.boqVersionId,
      status: report.status,
      submittedAt: report.submittedAt?.toISOString() ?? null,
      submittedBy: report.submittedBy,
      approvedAt: report.approvedAt?.toISOString() ?? null,
      approvedBy: report.approvedBy,
      alertSentAt: report.alertSentAt?.toISOString() ?? null,
      notes: report.notes,
    };
  }

  private formatReportWithItems(report: {
    id: number;
    objectId: number;
    boqVersionId: number;
    status: string;
    submittedAt: Date | null;
    submittedBy: number | null;
    approvedAt: Date | null;
    approvedBy: number | null;
    alertSentAt?: Date | null;
    notes: string | null;
    items: Array<{
      id: number;
      zeroReportId: number;
      boqItemId: number;
      factVolume: unknown;
      source: string;
      doc1Value: unknown;
      doc2Value: unknown;
      doc3Value: unknown;
      crossVerified: boolean;
      notes: string | null;
    }>;
  }) {
    return {
      ...this.formatReport(report),
      items: report.items.map((i) => this.formatItem(i)),
    };
  }

  private formatItem(item: {
    id: number;
    zeroReportId: number;
    boqItemId: number;
    factVolume: unknown;
    source: string;
    doc1Value: unknown;
    doc2Value: unknown;
    doc3Value: unknown;
    crossVerified: boolean;
    notes: string | null;
  }) {
    return {
      id: item.id,
      zeroReportId: item.zeroReportId,
      boqItemId: item.boqItemId,
      factVolume: Number(item.factVolume),
      source: item.source,
      doc1Value: item.doc1Value !== null ? Number(item.doc1Value) : null,
      doc2Value: item.doc2Value !== null ? Number(item.doc2Value) : null,
      doc3Value: item.doc3Value !== null ? Number(item.doc3Value) : null,
      crossVerified: item.crossVerified,
      notes: item.notes,
    };
  }
}
