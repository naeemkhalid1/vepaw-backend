import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get authenticated user profile' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile — all fields optional' })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Patch('fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or rotate device FCM token' })
  updateFcmToken(@CurrentUser() user: JwtPayload, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.updateFcmToken(user.sub, dto);
  }

  @Patch('me/privacy')
  @ApiOperation({ summary: 'Update privacy settings — all fields optional' })
  updatePrivacy(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePrivacyDto) {
    return this.usersService.updatePrivacy(user.sub, dto);
  }

  @Get('me/reminders')
  @ApiOperation({ summary: 'Most urgent upcoming vaccination within 30 days (home screen banner)' })
  getReminders(@CurrentUser() user: JwtPayload) {
    return this.usersService.getReminders(user.sub);
  }
}
