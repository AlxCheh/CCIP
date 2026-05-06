import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { StorageService } from './storage.service';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DocumentsController],
  providers: [StorageService, DocumentsService],
})
export class DocumentsModule {}
