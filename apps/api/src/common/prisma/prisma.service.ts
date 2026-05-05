import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@ccip/database';
import { tenantStorage } from './tenant.storage';

const TENANT_MODELS = new Set(['Object', 'User', 'SystemConfig', 'AuditLog']);

const FILTER_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow',
  'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate',
]);

const WRITE_OPS = new Set(['update', 'delete', 'updateMany', 'deleteMany']);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    this.$use(async (params, next) => {
      const ctx = tenantStorage.getStore();
      if (!ctx?.organizationId || !TENANT_MODELS.has(params.model ?? '')) {
        return next(params);
      }
      const { organizationId } = ctx;

      if (FILTER_OPS.has(params.action)) {
        params.args.where = { ...params.args.where, organizationId };
      } else if (params.action === 'create') {
        params.args.data = { ...params.args.data, organizationId };
      } else if (WRITE_OPS.has(params.action)) {
        params.args.where = { ...params.args.where, organizationId };
      } else if (params.action === 'upsert') {
        params.args.where = { ...params.args.where, organizationId };
        params.args.create = { ...params.args.create, organizationId };
      }

      return next(params);
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
