import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VetPortalService } from './vet-portal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClinicRoles } from '../../common/decorators/clinic-roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';
import { AddVisitNoteDto } from './dto/add-visit-note.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { DisputeConsultationDto } from './dto/dispute-consultation.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';
import { UpdateVetProfileDto } from './dto/update-vet-profile.dto';
import { imageUploadOptions } from '../../common/storage/image-upload.options';
import { BlockSlotsDto } from './dto/block-slots.dto';
import { UploadOnboardingDocumentDto } from './dto/upload-onboarding-document.dto';
import { BlockDayDto } from './dto/block-day.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { AcceptVetInviteDto } from './dto/accept-vet-invite.dto';
import { GetScheduleAppointmentsDto } from './dto/get-schedule-appointments.dto';
import {
  UpdateAppointmentStatusDto,
  AddVaccinationDto,
  RecommendProductDto,
  UpdateListingStatusDto,
  UpdateTeamMemberStatusDto,
  UpdatePayoutAccountDto,
} from './dto/update-status.dto';

// ─── Schedule ──────────────────────────────────────────

@ApiTags('vet-schedule')
@Controller('vet/schedule')
@ApiBearerAuth()
@Roles('vet')
export class VetScheduleController {
  constructor(private readonly service: VetPortalService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Schedule stats' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getScheduleStats(user.sub);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Appointments within a date range — defaults to today if no range is given' })
  getAppointments(@CurrentUser() user: JwtPayload, @Query() dto: GetScheduleAppointmentsDto) {
    return this.service.getScheduleAppointments(user.sub, dto);
  }

  @Get('next-patient')
  @ApiOperation({ summary: 'Next patient details' })
  getNextPatient(@CurrentUser() user: JwtPayload) {
    return this.service.getNextPatient(user.sub);
  }

  @Get('clinic/stats')
  @ClinicRoles('admin_vet', 'manager')
  @ApiOperation({ summary: 'Clinic-wide schedule stats across every staff vet' })
  getClinicStats(@CurrentUser() user: JwtPayload) {
    return this.service.getClinicScheduleStats(user.sub);
  }

  @Get('clinic')
  @ClinicRoles('admin_vet', 'manager')
  @ApiOperation({ summary: 'Clinic-wide appointments across every staff vet — defaults to today if no range is given' })
  getClinicAppointments(@CurrentUser() user: JwtPayload, @Query() dto: GetScheduleAppointmentsDto) {
    return this.service.getClinicScheduleAppointments(user.sub, dto);
  }

  @Post('appointments/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update appointment status' })
  updateAppointmentStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateAppointmentStatusDto) {
    return this.service.updateAppointmentStatus(user, id, dto.status);
  }
}

// ─── Patients ──────────────────────────────────────────

@ApiTags('vet-patients')
@Controller('vet/patients')
@ApiBearerAuth()
@Roles('vet')
export class VetPatientsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List patients' })
  getPatients(@CurrentUser() user: JwtPayload) {
    return this.service.getPatients(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Patient stats' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getPatientStats(user.sub);
  }

  @Get(':id/chart')
  @ApiOperation({ summary: 'Patient chart' })
  getChart(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getPatientChart(user.sub, id);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add visit note' })
  addNote(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddVisitNoteDto) {
    return this.service.addVisitNote(user.sub, id, dto);
  }

  @Post(':id/vaccinations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record vaccination' })
  addVaccination(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddVaccinationDto) {
    return this.service.addVaccination(user.sub, id, dto.name, dto.dateAdministered, dto.nextDueDate, dto.batchNumber);
  }

  @Post(':id/recommend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recommend product to pet owner' })
  recommend(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: RecommendProductDto) {
    return this.service.recommendProduct(user.sub, id, dto.productId, dto.source);
  }
}

// ─── Reviews ──────────────────────────────────────────

@ApiTags('vet-reviews')
@Controller('vet/reviews')
@ApiBearerAuth()
@Roles('vet')
export class VetReviewsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews' })
  getReviews(@CurrentUser() user: JwtPayload) {
    return this.service.getReviews(user.sub);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Review summary' })
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.service.getReviewSummary(user.sub);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply to review' })
  reply(@Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.service.replyToReview(id, dto);
  }
}

// ─── Earnings ──────────────────────────────────────────

