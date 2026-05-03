import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ObjectsService } from './objects.service';
import { ObjectsController } from './objects.controller';

@Module({
  imports: [PrismaModule, AuthModule, AnalyticsModule],
  controllers: [ObjectsController],
  providers: [ObjectsService],
})
export class ObjectsModule {}
