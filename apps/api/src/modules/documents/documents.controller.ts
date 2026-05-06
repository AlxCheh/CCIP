import {
  Controller,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('objects/:objectId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined, // memory storage
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(
    @Param('objectId', ParseIntPipe) objectId: number,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthRequest,
  ) {
    if (!file) {
      throw new BadRequestException('FILE_REQUIRED');
    }
    return this.documentsService.upload(
      parseInt(req.user.id, 10),
      objectId,
      dto,
      file,
    );
  }
}
