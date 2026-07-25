/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { RoomsService } from './rooms.service';

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
    meterReading: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    meterReadingHistory: { create: jest.fn(), findMany: jest.fn() },
    invoice: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const invoices = { syncMeterReading: jest.fn() };

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
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
      ],
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

  it('getReadingHistory returns history newest first', async () => {
    prisma.meterReadingHistory.findMany.mockResolvedValue([{ id: 1 }]);
    const rows = await service.getReadingHistory(1);
    expect(prisma.meterReadingHistory.findMany).toHaveBeenCalledWith({
      where: { roomId: 1 },
      orderBy: { changedAt: 'desc' },
    });
    expect(rows).toHaveLength(1);
  });
});

describe('RoomsService.bulkUpdateReadings', () => {
  let service: RoomsService;
  const prisma = {
    room: { findMany: jest.fn(), update: jest.fn() },
    meterReading: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    meterReadingHistory: { create: jest.fn() },
    invoice: { findUnique: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : (ops as any)(prisma),
    ),
  };
  const invoices = { syncMeterReading: jest.fn() };

  const room = {
    id: 1,
    name: 'P101',
    electricityReading: 250,
    waterReading: 22,
    initialElectricityReading: 100,
    initialWaterReading: 10,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('rejects a reading lower than the previous month', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // findFirst is called twice per item: first the newer-month check, then the
    // previous-month lookup. No newer month -> latest ok; prev month reads 250.
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ electricityReading: 250, waterReading: 22 });
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 200, waterReading: 30 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects editing a month that is not the latest recorded month', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // a NEWER month than the target already exists
    prisma.meterReading.findFirst.mockResolvedValue({ year: 2026, month: 8 });
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts the reading, writes history, and mirrors to the room', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null); // target is the latest
    prisma.meterReading.upsert.mockResolvedValue({});
    prisma.meterReadingHistory.create.mockResolvedValue({});
    prisma.room.update.mockResolvedValue({});

    await service.bulkUpdateReadings({
      year: 2026,
      month: 7,
      items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
    });

    expect(prisma.meterReading.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId_year_month: { roomId: 1, year: 2026, month: 7 } },
      }),
    );
    expect(prisma.meterReadingHistory.create).toHaveBeenCalled();
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { electricityReading: 300, waterReading: 30 },
      }),
    );
  });
});
