import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { BaselineService } from './baseline.service';
import { BaselineController } from './baseline.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [BaselineController],
  providers: [BaselineService],
})
export class BaselineModule {}
