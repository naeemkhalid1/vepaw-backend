import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create appointment — validates fee and locks slot immediately' })
  createAppointment(@CurrentUser() user: JwtPayload, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.createAppointment(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my appointments with optional status filter' })
  listAppointments(@CurrentUser() user: JwtPayload, @Query() dto: ListAppointmentsDto) {
    return this.appointmentsService.listAppointments(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment detail' })
  getAppointment(@CurrentUser() user: JwtPayload, @Param('id') appointmentId: string) {
    return this.appointmentsService.getAppointment(user.sub, appointmentId);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark appointment complete (vet side)' })
  completeAppointment(@Param('id') appointmentId: string) {
    return this.appointmentsService.completeAppointment(appointmentId);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel appointment' })
  cancelAppointment(@CurrentUser() user: JwtPayload, @Param('id') appointmentId: string) {
    return this.appointmentsService.cancelAppointment(user.sub, appointmentId);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Submit star rating for a completed appointment' })
  submitReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') appointmentId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.appointmentsService.submitReview(user.sub, appointmentId, dto);
  }
}
