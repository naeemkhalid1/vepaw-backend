import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClinicRequestsService } from './clinic-requests.service';
import { CreateClinicRequestDto } from './dto/create-clinic-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('clinic-requests')
@ApiBearerAuth()
@Controller('clinic-requests')
export class ClinicRequestsController {
  constructor(private readonly clinicRequestsService: ClinicRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Request a vet-clinic listing item for a pet' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateClinicRequestDto) {
    return this.clinicRequestsService.createRequest(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own clinic requests' })
  list(@CurrentUser() user: JwtPayload) {
    return this.clinicRequestsService.listMyRequests(user.sub);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending clinic request' })
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.clinicRequestsService.cancelRequest(user.sub, id);
  }
}
