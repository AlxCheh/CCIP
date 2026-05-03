import {
  Controller,
  Get,
  Param,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { ObjectsService } from './objects.service';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Get(':id')
  @Roles('director', 'sc', 'admin')
  getDetail(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthRequest,
  ) {
    return this.objectsService.getDetail(parseInt(req.user.id, 10), id);
  }
}
