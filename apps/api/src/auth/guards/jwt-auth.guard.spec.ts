import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

function mockContext(headers: Record<string, string>) {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { context: context as never, request };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const jwtService = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const reflector = { getAllAndOverride: jest.fn() };

  const dbUser = {
    id: 1,
    email: 'a@a.com',
    name: 'A',
    phone: null,
    role: 'MANAGER',
    isActive: true,
    tokenVersion: 0,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    guard = moduleRef.get(JwtAuthGuard);
  });

  it('allows @Public routes without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = mockContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects requests without a bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = mockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when tokenVersion does not match the database', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({ ...dbUser, tokenVersion: 1 });
    const { context } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects inactive users', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({ ...dbUser, isActive: false });
    const { context } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when user no longer exists in the database', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    const { context } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches AuthUser to the request on success', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue(dbUser);
    const { context, request } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 1,
      email: 'a@a.com',
      name: 'A',
      phone: null,
      role: 'MANAGER',
    });
  });
});
