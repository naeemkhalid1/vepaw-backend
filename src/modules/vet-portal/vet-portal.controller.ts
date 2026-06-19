import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VetPortalService } from './vet-portal.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';
import { AddVisitNoteDto } from './dto/add-visit-note.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';
import { BlockSlotsDto } from './dto/block-slots.dto';
import { BlockDayDto } from './dto/block-day.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { AcceptVetInviteDto } from './dto/accept-vet-invite.dto';

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
  @ApiOperation({ summary: "Today's appointments" })
  getAppointments(@CurrentUser() user: JwtPayload) {
    return this.service.getScheduleAppointments(user.sub);
  }

  @Get('next-patient')
  @ApiOperation({ summary: 'Next patient details' })
  getNextPatient(@CurrentUser() user: JwtPayload) {
    return this.service.getNextPatient(user.sub);
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
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getEarningsStats(user.sub);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Monthly earnings chart' })
  getMonthly(@CurrentUser() user: JwtPayload) {
    return this.service.getMonthlyEarnings(user.sub);
  }

  @Get('peak-hours')
  @ApiOperation({ summary: 'Peak booking hours' })
  getPeakHours(@CurrentUser() user: JwtPayload) {
    return this.service.getPeakHours(user.sub);
  }

  @Get('pet-types')
  @ApiOperation({ summary: 'Pet type breakdown' })
  getPetTypes(@CurrentUser() user: JwtPayload) {
    return this.service.getPetTypes(user.sub);
  }
}

// ─── Payouts ──────────────────────────────────────────

@ApiTags('vet-payouts')
@Controller('vet/payouts')
@ApiBearerAuth()
@Roles('vet')
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
  @ApiOperation({ summary: 'Invite team member' })
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteTeamMemberDto) {
    return this.service.inviteTeamMember(user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove team member' })
  remove(@Param('id') id: string) {
    return this.service.removeTeamMember(id);
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

  @Post()
  @ApiOperation({ summary: 'Create listing' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateListingDto) {
    return this.service.createListing(user.sub, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update listing' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.service.updateListing(user.sub, id, dto);
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle listing active/hidden' })
  toggle(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.toggleListing(user.sub, id);
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
    return this.service.updateClinicSettings(user.sub, dto);
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
  getAvailability(@CurrentUser() user: JwtPayload) {
    return this.service.getAvailability(user.sub);
  }

  @Post('block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block slots' })
  blockSlots(@CurrentUser() user: JwtPayload, @Body() dto: BlockSlotsDto) {
    return this.service.blockSlots(user.sub, dto);
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
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.service.uploadFile(file);
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
