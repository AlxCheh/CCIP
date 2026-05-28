import { Controller, Post, Get, Param, Body, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../../common/guards/roles.decorator';
import { DisputeService } from './dispute.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Controller()
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post('periods/:periodId/facts/:boqItemId/dispute')
  @Roles('site_control')
  async createDispute(
    @Param('periodId', ParseIntPipe) periodId: number,
    @Param('boqItemId', ParseIntPipe) boqItemId: number,
    @Body() dto: CreateDisputeDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.disputeService.createDispute(periodId, boqItemId, req.user.id, dto);
  }

  @Get('periods/:periodId/discrepancies')
  @Roles('site_control', 'director', 'admin')
  async listDiscrepancies(
    @Param('periodId', ParseIntPipe) periodId: number,
  ) {
    return this.disputeService.listDiscrepancies(periodId);
  }
}
