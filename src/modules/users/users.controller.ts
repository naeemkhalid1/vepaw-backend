import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
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

  @Get('me/notifications')
  @ApiOperation({ summary: 'Get notification preferences' })
  getNotifications(@CurrentUser() user: JwtPayload) {
    return this.usersService.getNotifications(user.sub);
  }

  @Patch('me/notifications')
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotifications(@CurrentUser() user: JwtPayload, @Body() dto: UpdateNotificationsDto) {
    return this.usersService.updateNotifications(user.sub, dto);
  }

  @Get('me/reminders')
  @ApiOperation({ summary: 'Most urgent upcoming vaccination within 30 days (home screen banner)' })
  getReminders(@CurrentUser() user: JwtPayload) {
    return this.usersService.getReminders(user.sub);
  }

  // ── Addresses ────────────────────────────────────────────────────────────────

  @Get('me/addresses')
  @ApiOperation({ summary: 'List saved delivery addresses' })
  getAddresses(@CurrentUser() user: JwtPayload) {
    return this.usersService.getAddresses(user.sub);
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Add a new delivery address' })
  addAddress(@CurrentUser() user: JwtPayload, @Body() dto: CreateAddressDto) {
    return this.usersService.addAddress(user.sub, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update a saved address — all fields optional' })
  updateAddress(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(user.sub, id, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved address' })
  deleteAddress(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usersService.deleteAddress(user.sub, id);
  }
}
