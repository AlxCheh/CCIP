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
import { ObjectParticipantsService } from './object-participants.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { ChangeGeneralContractorDto } from './dto/change-general-contractor.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('objects')
export class ObjectsController {
  constructor(
    private readonly objectsService: ObjectsService,
    private readonly objectParticipantsService: ObjectParticipantsService,
  ) {}

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

  @Post(':id/general-contractor')
  @Roles('admin')
  changeGeneralContractor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeGeneralContractorDto,
    @Request() req: AuthRequest,
  ) {
    return this.objectParticipantsService.changeGeneralContractor(
      parseInt(req.user.id, 10),
      id,
      dto,
    );
  }
}
