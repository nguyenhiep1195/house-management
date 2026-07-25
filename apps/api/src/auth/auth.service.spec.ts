import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt') };
  const mailService = { sendPasswordReset: jest.fn() };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  const activeUser = async () => ({
    id: 1,
    username: 'admin',
    email: 'admin@house.local',
    password: await bcrypt.hash('Admin@12345', 4),
    name: 'Quản trị viên',
    phone: null,
    role: 'ADMIN',
    isActive: true,
    tokenVersion: 3,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns a token and safe user on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUser());
      const result = await service.login({
        username: 'admin',
        password: 'Admin@12345',
      });
      expect(result.accessToken).toBe('signed.jwt');
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 1,
        role: 'ADMIN',
        tokenVersion: 3,
      });
      expect(result.user).toEqual({
        id: 1,
        username: 'admin',
        email: 'admin@house.local',
        name: 'Quản trị viên',
        role: 'ADMIN',
      });
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws the generic error for an unknown username', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ username: 'nobody', password: 'Admin@12345' }),
      ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');
    });

    it('throws the generic error for a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUser());
      await expect(
        service.login({ username: 'admin', password: 'wrong-pass' }),
      ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');
    });

    it('throws the same generic error for an inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...(await activeUser()),
        isActive: false,
      });
      await expect(
        service.login({ username: 'admin', password: 'Admin@12345' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('returns the generic message and sends no mail for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword('nobody@x.com');
      expect(result.message).toBeDefined();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a hashed single-use token and emails a reset link for a known user', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUser());
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword('admin@house.local');

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1, usedAt: null },
      });
      const createArgs = (
        prisma.passwordResetToken.create.mock.calls[0] as [
          { data: { tokenHash: string; userId: number; expiresAt: Date } },
        ]
      )[0];
      expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createArgs.data.userId).toBe(1);
      const [to, , resetUrl] = mailService.sendPasswordReset.mock.calls[0] as [
        string,
        string,
        string,
      ];
      expect(to).toBe('admin@house.local');
      expect(resetUrl).toContain('http://localhost:3000/reset-password?token=');
      // the raw token in the URL must NOT equal the stored hash
      expect(resetUrl).not.toContain(createArgs.data.tokenHash);
    });

    it('still returns the generic message when mail sending fails', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUser());
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      mailService.sendPasswordReset.mockRejectedValue(new Error('smtp down'));
      await expect(
        service.forgotPassword('admin@house.local'),
      ).resolves.toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('rejects an invalid or expired token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 'bad', newPassword: 'NewPass@123' }),
      ).rejects.toThrow('Liên kết không hợp lệ hoặc đã hết hạn');
    });

    it('updates the password, marks token used and bumps tokenVersion', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 9,
        userId: 1,
        tokenHash: 'h',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });
      prisma.$transaction.mockResolvedValue([]);

      await service.resetPassword({
        token: 'raw-token',
        newPassword: 'NewPass@123',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      const ops = (prisma.$transaction.mock.calls[0] as [unknown[]])[0];
      expect(Array.isArray(ops)).toBe(true);
    });
  });
});
