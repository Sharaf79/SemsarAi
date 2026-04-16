import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto, VerifyOtpDto, UpdateProfileDto } from './dto';
import { JwtAuthGuard, type JwtPayload } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // ─── POST /auth/send-otp ──────────────────────────────────────

  /**
   * Send a 6-digit OTP to the provided phone number.
   * Rate limited to 3 requests per phone per 10 minutes.
   */
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    this.logger.debug(`POST /auth/send-otp — ${dto.phone}`);
    return this.authService.sendOtp(dto.phone);
  }

  // ─── POST /auth/verify-otp ────────────────────────────────────

  /**
   * Verify OTP and return a JWT token.
   * Creates the user account on first login.
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    this.logger.debug(`POST /auth/verify-otp — ${dto.phone}`);
    return this.authService.verifyOtp(dto.phone, dto.code);
  }

  // ─── PATCH /auth/profile ──────────────────────────────────────

  /**
   * Set or update authenticated user's name and email.
   * Typically called after first OTP verification.
   */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    this.logger.debug(`PATCH /auth/profile — user=${user.sub}`);
    return this.authService.updateProfile(user.sub, dto.name, dto.email, dto.dateOfBirth, dto.sexType, dto.notes);
  }

  // ─── GET /auth/profile ────────────────────────────────────────────

  /**
   * Returns the current authenticated user's profile.
   */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`GET /auth/profile — user=${user.sub}`);
    return this.authService.getProfile(user.sub);
  }
}
