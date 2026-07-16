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
import { CreateAppointmentReservationDto } from './dto/create-appointment-reservation.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { DisputeAppointmentDto } from './dto/dispute-appointment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a COD appointment — validates fee and locks slot immediately' })
  createAppointment(@CurrentUser() user: JwtPayload, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.createAppointment(user.sub, dto);
  }

  @Post('reservations')
  @ApiOperation({
    summary:
      'Reserve a slot for a safepay appointment ahead of checkout — no real appointment exists until payment is confirmed',
  })
  createReservation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAppointmentReservationDto,
  ) {
    return this.appointmentsService.createReservation(user.sub, dto);
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
  @Roles('vet')
  @ApiOperation({ summary: 'Mark appointment complete (vet side) — only the treating vet may call this' })
  completeAppointment(@CurrentUser() user: JwtPayload, @Param('id') appointmentId: string) {
    return this.appointmentsService.completeAppointment(user.sub, appointmentId);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel appointment' })
  cancelAppointment(@CurrentUser() user: JwtPayload, @Param('id') appointmentId: string) {
    return this.appointmentsService.cancelAppointment(user.sub, appointmentId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel appointment (POST alias for clients that send POST)' })
  cancelAppointmentPost(@CurrentUser() user: JwtPayload, @Param('id') appointmentId: string) {
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

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Dispute a completed appointment before its held payout auto-releases to the vet',
  })
  disputeAppointment(
    @CurrentUser() user: JwtPayload,
    @Param('id') appointmentId: string,
    @Body() dto: DisputeAppointmentDto,
  ) {
    return this.appointmentsService.disputeAppointment(
      user.sub,
      appointmentId,
      dto.reason,
    );
  }
}
