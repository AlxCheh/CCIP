import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PeriodService } from '../period/period.service';
import { StorageService } from '../documents/storage.service';
import { VersionConflictException } from '../period/version-conflict.exception';
import { SyncOperationsDto } from './dto/sync-operations.dto';
import { SyncResolveDto } from './dto/sync-resolve.dto';
import { SyncPhotoDto } from './dto/sync-photo.dto';

export type SyncStatus =
  | 'pending'
  | 'applied'
  | 'conflict'
  | 'rejected'
  | 'escalated'
  | 'skipped';

export interface SyncOperationResult {
  clientOpId: string | null;
  status: SyncStatus;
  syncQueueId?: number;
  reason?: string;
  conflictData?: unknown;
  duplicate?: boolean;
}

interface SyncFactPayload {
  periodId: number;
  boqItemId: number;
  scVolume: number;
  workAccessible?: boolean;
}

interface SyncFactOperation {
  clientOpId: string;
  operation: 'submit_fact';
  clientTimestamp: string;
  boqVersionNumber: string;
  lastKnownVersion: number;
  payload: SyncFactPayload;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly periodService: PeriodService,
    private readonly storage: StorageService,
  ) {}

  async processOperations(
    userId: number,
    dto: SyncOperationsDto,
  ): Promise<{ results: SyncOperationResult[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });

    const results: SyncOperationResult[] = [];
    let stopped = false;

    for (const raw of dto.operations) {
      const clientOpId =
        typeof raw?.clientOpId === 'string' ? raw.clientOpId : null;

      if (stopped) {
        // sync-engine §9: после конфликта остаток батча не применяется
        results.push({ clientOpId, status: 'skipped' });
        continue;
      }

      const invalidReason = this.validateOperation(raw);
      if (invalidReason) {
        // Инвалидный элемент не пишется в очередь: operation CHECK в БД
        results.push({ clientOpId, status: 'rejected', reason: invalidReason });
        continue;
      }
      const op = raw as unknown as SyncFactOperation;

      const existing = await this.prisma.syncQueue.findUnique({
        where: {
          deviceId_clientOpId: {
            deviceId: dto.deviceId,
            clientOpId: op.clientOpId,
          },
        },
      });
      if (existing) {
        results.push({
          clientOpId: op.clientOpId,
          status: existing.status as SyncStatus,
          syncQueueId: Number(existing.id),
          conflictData: existing.conflictData ?? undefined,
          duplicate: true,
        });
        continue;
      }

      const row = await this.prisma.syncQueue.create({
        data: {
          deviceId: dto.deviceId,
          clientOpId: op.clientOpId,
          userId,
          operation: 'submit_fact',
          payload: op.payload as unknown as object,
          clientTimestamp: new Date(op.clientTimestamp),
          serverReceivedAt: new Date(),
          lastKnownVersion: op.lastKnownVersion,
          boqVersionNumber: op.boqVersionNumber,
          status: 'pending',
        },
      });

      const result = await this.applyFactOperation(
        user.organizationId,
        userId,
        row.id,
        op,
      );
      results.push(result);

      if (result.status === 'conflict' || result.status === 'escalated') {
        stopped = true;
      }
    }

    return { results };
  }

  private validateOperation(raw: Record<string, unknown>): string | null {
    if (
      typeof raw?.clientOpId !== 'string' ||
      raw.clientOpId.length === 0 ||
      raw.clientOpId.length > 64
    ) {
      return 'INVALID_CLIENT_OP_ID';
    }
    if (raw.operation !== 'submit_fact') return 'UNSUPPORTED_OPERATION';
    if (
      typeof raw.boqVersionNumber !== 'string' ||
      raw.boqVersionNumber.length === 0
    ) {
      return 'INVALID_BOQ_VERSION';
    }
    if (
      !Number.isInteger(raw.lastKnownVersion) ||
      (raw.lastKnownVersion as number) < 0
    ) {
      return 'INVALID_LAST_KNOWN_VERSION';
    }
    if (
      typeof raw.clientTimestamp !== 'string' ||
      Number.isNaN(Date.parse(raw.clientTimestamp))
    ) {
      return 'INVALID_CLIENT_TIMESTAMP';
    }
    const p = raw.payload as Record<string, unknown> | undefined;
    if (
      !p ||
      !Number.isInteger(p.periodId) ||
      !Number.isInteger(p.boqItemId) ||
      typeof p.scVolume !== 'number'
    ) {
      return 'INVALID_PAYLOAD';
    }
    return null;
  }

  private async applyFactOperation(
    orgId: string,
    userId: number,
    rowId: bigint,
    op: SyncFactOperation,
  ): Promise<SyncOperationResult> {
    const { periodId, boqItemId, scVolume, workAccessible } = op.payload;

    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      include: {
        object: { select: { organizationId: true } },
        boqVersion: { select: { versionNumber: true } },
      },
    });
    if (!period || period.object.organizationId !== orgId) {
      return this.reject(rowId, op.clientOpId, 'PERIOD_NOT_FOUND');
    }
    // ADR-006 version gating: офлайн-операция против неактуальной версии BoQ
    if (period.boqVersion.versionNumber !== op.boqVersionNumber) {
      return this.reject(rowId, op.clientOpId, 'BOQ_VERSION_MISMATCH');
    }

    try {
      await this.periodService.upsertPeriodFact(
        periodId,
        boqItemId,
        scVolume,
        userId,
        { workAccessible, expectedVersion: op.lastKnownVersion },
      );
      await this.prisma.syncQueue.update({
        where: { id: rowId },
        data: { status: 'applied' },
      });
      return {
        clientOpId: op.clientOpId,
        status: 'applied',
        syncQueueId: Number(rowId),
      };
    } catch (e) {
      if (e instanceof VersionConflictException) {
        return this.markConflict(rowId, op, e, orgId, userId);
      }
      if (
        e instanceof ForbiddenException &&
        e.message === 'PERIOD_ALREADY_CLOSED'
      ) {
        const conflictData = await this.escalateClosedPeriod(
          rowId,
          periodId,
          boqItemId,
          {
            scVolume: op.payload.scVolume,
            lastKnownVersion: op.lastKnownVersion,
            clientTimestamp: op.clientTimestamp,
          },
          orgId,
          userId,
        );
        return {
          clientOpId: op.clientOpId,
          status: 'escalated',
          syncQueueId: Number(rowId),
          conflictData,
        };
      }
      if (e instanceof HttpException) {
        return this.reject(rowId, op.clientOpId, e.message);
      }
      throw e;
    }
  }

  private async markConflict(
    rowId: bigint,
    op: SyncFactOperation,
    e: VersionConflictException,
    orgId: string,
    userId: number,
  ): Promise<SyncOperationResult> {
    // ADR-003 практический кейс: UI показывает имя последнего инженера —
    // обогащаем server-снапшот последней audit-записью по факту.
    const lastAudit =
      e.serverFact.factId != null
        ? await this.prisma.auditLog.findFirst({
            where: {
              tableName: 'period_facts',
              recordId: BigInt(e.serverFact.factId),
            },
            orderBy: { performedAt: 'desc' },
            select: { performedBy: true, performedAt: true },
          })
        : null;

    const conflictData = {
      server: {
        scVolume: e.serverFact.scVolume,
        version: e.serverFact.version,
        lastChangedBy: lastAudit?.performedBy ?? null,
        lastChangedAt: lastAudit?.performedAt?.toISOString() ?? null,
      },
      device: {
        scVolume: op.payload.scVolume,
        lastKnownVersion: op.lastKnownVersion,
        clientTimestamp: op.clientTimestamp,
      },
    };

    await this.prisma.syncQueue.update({
      where: { id: rowId },
      data: { status: 'conflict', conflictData },
    });
    // Инвариант ADR-003: audit_log содержит полный snapshot обеих версий
    await this.auditLog.log({
      tableName: 'sync_queue',
      recordId: rowId,
      action: 'sync_conflict_detected',
      newData: conflictData,
      performedBy: userId,
      organizationId: orgId,
    });

    return {
      clientOpId: op.clientOpId,
      status: 'conflict',
      syncQueueId: Number(rowId),
      conflictData,
    };
  }

  /** ADR-003: конфликт в закрытом периоде — discrepancy type 3 + in-app
   *  уведомление админов + status='escalated'. Возвращает conflictData. */
  private async escalateClosedPeriod(
    rowId: bigint,
    periodId: number,
    boqItemId: number,
    device: Record<string, unknown>,
    orgId: string,
    userId: number,
  ): Promise<unknown> {
    const fact = await this.prisma.periodFact.findFirst({
      where: { periodId, boqItemId },
      select: { id: true, scVolume: true, version: true },
    });

    if (fact) {
      await this.prisma.discrepancy.create({
        data: {
          periodFactId: fact.id,
          type: 3, // offline_conflict_in_closed_period (см. Design deltas)
          status: 'open',
          scPosition: `Офлайн-конфликт в закрытом периоде: device sc_volume=${String(
            device.scVolume,
          )}, server sc_volume=${fact.scVolume ?? '—'} (v${fact.version})`,
        },
      });
    }

    const conflictData = {
      server: fact
        ? {
            scVolume: fact.scVolume != null ? Number(fact.scVolume) : null,
            version: fact.version,
          }
        : null,
      device,
    };

    await this.prisma.syncQueue.update({
      where: { id: rowId },
      data: { status: 'escalated', conflictData },
    });

    const admins = await this.prisma.user.findMany({
      where: { organizationId: orgId, role: 'admin' },
      select: { id: true },
    });
    if (admins.length > 0) {
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: 'sync_conflict_escalated',
          referenceTable: 'sync_queue',
          referenceId: rowId,
          message: `Офлайн-конфликт в закрытом периоде (period_id=${periodId}, boq_item_id=${boqItemId}). Разрешение — adminCorrectFact (ADR-007).`,
        })),
      });
    }

    await this.auditLog.log({
      tableName: 'sync_queue',
      recordId: rowId,
      action: 'sync_conflict_escalated',
      newData: conflictData,
      performedBy: userId,
      organizationId: orgId,
    });

    return conflictData;
  }

  private async reject(
    rowId: bigint,
    clientOpId: string,
    reason: string,
  ): Promise<SyncOperationResult> {
    // Отдельной колонки reason нет — храним в conflict_data (Design deltas)
    await this.prisma.syncQueue.update({
      where: { id: rowId },
      data: { status: 'rejected', conflictData: { reason } },
    });
    return {
      clientOpId,
      status: 'rejected',
      syncQueueId: Number(rowId),
      reason,
    };
  }

  async resolveConflict(userId: number, dto: SyncResolveDto) {
    const row = await this.prisma.syncQueue.findUnique({
      where: { id: BigInt(dto.syncQueueId) },
    });
    if (!row) {
      throw new NotFoundException('SYNC_OPERATION_NOT_FOUND');
    }
    if (row.status !== 'conflict') {
      throw new ConflictException('SYNC_NOT_IN_CONFLICT');
    }

    const payload = row.payload as unknown as SyncFactPayload;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });
    const period = await this.prisma.period.findUnique({
      where: { id: payload.periodId },
      include: { object: { select: { organizationId: true } } },
    });
    if (!period || period.object.organizationId !== user.organizationId) {
      throw new NotFoundException('PERIOD_NOT_FOUND');
    }

    if (period.status === 'closed' || period.status === 'force_closed') {
      await this.escalateClosedPeriod(
        row.id,
        payload.periodId,
        payload.boqItemId,
        { chosenValue: dto.chosenValue, note: dto.note },
        user.organizationId,
        userId,
      );
      throw new ConflictException('PERIOD_ALREADY_CLOSED_ESCALATE');
    }

    // ADR-003: серверное значение перечитывается из БД, не из conflict_data
    const serverFact = await this.prisma.periodFact.findFirst({
      where: { periodId: payload.periodId, boqItemId: payload.boqItemId },
      select: { scVolume: true, version: true },
    });

    await this.periodService.upsertPeriodFact(
      payload.periodId,
      payload.boqItemId,
      dto.chosenValue,
      userId,
    );

    await this.prisma.syncQueue.update({
      where: { id: row.id },
      data: { status: 'applied', resolvedAt: new Date(), resolvedBy: userId },
    });

    // Инвариант ADR-003: полный snapshot обеих версий + имя SC (performedBy)
    await this.auditLog.log({
      tableName: 'sync_queue',
      recordId: row.id,
      action: 'sync_conflict_resolved',
      oldData: {
        server: serverFact
          ? {
              scVolume:
                serverFact.scVolume != null
                  ? Number(serverFact.scVolume)
                  : null,
              version: serverFact.version,
            }
          : null,
        device:
          (row.conflictData as { device?: unknown } | null)?.device ?? null,
      },
      newData: { chosenValue: dto.chosenValue, note: dto.note },
      reason: dto.note,
      performedBy: userId,
      organizationId: user.organizationId,
    });

    return {
      syncQueueId: Number(row.id),
      status: 'applied' as const,
      appliedValue: dto.chosenValue,
    };
  }

  async uploadPhoto(
    _userId: number,
    _dto: SyncPhotoDto,
    _file: Express.Multer.File,
  ): Promise<never> {
    throw new Error('not implemented — see Task 5');
  }
}
