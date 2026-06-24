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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminService } from './admin.service';
import { CreateCommissionTierDto } from './dto/create-commission-tier.dto';
import { UpdateCommissionTierDto } from './dto/update-commission-tier.dto';
import { SendBroadcastDto } from './dto/send-broadcast.dto';
import { ScheduleBroadcastDto } from './dto/schedule-broadcast.dto';
import { AdminLoginDto } from '../auth/dto/admin-login.dto';
import {
  UpdateVetApplicationStatusDto,
  UpdateStoreApplicationStatusDto,
  UpdateUserStatusDto,
  UpdateTransactionStatusDto,
} from './dto/update-status.dto';

// ─── Admin Auth ──────────────────────────────────────

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login' })
  login(@Body() dto: AdminLoginDto) {
    return this.service.adminLogin(dto.email, dto.password);
  }
}

// ─── Overview ──────────────────────────────────────────

@ApiTags('admin-overview')
@Controller('admin/overview')
@ApiBearerAuth()
@Roles('admin')
export class AdminOverviewController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Overview stats' })
  getStats() {
    return this.service.getOverviewStats();
  }

  @Get('gmv')
  @ApiOperation({ summary: 'GMV chart data' })
  getGmv() {
    return this.service.getGmvChart();
  }

  @Get('attention')
  @ApiOperation({ summary: 'Items needing attention' })
  getAttention() {
    return this.service.getAttentionItems();
  }
}

// ─── Admin Stats & Vet Applications ───────────────────

@ApiTags('admin')
@Controller('admin')
@ApiBearerAuth()
@Roles('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Admin dashboard stats' })
  getStats() {
    return this.service.getAdminStats();
  }

  @Get('vet-applications')
  @ApiOperation({ summary: 'List vet applications' })
  getVetApplications() {
    return this.service.getVetApplications();
  }

  @Get('vet-applications/:id')
  @ApiOperation({ summary: 'Get vet application detail' })
  getVetApplicationDetail(@Param('id') id: string) {
    return this.service.getVetApplicationDetail(id);
  }

  @Post('vet-applications/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update vet application status' })
  updateApplicationStatus(@Param('id') id: string, @Body() dto: UpdateVetApplicationStatusDto) {
    return this.service.updateVetApplicationStatus(id, dto.status, dto.reason);
  }

  @Get('store-applications')
  @ApiOperation({ summary: 'List store applications' })
  getStoreApplications() {
    return this.service.getStoreApplications();
  }

  @Get('store-applications/:id')
  @ApiOperation({ summary: 'Get store application detail' })
  getStoreApplicationDetail(@Param('id') id: string) {
    return this.service.getStoreApplicationDetail(id);
  }

  @Post('store-applications/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update store application status' })
  updateStoreApplicationStatus(@Param('id') id: string, @Body() dto: UpdateStoreApplicationStatusDto) {
    return this.service.updateStoreApplicationStatus(id, dto.status, dto.reason);
  }
}

// ─── Users ──────────────────────────────────────────────

@ApiTags('admin-users')
@Controller('admin/users')
@ApiBearerAuth()
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly service: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  getUsers() {
    return this.service.getUsers();
  }

  @Get('stats')
  @ApiOperation({ summary: 'User stats' })
  getStats() {
    return this.service.getUserStats();
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user status' })
  updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.service.updateUserStatus(id, dto.status);
  }
}

// ─── Transactions ───────────────────────────────────────

@ApiTags('admin-transactions')
@Controller('admin/transactions')
@ApiBearerAuth()
@Roles('admin')
export class AdminTransactionsController {
  constructor(private readonly service: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List transactions' })
  getTransactions() {
    return this.service.getTransactions();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Transaction stats' })
  getStats() {
    return this.service.getTransactionStats();
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin override transaction status' })
  updateTransactionStatus(@Param('id') id: string, @Body() dto: UpdateTransactionStatusDto) {
    return this.service.updateTransactionStatus(id, dto.status);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release escrow payout' })
  releaseEscrow(@Param('id') id: string) {
    return this.service.releaseEscrow(id);
  }
}

// ─── Commissions ────────────────────────────────────────

@ApiTags('admin-commissions')
@Controller('admin/commissions')
@ApiBearerAuth()
@Roles('admin')
export class AdminCommissionsController {
  constructor(private readonly service: AdminService) {}

  @Get('tiers')
  @ApiOperation({ summary: 'List commission tiers' })
  getTiers() {
    return this.service.getCommissionTiers();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Commission stats' })
  getStats() {
    return this.service.getCommissionStats();
  }

  @Post('tiers')
  @ApiOperation({ summary: 'Create commission tier' })
  createTier(@Body() dto: CreateCommissionTierDto) {
    return this.service.createCommissionTier(dto);
  }

  @Put('tiers/:id')
  @ApiOperation({ summary: 'Update commission tier' })
  updateTier(@Param('id') id: string, @Body() dto: UpdateCommissionTierDto) {
    return this.service.updateCommissionTier(id, dto);
  }

  @Delete('tiers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete commission tier' })
  deleteTier(@Param('id') id: string) {
    return this.service.deleteCommissionTier(id);
  }
}

// ─── Broadcasts ─────────────────────────────────────────

@ApiTags('admin-broadcasts')
@Controller('admin/broadcasts')
@ApiBearerAuth()
@Roles('admin')
export class AdminBroadcastsController {
  constructor(private readonly service: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List broadcasts' })
  getBroadcasts() {
    return this.service.getBroadcasts();
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send broadcast' })
  send(@Body() dto: SendBroadcastDto) {
    return this.service.sendBroadcast(dto);
  }

  @Post('schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule broadcast' })
  schedule(@Body() dto: ScheduleBroadcastDto) {
    return this.service.scheduleBroadcast(dto);
  }

  @Get('options')
  @ApiOperation({ summary: 'Broadcast audience and channel options' })
  getOptions() {
    return this.service.getBroadcastOptions();
  }
}

// ─── Reports ────────────────────────────────────────────

@ApiTags('admin-reports')
@Controller('admin/reports')
@ApiBearerAuth()
@Roles('admin')
export class AdminReportsController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Report stats' })
  getStats(@Query('period') period?: string) {
    return this.service.getReportStatsWithPeriod(period);
  }

  @Get('areas')
  @ApiOperation({ summary: 'Area breakdown' })
  getAreas(@Query('period') period?: string) {
    return this.service.getAreaBreakdownWithPeriod(period);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Category breakdown' })
  getCategories(@Query('period') period?: string) {
    return this.service.getCategoryBreakdownWithPeriod(period);
  }
}