@ApiTags('vet-earnings')
@Controller('vet/earnings')
@ApiBearerAuth()
@Roles('vet')
export class VetEarningsController {
  constructor(private readonly service: VetPortalService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Earnings overview' })
  getStats(@CurrentUser() user: JwtPayload, @Query('period') period?: string) {
    return this.service.getEarningsWithPeriod(user.sub, 'stats', period);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Monthly earnings chart' })
  getMonthly(@CurrentUser() user: JwtPayload, @Query('period') period?: string) {
    return this.service.getMonthlyEarnings(user.sub);
  }

  @Get('peak-hours')
  @ApiOperation({ summary: 'Peak booking hours' })
  getPeakHours(@CurrentUser() user: JwtPayload, @Query('period') period?: string) {
    return this.service.getPeakHours(user.sub);
  }

  @Get('pet-types')
  @ApiOperation({ summary: 'Pet type breakdown' })
  getPetTypes(@CurrentUser() user: JwtPayload, @Query('period') period?: string) {
    return this.service.getPetTypes(user.sub);
  }
}

// ─── Payouts ──────────────────────────────────────────

@ApiTags('vet-payouts')
@Controller('vet/payouts')
@ApiBearerAuth()
@Roles('vet')
@ClinicRoles('admin_vet', 'manager')
export class VetPayoutsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'Payout history' })
  getPayouts(@CurrentUser() user: JwtPayload) {
    return this.service.getPayouts(user.sub);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Payout summary' })
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.service.getPayoutSummary(user.sub);
  }

  @Get('account')
  @ApiOperation({ summary: 'Payout account' })
  getAccount(@CurrentUser() user: JwtPayload) {
    return this.service.getPayoutAccount(user.sub);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request withdrawal' })
  withdraw(@CurrentUser() user: JwtPayload) {
    return this.service.vetWithdraw(user.sub);
  }
}

// ─── Team ──────────────────────────────────────────────

@ApiTags('vet-team')
@Controller('vet/team')
@ApiBearerAuth()
@Roles('vet')
export class VetTeamController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List team' })
  getTeam(@CurrentUser() user: JwtPayload) {
    return this.service.getTeam(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Team stats' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getTeamStats(user.sub);
  }

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  @ClinicRoles('admin_vet')
  @ApiOperation({ summary: 'Invite team member' })
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteTeamMemberDto) {
    return this.service.inviteTeamMember(user.sub, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update team member status' })
  updateMemberStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTeamMemberStatusDto) {
    return this.service.updateTeamMemberStatus(user.sub, id, dto.status);
  }
}

// ─── Notifications ─────────────────────────────────────

@ApiTags('vet-notifications')
@Controller('vet/notifications')
@ApiBearerAuth()
@Roles('vet')
export class VetNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications (paginated)' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.listForVet(user.sub, page, limit);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllVetRead(user.sub);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.markVetRead(user.sub, id);
  }
}

// ─── Listings ──────────────────────────────────────────

@ApiTags('vet-listings')
@Controller('vet/listings')
@ApiBearerAuth()
@Roles('vet')
export class VetListingsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List products' })
  getListings(@CurrentUser() user: JwtPayload) {
    return this.service.getListings(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Listing stats' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getListingStats(user.sub);
  }

  @Post('add')
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create listing' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateListingDto, @UploadedFile() photo?: Express.Multer.File) {
    return this.service.createListing(user.sub, dto, photo);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update listing' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.service.updateListing(user.sub, id, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update listing status' })
  updateListingStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateListingStatusDto) {
    return this.service.updateListingStatus(user.sub, id, dto.status);
  }
}

// ─── Clinic Settings ──────────────────────────────────

@ApiTags('vet-clinic-settings')
@Controller('vet/clinic-settings')
@ApiBearerAuth()
@Roles('vet')
export class VetClinicSettingsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'Get clinic settings' })
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.service.getClinicSettings(user.sub);
  }

  @Put()
  @ApiOperation({ summary: 'Update clinic settings' })
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateClinicSettingsDto) {
    return this.service.updateClinicSettings(user, dto);
  }

  @Post('payout')
  @HttpCode(HttpStatus.OK)
  @ClinicRoles('admin_vet', 'manager')
  @ApiOperation({ summary: 'Submit new payout account' })
  updatePayoutAccount(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePayoutAccountDto) {
    return this.service.updateVetPayoutAccount(user.sub, dto);
  }

  @Get('payout/history')
  @ClinicRoles('admin_vet', 'manager')
  @ApiOperation({ summary: 'Audit log of payout account changes for this clinic' })
  getPayoutAccountHistory(@CurrentUser() user: JwtPayload) {
    return this.service.getPayoutAccountHistory(user.sub);
  }

  @Get('payout/activity')
  @ClinicRoles('admin_vet', 'manager')
  @ApiOperation({ summary: 'Unified feed: payout account changes + payout requested/settled events' })
  getPayoutActivity(@CurrentUser() user: JwtPayload) {
    return this.service.getPayoutActivity(user.sub);
  }
}

// ─── Profile ────────────────────────────────────────────
// Personal fields only (name/photo/about/specialty/yearsExperience/languages) — deliberately no
// @ClinicRoles restriction, same behavior for admin_vet/team_vet/manager since each is editing
// only their own Vet document. Business identity (clinicName/phone/address) stays under
// vet/clinic-settings above.

