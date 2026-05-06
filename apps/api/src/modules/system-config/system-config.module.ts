import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SystemConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
