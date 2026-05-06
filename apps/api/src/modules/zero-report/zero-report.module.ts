import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { ZeroReportService } from './zero-report.service';
import { ZeroReportController } from './zero-report.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ZeroReportController],
  providers: [ZeroReportService],
  exports: [ZeroReportService],
})
export class ZeroReportModule {}
