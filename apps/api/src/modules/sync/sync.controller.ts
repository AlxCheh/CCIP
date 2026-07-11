import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { SyncService } from './sync.service';
import { SyncOperationsDto } from './dto/sync-operations.dto';
import { SyncResolveDto } from './dto/sync-resolve.dto';
import { SyncPhotoDto } from './dto/sync-photo.dto';

const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20 MB

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('operations')
  @Roles('stroycontrol', 'admin')
  processOperations(
    @Body() dto: SyncOperationsDto,
    @Request() req: AuthRequest,
  ) {
    return this.syncService.processOperations(parseInt(req.user.id, 10), dto);
  }

  @Post('resolve')
  @Roles('stroycontrol', 'admin')
  resolve(@Body() dto: SyncResolveDto, @Request() req: AuthRequest) {
    return this.syncService.resolveConflict(parseInt(req.user.id, 10), dto);
  }

  @Post('photos')
  @Roles('stroycontrol', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined, // memory storage
      limits: { fileSize: MAX_PHOTO_SIZE },
    }),
  )
  async uploadPhoto(
    @Body() dto: SyncPhotoDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthRequest,
  ) {
    if (!file) {
      throw new BadRequestException('FILE_REQUIRED');
    }
    return this.syncService.uploadPhoto(parseInt(req.user.id, 10), dto, file);
  }
}
