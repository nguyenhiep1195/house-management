import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const manager = {
    id: 2,
    email: 'm@house.local',
    name: 'Manager',
    phone: null,
    role: 'MANAGER',
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('creates a manager with a hashed password and MANAGER role forced', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(manager);
    await service.create({
      email: 'm@house.local',
      password: 'Manager@123',
      name: 'Manager',
    });
    const args = prisma.user.create.mock.calls[0]?.[0] as unknown as {
      data: { role: string; password: string };
      select: unknown;
    };
    expect(args.data.role).toBe('MANAGER');
    expect(args.data.password).not.toBe('Manager@123');
    expect(args.data.password).toMatch(/^\$2[aby]\$/);
    expect(args.select).toBeDefined();
  });

  it('rejects a duplicate email with ConflictException', async () => {
    prisma.user.findUnique.mockResolvedValue(manager);
    await expect(
      service.create({
        email: 'm@house.local',
        password: 'Manager@123',
        name: 'Manager',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when prisma.create rejects with P2002 (concurrent duplicate)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create({
        email: 'm@house.local',
        password: 'Manager@123',
        name: 'Manager',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('lists only MANAGER accounts', async () => {
    prisma.user.findMany.mockResolvedValue([manager]);
    await service.findAll();
    const findManyArgs = prisma.user.findMany.mock.calls[0]?.[0] as unknown as {
      where: { role: string };
    };
    expect(findManyArgs.where).toEqual({
      role: 'MANAGER',
    });
  });

  it('refuses to update a non-MANAGER account', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...manager, role: 'ADMIN' });
    await expect(service.update(2, { name: 'X' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.update(99, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('bumps tokenVersion when the password is updated', async () => {
    prisma.user.findUnique.mockResolvedValue(manager);
    prisma.user.update.mockResolvedValue(manager);
    await service.update(2, { password: 'NewPass@123' });
    const args = prisma.user.update.mock.calls[0]?.[0] as unknown as {
      data: { tokenVersion: { increment: number }; password: string };
    };
    expect(args.data.tokenVersion).toEqual({ increment: 1 });
    expect(args.data.password).toMatch(/^\$2[aby]\$/);
  });

  it('refuses to delete a non-MANAGER account', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...manager, role: 'ADMIN' });
    await expect(service.remove(2)).rejects.toThrow(ForbiddenException);
  });

  it('deletes a manager', async () => {
    prisma.user.findUnique.mockResolvedValue(manager);
    prisma.user.delete.mockResolvedValue(manager);
    await expect(service.remove(2)).resolves.toHaveProperty('message');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});
