import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { PeriodModule } from '../period/period.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [PrismaModule, AuthModule, PeriodModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
