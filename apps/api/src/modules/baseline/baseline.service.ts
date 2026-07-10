import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CreateBaselineUpdateRequestDto } from './dto/create-baseline-update-request.dto';
import { ApproveBaselineUpdateDto } from './dto/approve-baseline-update.dto';

@Injectable()
export class BaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

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
    return obj;
  }

  async createRequest(
    userId: number,
    objectId: number,
    dto: CreateBaselineUpdateRequestDto,
  ) {
    await this.checkObjectAccess(userId, objectId);

    const boqItem = await this.prisma.boqItem.findFirst({
      where: {
        id: dto.boqItemId,
        boqVersion: { objectId, isActive: true },
      },
      select: { id: true, planVolume: true },
    });
    if (!boqItem) {
      throw new NotFoundException('BOQ_ITEM_NOT_IN_ACTIVE_VERSION');
    }

    const request = await this.prisma.baselineUpdateRequest.create({
      data: {
        objectId,
        boqItemId: dto.boqItemId,
        requestedBy: userId,
        oldPlanVolume: boqItem.planVolume,
        newPlanVolume: dto.newPlanVolume,
        reason: dto.reason,
        supportingDocument: dto.supportingDocument,
        status: 'pending',
      },
    });

    return {
      id: request.id,
      objectId: request.objectId,
      boqItemId: request.boqItemId,
      oldPlanVolume: Number(request.oldPlanVolume),
      newPlanVolume: Number(request.newPlanVolume),
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
    };
  }

  async approveRequest(
    userId: number,
    requestId: number,
    dto: ApproveBaselineUpdateDto,
  ) {
    const request = await this.prisma.baselineUpdateRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('BASELINE_REQUEST_NOT_FOUND');
    }
    if (request.status !== 'pending') {
      throw new ConflictException('BASELINE_REQUEST_ALREADY_REVIEWED');
    }

    const obj = await this.checkObjectAccess(userId, request.objectId);

    const { newVersion, updatedRequest } = await this.prisma.$transaction(
      async (tx) => {
        const openPeriod = await tx.period.findFirst({
          where: { objectId: request.objectId, status: 'open' },
        });
        if (openPeriod) {
          throw new ConflictException('PERIOD_OPEN_CANNOT_UPDATE_BASELINE');
        }

        const activeVersion = await tx.boqVersion.findFirstOrThrow({
          where: { objectId: request.objectId, isActive: true },
          include: { boqItems: true },
        });

        const nextVersionNumber = (
          parseFloat(activeVersion.versionNumber) + 0.1
        ).toFixed(1);

        const newVersion = await tx.boqVersion.create({
          data: {
            objectId: request.objectId,
            versionNumber: nextVersionNumber,
            changeType: 'baseline_update',
            changeReason: request.reason,
            changeDocument: request.supportingDocument,
            createdBy: userId,
            isActive: true,
          },
        });

        await tx.boqItem.createMany({
          data: activeVersion.boqItems.map((item) => ({
            boqVersionId: newVersion.id,
            workLineageId: item.workLineageId,
            workCode: item.workCode,
            name: item.name,
            unit: item.unit,
            planVolume:
              item.id === request.boqItemId
                ? request.newPlanVolume
                : item.planVolume,
            contractValue: item.contractValue,
            isCritical: item.isCritical,
            status: item.status,
            predecessorItemId: item.id,
          })),
        });

        const agg = await tx.boqItem.aggregate({
          where: { boqVersionId: newVersion.id, status: 'active' },
          _sum: { weightCoef: true },
        });
        const sum = Number(agg._sum.weightCoef ?? 0);
        if (Math.abs(sum - 1.0) > 0.001) {
          throw new UnprocessableEntityException(
            `BOQ_WEIGHT_INVALID: sum of weight_coef is ${sum.toFixed(6)}, expected 1.0.`,
          );
        }

        await tx.boqVersion.update({
          where: { id: activeVersion.id },
          data: { isActive: false },
        });

        const updatedRequest = await tx.baselineUpdateRequest.update({
          where: { id: request.id },
          data: {
            status: 'approved',
            reviewedBy: userId,
            reviewedAt: new Date(),
            reviewNotes: dto.reviewNotes,
            appliesFromPeriodId: dto.appliesFromPeriodId,
          },
        });

        return { newVersion, updatedRequest };
      },
    );

    await this.auditLog.log({
      tableName: 'boq_versions',
      recordId: BigInt(newVersion.id),
      action: 'baseline_updated',
      newData: {
        objectId: request.objectId,
        boqItemId: request.boqItemId,
        oldPlanVolume: Number(request.oldPlanVolume),
        newPlanVolume: Number(request.newPlanVolume),
        versionNumber: newVersion.versionNumber,
      },
      performedBy: userId,
      organizationId: obj.organizationId,
    });

    return {
      requestId: updatedRequest.id,
      status: updatedRequest.status,
      newBoqVersion: {
        id: newVersion.id,
        versionNumber: newVersion.versionNumber,
      },
    };
  }
}
