import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StorePortalService } from './store-portal.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';
import { StoreRegisterDto } from './dto/store-register.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { AcceptStoreInviteDto } from './dto/accept-store-invite.dto';
import {
  UpdateOrderStatusDto,
  UpdateSubscriptionStatusDto,
  UpdateProductStatusDto,
  UpdateTeamMemberStatusDto,
  UpdatePayoutAccountDto,
} from './dto/update-status.dto';

// ─── Orders Controller ──────────────────────────────────

@ApiTags('store-orders')
@Controller('orders')
@ApiBearerAuth()
@Roles('store')
export class StoreOrdersController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'List store orders' })
  getOrders(@CurrentUser() user: JwtPayload) {
    return this.service.getOrders(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get order stats' })
  getOrderStats(@CurrentUser() user: JwtPayload) {
    return this.service.getOrderStats(user.sub);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order status' })
  updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.service.updateOrderStatus(user.sub, id, dto.status);
  }
}

// ─── Subscriptions Controller ────────────────────────────

@ApiTags('store-subscriptions')
@Controller('store/subscriptions')
@ApiBearerAuth()
@Roles('store')
export class StoreSubscriptionsController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'List store subscriptions' })
  getSubscriptions(@CurrentUser() user: JwtPayload) {
    return this.service.getSubscriptions(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Subscription stats' })
  getSubscriptionStats(@CurrentUser() user: JwtPayload) {
    return this.service.getSubscriptionStats(user.sub);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update subscription status' })
  updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateSubscriptionStatusDto) {
    return this.service.updateSubscriptionStatus(user.sub, id, dto.status);
  }
}

// ─── Products Controller ─────────────────────────────────

@ApiTags('store-products')
@Controller('store/products')
@ApiBearerAuth()
@Roles('store')
export class StoreProductsController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'List store products' })
  getProducts(@CurrentUser() user: JwtPayload) {
    return this.service.getProducts(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Product stats' })
  getProductStats(@CurrentUser() user: JwtPayload) {
    return this.service.getProductStats(user.sub);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get product categories' })
  getCategories() {
    return this.service.getProductCategories();
  }

  @Post()
  @ApiOperation({ summary: 'Add product' })
  createProduct(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.service.createProduct(user.sub, dto);
  }

  @Post('draft')
  @ApiOperation({ summary: 'Save product as draft' })
  createDraft(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.service.createProductDraft(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product detail' })
  getProduct(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getProduct(user.sub, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product' })
  updateProduct(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.updateProduct(user.sub, id, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product status' })
  updateProductStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateProductStatusDto) {
    return this.service.updateProductStatus(user.sub, id, dto.status);
  }
}

// ─── Product Categories Controller ───────────────────────

// ─── Bulk Import Controller ──────────────────────────────

@ApiTags('store-import')
@Controller('store/products/import')
@ApiBearerAuth()
@Roles('store')
export class StoreBulkImportController {
  constructor(private readonly service: StorePortalService) {}

  @Get('preview')
  @ApiOperation({ summary: 'Import preview' })
  getPreview(@CurrentUser() user: JwtPayload) {
    return this.service.getImportPreview(user.sub);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm import' })
  confirmImport(@CurrentUser() user: JwtPayload) {
    return this.service.confirmImport(user.sub);
  }

  @Get('template')
  @ApiOperation({ summary: 'Download CSV template' })
  async getTemplate(@Res() res: Response) {
    const csv = await this.service.getImportTemplate();
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=product-template.csv' });
    res.send(csv);
  }
}

// ─── Payouts Controller ──────────────────────────────────

@ApiTags('store-payouts')
@Controller('store/payouts')
@ApiBearerAuth()
@Roles('store')
export class StorePayoutsController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'Payout history' })
  getPayouts(@CurrentUser() user: JwtPayload) {
    return this.service.getPayouts(user.sub);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Payout summary' })
  getPayoutSummary(@CurrentUser() user: JwtPayload) {
    return this.service.getPayoutSummary(user.sub);
  }

  @Get('account')
  @ApiOperation({ summary: 'Payout account info' })
  getPayoutAccount(@CurrentUser() user: JwtPayload) {
    return this.service.getPayoutAccount(user.sub);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request withdrawal' })
  withdraw(@CurrentUser() user: JwtPayload) {
    return this.service.withdraw(user.sub);
  }
}

// ─── Reviews Controller ──────────────────────────────────

@ApiTags('store-reviews')
@Controller('store/reviews')
@ApiBearerAuth()
@Roles('store')
export class StoreReviewsController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews' })
  getReviews(@CurrentUser() user: JwtPayload) {
    return this.service.getReviews(user.sub);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Review summary' })
  getReviewSummary(@CurrentUser() user: JwtPayload) {
    return this.service.getReviewSummary(user.sub);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply to review' })
  replyToReview(@Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.service.replyToReview(id, dto);
  }
}

// ─── Team Controller ─────────────────────────────────────

@ApiTags('store-team')
@Controller('store/team')
@ApiBearerAuth()
@Roles('store')
export class StoreTeamController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'List team members' })
  getTeam(@CurrentUser() user: JwtPayload) {
    return this.service.getTeam(user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Team stats' })
  getTeamStats(@CurrentUser() user: JwtPayload) {
    return this.service.getTeamStats(user.sub);
  }

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite team member' })
  inviteTeamMember(@CurrentUser() user: JwtPayload, @Body() dto: InviteTeamMemberDto) {
    return this.service.inviteTeamMember(user.sub, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update team member status' })
  updateMemberStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTeamMemberStatusDto) {
    return this.service.updateTeamMemberStatus(user.sub, id, dto.status);
  }
}

// ─── Settings Controller ─────────────────────────────────

@ApiTags('store-settings')
@Controller('store/settings')
@ApiBearerAuth()
@Roles('store')
export class StoreSettingsController {
  constructor(private readonly service: StorePortalService) {}

  @Get()
  @ApiOperation({ summary: 'Get store settings' })
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.service.getSettings(user.sub);
  }

  @Put()
  @ApiOperation({ summary: 'Update store settings' })
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateStoreSettingsDto) {
    return this.service.updateSettings(user.sub, dto);
  }

  @Post('payout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit new payout account' })
  updatePayoutAccount(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePayoutAccountDto) {
    return this.service.updatePayoutAccount(user.sub, dto.accountNumber);
  }
}

// ─── Registration Controller ─────────────────────────────

@ApiTags('store-register')
@Controller('store')
export class StoreRegistrationController {
  constructor(private readonly service: StorePortalService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new store' })
  register(@Body() dto: StoreRegisterDto) {
    return this.service.register(dto);
  }
}

// ─── Invite Controller ───────────────────────────────────

@ApiTags('store-invite')
@Controller('store/invite')
export class StoreInviteController {
  constructor(private readonly service: StorePortalService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Get invite details' })
  getInviteDetails(@Param('token') token: string) {
    return this.service.getInviteDetails(token);
  }

  @Public()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept invite' })
  acceptInvite(@Param('token') token: string, @Body() dto: AcceptStoreInviteDto) {
    return this.service.acceptInvite(token, dto);
  }
}
