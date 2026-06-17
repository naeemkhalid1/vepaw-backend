import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes, randomInt } from 'crypto';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { RefreshToken, RefreshTokenDocument } from '../../database/schemas/refresh-token.schema';
import { RedisService } from '../../common/redis/redis.service';
import { SmsService } from './sms.service';
import { JwtPayload, ServiceResponse, UserResponse } from '../../shared/types';
import { toUserResponse } from '../../shared/mappers/user.mapper';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

const OTP_TTL_SECONDS = 60;
const OTP_RATE_WINDOW_SECONDS = 600;
const MAX_OTP_ATTEMPTS = 3;
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  async sendOtp(dto: SendOtpDto): Promise<ServiceResponse<{ expiresIn: number }>> {
    const attemptsKey = `otp:attempts:${dto.phone}`;
    const attempts = await this.redisService.incr(attemptsKey);

    if (attempts === 1) {
      await this.redisService.expire(attemptsKey, OTP_RATE_WINDOW_SECONDS);
    }

    if (attempts > MAX_OTP_ATTEMPTS) {
      throw new HttpException(
        {
          message: 'Too many requests. Please wait before requesting again.',
          code: 'OTP_RATE_LIMITED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = randomInt(1000, 10000).toString();
    await this.redisService.set(`otp:${dto.phone}`, otp, OTP_TTL_SECONDS);
    await this.smsService.sendOtp(dto.phone, otp);

    return { data: { expiresIn: OTP_TTL_SECONDS }, message: 'OTP sent successfully' };
  }

  async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<ServiceResponse<{ accessToken: string; refreshToken: string; isNewUser: boolean; user: UserResponse }>> {
    const stored = await this.redisService.get(`otp:${dto.phone}`);

    if (!stored) {
      throw new BadRequestException({
        message: 'OTP has expired. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
    }

    if (stored !== dto.otp) {
      throw new BadRequestException({
        message: 'Incorrect OTP. Please try again.',
        code: 'OTP_INVALID',
      });
    }

    await this.redisService.del(`otp:${dto.phone}`);
    await this.redisService.del(`otp:attempts:${dto.phone}`);

    let isNewUser = false;
    let user = await this.userModel.findOne({ phone: dto.phone }).exec();

    if (!user) {
      isNewUser = true;
      user = await this.userModel.create({ phone: dto.phone });
    }

    const tokens = await this.issueTokens(user);

    return {
      data: { ...tokens, isNewUser, user: toUserResponse(user) },
      message: 'Login successful',
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<ServiceResponse<TokenPair>> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await stored.deleteOne();
      throw new UnauthorizedException({
        message: 'Session expired. Please log in again.',
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    const user = await this.userModel.findById(stored.userId).exec();
    if (!user) {
      await stored.deleteOne();
      throw new UnauthorizedException({
        message: 'Session expired. Please log in again.',
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    await stored.deleteOne();
    const tokens = await this.issueTokens(user);

    return { data: tokens, message: 'Token refreshed' };
  }

  async logout(userId: string, dto: LogoutDto): Promise<ServiceResponse<null>> {
    const tokenHash = this.hashToken(dto.refreshToken);
    await this.refreshTokenModel
      .deleteOne({ userId: new Types.ObjectId(userId), tokenHash })
      .exec();
    return { data: null, message: 'Logged out successfully' };
  }

  private async issueTokens(user: UserDocument): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      phone: user.phone,
      role: 'user',
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash: this.hashToken(rawRefreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

}
