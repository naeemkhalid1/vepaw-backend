import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { VerifySetPasswordTokenDto } from './dto/verify-set-password-token.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ConfirmPinResetDto } from './dto/confirm-pin-reset.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP via SMS (max 3 per 10 min)' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify OTP — returns tokens + user. isNewUser=true means onboarding required',
  })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange refresh token for new token pair' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout — invalidates the refresh token server-side',
  })
  logout(@CurrentUser() user: JwtPayload, @Body() dto: LogoutDto) {
    return this.authService.logout(user.sub, dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Web portal login — email/phone + password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset link' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('set-password/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify set-password token — returns user info' })
  verifySetPasswordToken(@Body() dto: VerifySetPasswordTokenDto) {
    return this.authService.verifySetPasswordToken(dto);
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set password for approved vet/store account' })
  setPassword(@Body() dto: SetPasswordDto) {
    return this.authService.setPassword(dto);
  }

  @Post('pin/reset')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('user')
  @ApiOperation({
    summary:
      "Forgot PIN — send a 6-digit code to the caller's own registered phone",
  })
  requestPinReset(@CurrentUser() user: JwtPayload) {
    return this.authService.requestPinReset(user.sub);
  }

  @Post('pin/reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('user')
  @ApiOperation({
    summary:
      'Forgot PIN — verify the code. Identity check only, does not touch any PIN (device-only storage)',
  })
  confirmPinReset(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmPinResetDto,
  ) {
    return this.authService.confirmPinReset(user.sub, dto);
  }
}
