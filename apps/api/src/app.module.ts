import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/guards/auth.module';
import { PeriodModule } from './modules/period/period.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ObjectsModule } from './modules/objects/objects.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PeriodModule,
    AnalyticsModule,
    ObjectsModule,
    AdminModule,
  ],
})
export class AppModule {}
