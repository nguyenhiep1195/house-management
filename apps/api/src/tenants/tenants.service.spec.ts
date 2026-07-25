import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('TenantsService', () => {
  let service: TenantsService;
  const prisma = {
    tenant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    room: { findUnique: jest.fn() },
  };

  const tenant = {
    id: 1,
    fullName: 'Nguyễn Văn A',
    idCardNumber: '012345678901',
    dateOfBirth: new Date('1998-01-15'),
    hometown: 'Hà Nội',
    roomId: null,
    room: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TenantsService);
  });

  it('lists tenants including their room', async () => {
    prisma.tenant.findMany.mockResolvedValue([tenant]);
    await service.findAll(undefined);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      include: { room: { select: { id: true, name: true } } },
    });
  });

  it('filters tenants by roomId', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    await service.findAll(3);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 3 } }),
    );
  });

  it('rejects a duplicate id card number', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    await expect(
      service.create({
        fullName: 'B',
        idCardNumber: '012345678901',
        dateOfBirth: '1998-01-15',
        hometown: 'Hà Nội',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects assignment to a non-existent room', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        fullName: 'B',
        idCardNumber: '999',
        dateOfBirth: '1998-01-15',
        hometown: 'Hà Nội',
        roomId: 99,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a tenant with parsed dateOfBirth', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue(tenant);
    await service.create({
      fullName: 'Nguyễn Văn A',
      idCardNumber: '012345678901',
      dateOfBirth: '1998-01-15',
      hometown: 'Hà Nội',
    });
    const args = prisma.tenant.create.mock.calls[0][0];
    expect(args.data.dateOfBirth).toBeInstanceOf(Date);
  });

  it('throws NotFoundException when updating a missing tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.update(99, { fullName: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes a tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.tenant.delete.mockResolvedValue(tenant);
    await expect(service.remove(1)).resolves.toHaveProperty('message');
  });
});
