import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@ccip/database';
import { tenantStorage } from './tenant.storage';

const TENANT_MODELS = new Set(['Object', 'User', 'SystemConfig', 'AuditLog']);

const FILTER_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
]);

const WRITE_OPS = new Set(['update', 'delete', 'updateMany', 'deleteMany']);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    this.$use(async (params, next) => {
      const ctx = tenantStorage.getStore();
      if (!ctx?.organizationId || !TENANT_MODELS.has(params.model ?? '')) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return next(params);
      }
      const { organizationId } = ctx;
      const args = params.args as Record<string, Record<string, unknown>>;

      if (FILTER_OPS.has(params.action)) {
        args.where = { ...args.where, organizationId };
      } else if (params.action === 'create') {
        args.data = { ...args.data, organizationId };
      } else if (WRITE_OPS.has(params.action)) {
        args.where = { ...args.where, organizationId };
      } else if (params.action === 'upsert') {
        args.where = { ...args.where, organizationId };
        args.create = { ...args.create, organizationId };
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return next(params);
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
