import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateConfigDto } from './dto/update-config.dto';

const KNOWN_KEYS = new Set([
  'N_flag_threshold',
  'M_flag_window',
  'weight_threshold',
  'forecast_gap_alert',
  'tolerance_threshold',
  'overrun_warning_limit',
  'avg_pace_periods',
  'decay_factor',
  'spike_threshold',
  'zero_report_alert_days',
  'baseline_correction_threshold',
]);

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrgId(userId: number): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });
    return user.organizationId;
  }

  async list(userId: number) {
    const organizationId = await this.getOrgId(userId);

    const configs = await this.prisma.systemConfig.findMany({
      where: { organizationId },
      select: {
        key: true,
        valueType: true,
        valueNumeric: true,
        description: true,
        updatedAt: true,
      },
      orderBy: { key: 'asc' },
    });

    return configs.map((c) => ({
      key: c.key,
      valueType: c.valueType,
      value: c.valueNumeric !== null ? Number(c.valueNumeric) : null,
      description: c.description,
      updatedAt: c.updatedAt?.toISOString() ?? null,
    }));
  }

  async update(userId: number, key: string, dto: UpdateConfigDto) {
    if (!KNOWN_KEYS.has(key)) {
      throw new BadRequestException(`UNKNOWN_CONFIG_KEY: ${key}`);
    }

    const organizationId = await this.getOrgId(userId);
    const now = new Date();

    const config = await this.prisma.systemConfig.upsert({
      where: { organizationId_key: { organizationId, key } },
      update: {
        valueNumeric: dto.value,
        updatedAt: now,
        updatedBy: userId,
      },
      create: {
        key,
        organizationId,
        valueType: 'numeric',
        valueNumeric: dto.value,
        updatedAt: now,
        updatedBy: userId,
      },
      select: {
        key: true,
        valueType: true,
        valueNumeric: true,
        description: true,
        updatedAt: true,
      },
    });

    return {
      key: config.key,
      valueType: config.valueType,
      value: config.valueNumeric !== null ? Number(config.valueNumeric) : null,
      description: config.description,
      updatedAt: config.updatedAt?.toISOString() ?? null,
    };
  }
}
