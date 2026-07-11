import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/guards/auth.module';
import { AuditLogModule } from './common/audit/audit-log.module';
import { TenantMiddleware } from './common/prisma/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PeriodModule } from './modules/period/period.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ObjectsModule } from './modules/objects/objects.module';
import { AdminModule } from './modules/admin/admin.module';
import { BoqModule } from './modules/boq/boq.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ZeroReportModule } from './modules/zero-report/zero-report.module';
import { DisputeSlaModule } from './modules/dispute-sla/dispute-sla.module';
import { BaselineModule } from './modules/baseline/baseline.module';
import { SyncModule } from './modules/sync/sync.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    AuditLogModule,
    PeriodModule,
    AnalyticsModule,
    ObjectsModule,
    AdminModule,
    BoqModule,
    SystemConfigModule,
    DocumentsModule,
    ZeroReportModule,
    DisputeSlaModule,
    BaselineModule,
    SyncModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude('health/*path')
      .forRoutes('*');
  }
}
