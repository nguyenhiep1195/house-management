import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from './rooms.service';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('RoomsService', () => {
  let service: RoomsService;
  const prisma = {
    room: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const room = {
    id: 1,
    name: 'P101',
    price: 3000000,
    status: 'AVAILABLE',
    occupantCount: 2,
    motorbikeCount: 1,
    internetEnabled: true,
    initialElectricityReading: 100,
    initialWaterReading: 10,
    electricityReading: 100,
    waterReading: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('rejects a duplicate room name', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    await expect(
      service.create({
        name: 'P101',
        price: 3000000,
        initialElectricityReading: 0,
        initialWaterReading: 0,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates a room with readings initialized from initial readings', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    prisma.room.create.mockResolvedValue(room);
    await service.create({
      name: 'P101',
      price: 3000000,
      initialElectricityReading: 100,
      initialWaterReading: 10,
    });
    const args = prisma.room.create.mock.calls[0][0];
    expect(args.data.electricityReading).toBe(100);
    expect(args.data.waterReading).toBe(10);
  });

  it('throws NotFoundException for a missing room on detail', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('rejects bulk readings lower than the current reading', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    await expect(
      service.bulkUpdateReadings({
        items: [{ roomId: 1, electricityReading: 50, waterReading: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects bulk update containing an unknown room', async () => {
    prisma.room.findMany.mockResolvedValue([]);
    await expect(
      service.bulkUpdateReadings({
        items: [{ roomId: 99, electricityReading: 1, waterReading: 1 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates all readings in one transaction', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.$transaction.mockResolvedValue([]);
    await service.bulkUpdateReadings({
      items: [{ roomId: 1, electricityReading: 150, waterReading: 15 }],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
