import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Role } from '../generated/enums';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './types/jwt-payload';

export const SALT_ROUNDS = 12;

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng';
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_MESSAGE =
  'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.';

export interface LoginResult {
  accessToken: string;
  user: {
    id: number;
    username: string;
    email: string | null;
    name: string;
    role: Role;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // accounts without an email have no reset channel — treat as unknown
    if (user && user.isActive && user.email) {
      const recipientEmail = user.email;
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      const webUrl = this.configService.getOrThrow<string>('WEB_URL');
      const resetUrl = `${webUrl}/reset-password?token=${rawToken}`;
      try {
        await this.mailService.sendPasswordReset(
          recipientEmail,
          user.name,
          resetUrl,
        );
      } catch (err) {
        // never leak delivery failures to the caller (enumeration/DoS surface)
        this.logger.error(`Failed to send reset email to user ${user.id}`, err);
      }
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!resetToken) {
      throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          password: newPasswordHash,
          tokenVersion: { increment: 1 },
        },
      }),
    ]);
    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
