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
    _userId: number,
    _requestId: number,
    _dto: ApproveBaselineUpdateDto,
  ): Promise<never> {
    throw new Error('not implemented yet — see Task 3');
  }
}
