import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { BoqService } from './boq.service';
import { BoqController } from './boq.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BoqController],
  providers: [BoqService],
  exports: [BoqService],
})
export class BoqModule {}
