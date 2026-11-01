import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  UsePipes,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  RegisterRequestSchema,
  RegisterRequest,
  LoginRequestSchema,
  LoginRequest,
  AuthUser,
} from '@seethapaati/contracts';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterRequestSchema))
  async register(
    @Body() dto: RegisterRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.enforceRateLimit(req, 'register');
    const result = await this.authService.register(dto);
    this.setAuthCookie(res, result.accessToken, result.expiresIn);
    const session = { user: result.user, expiresIn: result.expiresIn };
    return {
      success: true,
      data: session,
    };
  }

  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  async login(
    @Body() dto: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.enforceRateLimit(req, 'login');
    const result = await this.authService.login(dto);
    this.setAuthCookie(res, result.accessToken, result.expiresIn);
    const { accessToken: _accessToken, ...session } = result;
    return {
      success: true,
      data: session,
    };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const fullUser = await this.authService.getCurrentUser(user.id);
    return {
      success: true,
      data: fullUser,
    };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
      sameSite: 'lax',
      path: '/',
    });
    return {
      success: true,
      data: { message: 'Logged out successfully' },
    };
  }

  private async enforceRateLimit(req: Request, action: 'login' | 'register') {
    const windowSeconds = this.config.get<number>('AUTH_RATE_LIMIT_WINDOW_SECONDS', 60);
    const maxAttempts = this.config.get<number>('AUTH_RATE_LIMIT_MAX_ATTEMPTS', 10);
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:auth:${action}:${ip}`;
    const count = await this.redis.incr(key, windowSeconds);
    if (count > maxAttempts) {
      throw new HttpException({
        error: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private setAuthCookie(res: Response, token: string, maxAgeSeconds: number) {
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSeconds * 1000,
      path: '/',
    });
  }
}
