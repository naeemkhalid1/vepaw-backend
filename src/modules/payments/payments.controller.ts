import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JazzCashInitiateDto } from './dto/jazzcash-initiate.dto';
import { EasypaisaInitiateDto } from './dto/easypaisa-initiate.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('jazzcash/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate JazzCash payment — returns signed hosted checkout URL' })
  initiateJazzCash(@CurrentUser() user: JwtPayload, @Body() dto: JazzCashInitiateDto) {
    return this.paymentsService.initiateJazzCash(user.sub, dto);
  }

  @Post('easypaisa/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate EasyPaisa payment — returns signed hosted checkout URL' })
  initiateEasypaisa(@CurrentUser() user: JwtPayload, @Body() dto: EasypaisaInitiateDto) {
    return this.paymentsService.initiateEasypaisa(user.sub, dto);
  }

  @Post('jazzcash/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'JazzCash server-to-server webhook (no auth) — validates HMAC, updates appointment' })
  jazzCashCallback(@Body() body: Record<string, string>) {
    return this.paymentsService.handleJazzCashCallback(body);
  }
}
