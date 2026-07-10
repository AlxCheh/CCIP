import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ObjectsService } from './objects.service';
import { ObjectParticipantsService } from './object-participants.service';
import { ObjectsController } from './objects.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule, AnalyticsModule],
  controllers: [ObjectsController],
  providers: [ObjectsService, ObjectParticipantsService],
})
export class ObjectsModule {}
