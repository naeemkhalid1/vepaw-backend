import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StoreService } from './store.service';
import { ListProductsDto } from './dto/list-products.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';
import { UpdateSubscriptionDto } from '../subscriptions/dto/update-subscription.dto';

@ApiTags('store')
@ApiBearerAuth()
@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('products')
  @ApiOperation({ summary: 'List products with optional filters' })
  listProducts(@Query() dto: ListProductsDto) {
    return this.storeService.listProducts(dto);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get a single product' })
  getProduct(@Param('id') id: string) {
    return this.storeService.getProduct(id);
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place an order' })
  placeOrder(@CurrentUser() user: JwtPayload, @Body() dto: PlaceOrderDto) {
    return this.storeService.placeOrder(user.sub, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List my orders' })
  listOrders(@CurrentUser() user: JwtPayload, @Query() dto: ListOrdersDto) {
    return this.storeService.listOrders(user.sub, dto);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order detail' })
  getOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.storeService.getOrder(user.sub, id);
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Update order status (store/admin)' })
  updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.storeService.updateOrderStatus(id, dto);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List my active subscriptions' })
  listSubscriptions(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.storeService.listSubscriptions(user.sub, page, limit);
  }

  @Get('subscriptions/:id')
  @ApiOperation({ summary: 'Get a single subscription' })
  getSubscription(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.storeService.getSubscription(user.sub, id);
  }

  @Patch('subscriptions/:id')
  @ApiOperation({ summary: 'Update or cancel a subscription' })
  updateSubscription(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.storeService.updateSubscription(user.sub, id, dto);
  }
}
