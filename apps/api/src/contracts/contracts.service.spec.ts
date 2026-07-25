/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  let service: ContractsService;
  const tx = {
    contract: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    room: { update: jest.fn() },
  };
  const prisma = {
    contract: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    room: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const room = { id: 1, name: 'P101', price: 3000000, status: 'AVAILABLE' };
  const contract = {
    id: 1,
    roomId: 1,
    price: 3200000,
    deposit: 3000000,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-07-01'),
    status: 'ACTIVE',
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ContractsService);
  });

  it('rejects a contract for a non-existent room', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        roomId: 99,
        price: 1,
        initialElectricityReading: 0,
        initialWaterReading: 0,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects endDate before startDate', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    await expect(
      service.create({
        roomId: 1,
        price: 1,
        initialElectricityReading: 0,
        initialWaterReading: 0,
        startDate: '2027-07-01',
        endDate: '2026-07-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a second ACTIVE contract on the same room', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.contract.findFirst.mockResolvedValue(contract);
    await expect(
      service.create({
        roomId: 1,
        price: 1,
        initialElectricityReading: 0,
        initialWaterReading: 0,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates an ACTIVE contract and syncs room price + status', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.contract.findFirst.mockResolvedValue(null);
    tx.contract.create.mockResolvedValue(contract);
    await service.create({
      roomId: 1,
      price: 3200000,
      deposit: 3000000,
      initialElectricityReading: 500,
      initialWaterReading: 50,
      startDate: '2026-07-01',
      endDate: '2027-07-01',
    });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'OCCUPIED',
        price: 3200000,
        electricityReading: 500,
        waterReading: 50,
      },
    });
  });

  it('stores contract initial readings and seeds room current readings', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.contract.findFirst.mockResolvedValue(null);
    tx.contract.create.mockResolvedValue(contract);
    await service.create({
      roomId: 1,
      price: 3200000,
      deposit: 3000000,
      initialElectricityReading: 500,
      initialWaterReading: 50,
      startDate: '2026-07-01',
      endDate: '2027-07-01',
    });
    const createArgs = tx.contract.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.initialElectricityReading).toBe(500);
    expect(createArgs.data.initialWaterReading).toBe(50);
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'OCCUPIED',
        price: 3200000,
        electricityReading: 500,
        waterReading: 50,
      },
    });
  });

  it('releases the room when the last ACTIVE contract is terminated', async () => {
    prisma.contract.findUnique.mockResolvedValue(contract);
    tx.contract.update.mockResolvedValue({
      ...contract,
      status: 'TERMINATED',
    });
    tx.contract.findFirst.mockResolvedValue(null); // no other ACTIVE
    await service.update(1, { status: 'TERMINATED' });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'AVAILABLE' },
    });
  });

  it('deletes a contract', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      ...contract,
      status: 'EXPIRED',
    });
    prisma.contract.delete.mockResolvedValue(contract);
    await expect(service.remove(1)).resolves.toHaveProperty('message');
  });
});
