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
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { RefreshToken, RefreshTokenDocument } from '../../database/schemas/refresh-token.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { PasswordToken, PasswordTokenDocument } from '../../database/schemas/password-token.schema';
import { RedisService } from '../../common/redis/redis.service';
import { SmsService } from './sms.service';
import { JwtPayload, ServiceResponse, UserResponse } from '../../shared/types';
import { toUserResponse } from '../../shared/mappers/user.mapper';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { VerifySetPasswordTokenDto } from './dto/verify-set-password-token.dto';
import { SetPasswordDto } from './dto/set-password.dto';

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
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
    @InjectModel(PasswordToken.name) private readonly passwordTokenModel: Model<PasswordTokenDocument>,
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

    const otp = this.smsService.generateOtp();
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

  async login(dto: LoginDto): Promise<ServiceResponse<{ token: string; role: string; redirectTo: string; name: string }>> {
    const vet = await this.vetModel
      .findOne({ $or: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }] })
      .select('+password')
      .exec();

    if (vet && vet.password) {
      const valid = await bcrypt.compare(dto.password, vet.password);
      if (!valid) {
        throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }
      const role = 'vet_admin';
      const payload: JwtPayload = { sub: vet._id.toString(), phone: vet.phone, role: 'vet' };
      const token = this.jwtService.sign(payload);
      return { data: { token, role, redirectTo: '/vet/schedule', name: vet.name }, message: 'Login successful' };
    }

    const store = await this.storeModel
      .findOne({ $or: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }] })
      .exec();

    if (store && store.password) {
      const valid = await bcrypt.compare(dto.password, store.password);
      if (!valid) {
        throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }
      const role = 'store_owner';
      const payload: JwtPayload = { sub: store._id.toString(), phone: store.phone, role: 'store' };
      const token = this.jwtService.sign(payload);
      return { data: { token, role, redirectTo: '/store/orders', name: store.ownerName }, message: 'Login successful' };
    }

    throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<ServiceResponse<null>> {
    this.logger.log(`Password reset requested for ${dto.emailOrPhone}`);
    return { data: null, message: 'If that account exists, a reset link has been sent' };
  }

  async adminLogin(dto: AdminLoginDto): Promise<ServiceResponse<{ token: string; role: string; redirectTo: string; name: string }>> {
    const admin = await this.userModel
      .findOne({ email: dto.email, role: 'admin' })
      .select('+password')
      .exec();

    if (!admin || !admin.password) {
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(dto.password, admin.password);
    if (!valid) {
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const payload: JwtPayload = { sub: admin._id.toString(), phone: admin.phone, role: 'admin' };
    const token = this.jwtService.sign(payload);
    return { data: { token, role: 'platform_admin', redirectTo: '/admin', name: admin.name }, message: 'Login successful' };
  }

  async generateSetPasswordToken(entityType: 'vet' | 'store', entityId: string, name: string, email: string, role: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    await this.passwordTokenModel.create({ token, email, name, entityType, entityId, role, expiresAt });

    const baseUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const link = `${baseUrl}/auth/set-password?token=${token}`;
    this.logger.log(`Set-password link for ${email}: ${link}`);

    return token;
  }

  async verifySetPasswordToken(dto: VerifySetPasswordTokenDto): Promise<ServiceResponse<{ name: string; email: string; role: string }>> {
    const record = await this.passwordTokenModel.findOne({ token: dto.token, used: false }).lean().exec();

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException({ message: 'Token is invalid or expired', code: 'TOKEN_INVALID' });
    }

    return {
      data: { name: record.name, email: record.email, role: record.role },
      message: 'Token verified',
    };
  }

  async setPassword(dto: SetPasswordDto): Promise<ServiceResponse<{ success: boolean; redirectTo: string }>> {
    const record = await this.passwordTokenModel.findOne({ token: dto.token, used: false }).exec();

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException({ message: 'Token is invalid or expired', code: 'TOKEN_INVALID' });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    if (record.entityType === 'vet') {
      await this.vetModel.findByIdAndUpdate(record.entityId, { password: hashedPassword }).exec();
    } else {
      await this.storeModel.findByIdAndUpdate(record.entityId, { password: hashedPassword }).exec();
    }

    record.used = true;
    await record.save();

    const redirectTo = record.entityType === 'vet' ? '/auth/vet/login' : '/auth/store/login';
    return { data: { success: true, redirectTo }, message: 'Password set successfully' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
