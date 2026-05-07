import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { ObjectsService } from './objects.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { CreateParticipantDto } from './dto/create-participant.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateObjectDto, @Request() req: AuthRequest) {
    return this.objectsService.create(parseInt(req.user.id, 10), dto);
  }

  @Get()
  @Roles('director', 'stroycontrol', 'admin')
  list(@Request() req: AuthRequest) {
    return this.objectsService.list(parseInt(req.user.id, 10));
  }

  @Get(':id')
  @Roles('director', 'stroycontrol', 'admin')
  getDetail(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthRequest,
  ) {
    return this.objectsService.getDetail(parseInt(req.user.id, 10), id);
  }

  @Post(':id/participants')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  addParticipant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateParticipantDto,
    @Request() req: AuthRequest,
  ) {
    return this.objectsService.addParticipant(
      parseInt(req.user.id, 10),
      id,
      dto,
    );
  }
}