@ApiTags('vet-profile')
@Controller('vet/profile')
@ApiBearerAuth()
@Roles('vet')
export class VetProfileController {
  constructor(private readonly service: VetPortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my own profile' })
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.service.getMyProfile(user.sub);
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('photo', imageUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update my own profile — all fields optional' })
  updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVetProfileDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.updateMyProfile(user.sub, dto, photo);
  }
}

// ─── Availability ──────────────────────────────────────

@ApiTags('vet-availability')
@Controller('vet/availability')
@ApiBearerAuth()
@Roles('vet')
export class VetAvailabilityController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'Get availability' })
  getAvailability(@CurrentUser() user: JwtPayload, @Query('date') date?: string) {
    return this.service.getAvailability(user.sub, date);
  }

  @Post('block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block slots' })
  blockSlots(@CurrentUser() user: JwtPayload, @Body() dto: BlockSlotsDto) {
    return this.service.blockSlots(user.sub, dto);
  }

  @Post('unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock slots' })
  unblockSlots(@CurrentUser() user: JwtPayload, @Body() dto: BlockSlotsDto) {
    return this.service.unblockSlots(user.sub, dto);
  }

  @Post('block-day')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block entire day' })
  blockDay(@CurrentUser() user: JwtPayload, @Body() dto: BlockDayDto) {
    return this.service.blockDay(user.sub, dto);
  }

  @Delete('time-off/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel time off' })
  cancelTimeOff(@Param('id') id: string) {
    return this.service.cancelTimeOff(id);
  }
}

// ─── Onboarding ──────────────────────────────────────

@ApiTags('vet-onboarding')
@Controller('vet/onboarding')
export class VetOnboardingController {
  constructor(private readonly service: VetPortalService) {}

  @Get('draft')
  @ApiBearerAuth()
  @Roles('vet')
  @ApiOperation({ summary: 'Get saved onboarding draft' })
  getDraft(@CurrentUser() user: JwtPayload) {
    return this.service.getOnboardingDraft(user.sub);
  }

  @Public()
  @Post('submit')
  @ApiOperation({ summary: 'Submit vet application' })
  submit(@Body() dto: SubmitOnboardingDto) {
    return this.service.submitOnboarding(dto);
  }

  @Public()
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload onboarding document' })
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadOnboardingDocumentDto) {
    return this.service.uploadFile(file, dto.documentType);
  }
}

// ─── Chat ─────────────────────────────────────────────

@ApiTags('vet-chat')
@Controller('vet/chat')
@ApiBearerAuth()
@Roles('vet')
export class VetChatController {
  constructor(private readonly service: VetPortalService) {}

  @Get('patient/:patientId/messages')
  @ApiOperation({ summary: 'Fetch chat history for a vet-patient conversation' })
  getMessages(@CurrentUser() user: JwtPayload, @Param('patientId') patientId: string) {
    return this.service.getThreadMessages(user.sub, patientId);
  }
}

// ─── Recommend ────────────────────────────────────────

@ApiTags('vet-recommend')
@Controller('vet/recommend')
@ApiBearerAuth()
@Roles('vet')
export class VetRecommendController {
  constructor(private readonly service: VetPortalService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search own listings + store products for recommendation' })
  search(@CurrentUser() user: JwtPayload, @Query('q') q: string) {
    return this.service.searchRecommendProducts(user.sub, q ?? '');
  }
}

// ─── Clinic requests ──────────────────────────────────

@ApiTags('vet-requests')
@Controller('vet/requests')
@ApiBearerAuth()
@Roles('vet')
export class VetRequestsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List clinic item requests for this vet' })
  getRequests(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.service.getClinicRequests(user.sub, status);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a pending clinic request' })
  confirm(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.confirmClinicRequest(user.sub, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a pending clinic request' })
  decline(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.declineClinicRequest(user.sub, id);
  }

  @Post(':id/dispense')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a confirmed clinic request as dispensed — decrements listing stock' })
  dispense(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.dispenseClinicRequest(user.sub, id);
  }
}

// ─── Paid text consultations ──────────────────────────

@ApiTags('vet-consultations')
@Controller('vet/consultations')
@ApiBearerAuth()
@Roles('vet')
export class VetConsultationsController {
  constructor(private readonly service: VetPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List paid text consultation sessions for this vet' })
  getConsultations(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.service.getVetConsultations(user.sub, status);
  }

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify payment proof and activate the consultation session' })
  markPaid(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.markConsultationPaid(user, id);
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispute a submitted payment proof — escalates to platform admin' })
  dispute(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DisputeConsultationDto) {
    return this.service.disputeConsultation(user, id, dto.reason);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End an active consultation session' })
  end(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.endConsultation(user, id);
  }
}

// ─── Invite ──────────────────────────────────────────

@ApiTags('vet-invite')
@Controller('vet/invite')
export class VetInviteController {
  constructor(private readonly service: VetPortalService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Get invite details' })
  getDetails(@Param('token') token: string) {
    return this.service.getInviteDetails(token);
  }

  @Public()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept invite' })
  accept(@Param('token') token: string, @Body() dto: AcceptVetInviteDto) {
    return this.service.acceptInvite(token, dto);
  }
}
