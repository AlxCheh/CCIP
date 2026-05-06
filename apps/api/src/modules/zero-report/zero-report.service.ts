import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateZeroReportDto } from './dto/create-zero-report.dto';
import { UpsertZeroReportItemDto } from './dto/upsert-zero-report-item.dto';

// Valid status transitions for Zero Report state machine
const SUBMIT_ALLOWED_STATUSES = ['draft'];
const APPROVE_ALLOWED_STATUSES = ['submitted'];
const ITEM_EDIT_ALLOWED_STATUSES = ['draft'];

@Injectable()
export class ZeroReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async checkObjectAccess(userId: number, objectId: number) {
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

    // Invariant: only one active (non-rejected) zero-report per object
    const existing = await this.prisma.zeroReport.findFirst({
      where: {
        objectId,
        status: { not: 'rejected' },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('ZERO_REPORT_ALREADY_EXISTS');
    }

    const report = await this.prisma.zeroReport.create({
      data: {
        objectId,
        boqVersionId: dto.boqVersionId,
        status: 'draft',
        notes: dto.notes ?? null,
      },
    });

    return this.formatReport(report);
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

  async upsertItem(userId: number, objectId: number, dto: UpsertZeroReportItemDto) {
    await this.checkObjectAccess(userId, objectId);

    const report = await this.prisma.zeroReport.findFirst({
      where: { objectId },
      select: { id: true, status: true },
      orderBy: { id: 'desc' },
    });

    if (!report) {
      throw new NotFoundException('ZERO_REPORT_NOT_FOUND');
    }
    if (!ITEM_EDIT_ALLOWED_STATUSES.includes(report.status)) {
      throw new UnprocessableEntityException('ZERO_REPORT_INVALID_STATUS');
    }

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

    const updated = await this.prisma.zeroReport.update({
      where: { id: report.id },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        submittedBy: userId,
      },
    });

    return this.formatReport(updated);
  }

  async approve(userId: number, objectId: number) {
    await this.checkObjectAccess(userId, objectId);

    const report = await this.prisma.zeroReport.findFirst({
      where: { objectId },
      select: { id: true, status: true },
      orderBy: { id: 'desc' },
    });

    if (!report) {
      throw new NotFoundException('ZERO_REPORT_NOT_FOUND');
    }
    if (!APPROVE_ALLOWED_STATUSES.includes(report.status)) {
      throw new UnprocessableEntityException('ZERO_REPORT_INVALID_STATUS');
    }

    // Invariant: only one approved zero-report per object
    const existingApproved = await this.prisma.zeroReport.findFirst({
      where: { objectId, status: 'approved' },
      select: { id: true },
    });
    if (existingApproved) {
      throw new ConflictException('ZERO_REPORT_ALREADY_APPROVED');
    }

    const updated = await this.prisma.zeroReport.update({
      where: { id: report.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
      },
    });

    return this.formatReport(updated);
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
