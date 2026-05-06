import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBoqDto } from './dto/create-boq.dto';

@Injectable()
export class BoqService {
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

  async createInitial(userId: number, objectId: number, dto: CreateBoqDto) {
    await this.checkObjectAccess(userId, objectId);

    const existing = await this.prisma.boqVersion.findFirst({
      where: { objectId, isActive: true },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('BOQ_ACTIVE_VERSION_EXISTS');
    }

    const version = await this.prisma.$transaction(async (tx) => {
      const ver = await tx.boqVersion.create({
        data: {
          objectId,
          versionNumber: '1.0',
          changeType: 'initial',
          changeReason: dto.changeReason,
          isActive: true,
          createdBy: userId,
        },
      });

      await tx.boqItem.createMany({
        data: dto.items.map((item) => ({
          boqVersionId: ver.id,
          workCode: item.workCode,
          name: item.name,
          unit: item.unit,
          planVolume: item.planVolume,
          contractValue: item.contractValue,
          isCritical: item.isCritical ?? false,
          status: 'active',
        })),
      });

      // Verify trigger set weight_coef correctly: SUM must equal 1.0
      const agg = await tx.boqItem.aggregate({
        where: { boqVersionId: ver.id, status: 'active' },
        _sum: { weightCoef: true },
      });
      const sum = Number(agg._sum.weightCoef ?? 0);
      if (Math.abs(sum - 1.0) > 0.001) {
        throw new UnprocessableEntityException(
          `BOQ_WEIGHT_INVALID: sum of weight_coef is ${sum.toFixed(6)}, expected 1.0. Ensure all contract_value > 0.`,
        );
      }

      return ver;
    });

    const items = await this.prisma.boqItem.findMany({
      where: { boqVersionId: version.id },
      select: {
        id: true,
        workCode: true,
        name: true,
        unit: true,
        planVolume: true,
        contractValue: true,
        weightCoef: true,
        isCritical: true,
        status: true,
      },
      orderBy: { id: 'asc' },
    });

    return {
      id: version.id,
      versionNumber: version.versionNumber,
      changeType: version.changeType,
      isActive: version.isActive,
      createdAt: version.createdAt.toISOString(),
      itemsCount: items.length,
      items: items.map((i) => ({
        ...i,
        planVolume: Number(i.planVolume),
        contractValue: Number(i.contractValue),
        weightCoef: i.weightCoef !== null ? Number(i.weightCoef) : null,
      })),
    };
  }

  async getActive(userId: number, objectId: number) {
    await this.checkObjectAccess(userId, objectId);

    const version = await this.prisma.boqVersion.findFirst({
      where: { objectId, isActive: true },
      select: {
        id: true,
        versionNumber: true,
        changeType: true,
        changeReason: true,
        isActive: true,
        createdAt: true,
        boqItems: {
          select: {
            id: true,
            workCode: true,
            name: true,
            unit: true,
            planVolume: true,
            contractValue: true,
            weightCoef: true,
            isCritical: true,
            status: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('BOQ_ACTIVE_VERSION_NOT_FOUND');
    }

    return {
      id: version.id,
      versionNumber: version.versionNumber,
      changeType: version.changeType,
      changeReason: version.changeReason,
      isActive: version.isActive,
      createdAt: version.createdAt.toISOString(),
      itemsCount: version.boqItems.length,
      items: version.boqItems.map((i) => ({
        ...i,
        planVolume: Number(i.planVolume),
        contractValue: Number(i.contractValue),
        weightCoef: i.weightCoef !== null ? Number(i.weightCoef) : null,
      })),
    };
  }

  async listVersions(userId: number, objectId: number) {
    await this.checkObjectAccess(userId, objectId);

    const versions = await this.prisma.boqVersion.findMany({
      where: { objectId },
      select: {
        id: true,
        versionNumber: true,
        changeType: true,
        changeReason: true,
        isActive: true,
        createdAt: true,
        approvedAt: true,
        _count: { select: { boqItems: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      changeType: v.changeType,
      changeReason: v.changeReason,
      isActive: v.isActive,
      createdAt: v.createdAt.toISOString(),
      approvedAt: v.approvedAt?.toISOString() ?? null,
      itemsCount: v._count.boqItems,
    }));
  }
}
