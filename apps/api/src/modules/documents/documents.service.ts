import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from './storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    userId: number,
    objectId: number,
    dto: UploadDocumentDto,
    file: Express.Multer.File,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { organizationId: true },
    });

    const obj = await this.prisma.constructionObject.findUnique({
      where: { id: objectId },
      select: { organizationId: true },
    });

    if (!obj || obj.organizationId !== user.organizationId) {
      throw new NotFoundException('OBJECT_NOT_FOUND');
    }

    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${user.organizationId}/${objectId}/${dto.docType}/${timestamp}-${safeName}`;

    await this.storage.upload(key, file.buffer, file.mimetype);

    const doc = await this.prisma.l2Document.create({
      data: {
        objectId,
        docType: dto.docType,
        version: dto.version,
        filePath: key,
        uploadedBy: userId,
      },
      select: {
        id: true,
        docType: true,
        version: true,
        filePath: true,
        uploadedAt: true,
      },
    });

    return {
      ...doc,
      uploadedAt: doc.uploadedAt.toISOString(),
    };
  }
}
