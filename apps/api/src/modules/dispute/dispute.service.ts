import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DisputeSlaService } from '../dispute-sla/dispute-sla.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Injectable()
export class DisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disputeSla: DisputeSlaService,
  ) {}

  async createDispute(
    periodId: number,
    boqItemId: number,
    actorId: number,
    dto: CreateDisputeDto,
  ) {
    if (!dto.disputeReason?.trim()) {
      throw new BadRequestException('DISPUTE_REASON_REQUIRED');
    }

    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: periodId },
    });

    if (period.status !== 'verification') {
      throw new ConflictException('PERIOD_WRONG_STATUS');
    }

    const fact = await this.prisma.periodFact.findFirst({
      where: { periodId, boqItemId },
    });

    if (!fact) throw new NotFoundException('PERIOD_FACT_NOT_FOUND');

    const gpVol = fact.gpVolume != null ? Number(fact.gpVolume) : null;
    const scVol = fact.scVolume != null ? Number(fact.scVolume) : null;
    if (gpVol === null || scVol === null || Math.abs(gpVol - scVol) === 0) {
      throw new BadRequestException('NO_DELTA_TO_DISPUTE');
    }

    const photo = await this.prisma.photo.findFirst({ where: { periodId, boqItemId } });
    if (!photo) throw new BadRequestException('TYPE2_PHOTO_REQUIRED');

    await this.prisma.periodFact.update({
      where: { id: fact.id },
      data: { discrepancyType: 2, discrepancyStatus: 'open' },
    });

    const discrepancy = await this.prisma.discrepancy.create({
      data: {
        periodFactId: fact.id,
        type: 2,
        status: 'open',
        scPosition: dto.disputeReason.trim(),
      },
    });

    await this.disputeSla.scheduleEvents({
      discrepancyId: discrepancy.id,
      periodId,
      boqItemId,
      createdAt: discrepancy.createdAt,
    });

    return discrepancy;
  }

  async listDiscrepancies(periodId: number) {
    return this.prisma.discrepancy.findMany({
      where: { periodFact: { periodId } },
      include: { periodFact: { select: { boqItemId: true, scVolume: true, gpVolume: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // algorithm_v1_3.md §Block D, Scenario B: "IF gc_response RECEIVED"
  async submitGpResponse(discrepancyId: number, gpPosition: string) {
    if (!gpPosition?.trim()) {
      throw new BadRequestException('GP_POSITION_REQUIRED');
    }

    const discrepancy = await this.prisma.discrepancy.findUniqueOrThrow({
      where: { id: discrepancyId },
      include: { periodFact: true },
    });
    if (discrepancy.status !== 'open') {
      throw new ConflictException('DISCREPANCY_WRONG_STATUS');
    }

    const updated = await this.prisma.discrepancy.update({
      where: { id: discrepancyId },
      data: { gpPosition: gpPosition.trim(), gcResponseAt: new Date() },
    });

    // GP responded — Scenario A's "GP silence" timers (day3 notify / day5
    // force-close) no longer apply; Scenario B takes over only if SC rejects.
    await this.disputeSla.cancelEvents(
      discrepancy.periodFact.periodId,
      discrepancy.periodFact.boqItemId,
    );

    return updated;
  }

  // SC explicitly rejects the GP's documentation → Scenario B SLA clock starts from gcResponseAt
  async rejectGpResponse(discrepancyId: number, actorId: number) {
    const discrepancy = await this.prisma.discrepancy.findUniqueOrThrow({
      where: { id: discrepancyId },
      include: { periodFact: true },
    });
    if (discrepancy.status !== 'open') {
      throw new ConflictException('DISCREPANCY_WRONG_STATUS');
    }
    if (!discrepancy.gcResponseAt) {
      throw new ConflictException('GP_RESPONSE_NOT_SUBMITTED');
    }

    await this.disputeSla.scheduleEvents({
      discrepancyId,
      periodId: discrepancy.periodFact.periodId,
      boqItemId: discrepancy.periodFact.boqItemId,
      createdAt: discrepancy.gcResponseAt,
      scenario: 'B',
    });
  }
}
