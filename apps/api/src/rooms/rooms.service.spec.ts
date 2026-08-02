/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { SettingsService } from '../settings/settings.service';
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
    meterReading: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    meterReadingHistory: { create: jest.fn(), findMany: jest.fn() },
    invoice: { findUnique: jest.fn() },
    feeSetting: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const invoices = { resyncFromPeriod: jest.fn() };
  const settings = { getDefault: jest.fn() };

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
    settings.getDefault.mockResolvedValue({ id: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
        { provide: SettingsService, useValue: settings },
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
    meterReading: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    meterReadingHistory: { create: jest.fn() },
    invoice: { findUnique: jest.fn(), findFirst: jest.fn() },
    feeSetting: { findUnique: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops)
        ? Promise.all(ops as Promise<unknown>[])
        : (ops as any)(prisma),
    ),
  };
  const invoices = { resyncFromPeriod: jest.fn() };
  const settings = { getDefault: jest.fn() };

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
    // clearAllMocks does not drain mockResolvedValueOnce queues, and these two
    // are chained per test — an unconsumed entry would leak into the next one.
    prisma.meterReading.findFirst.mockReset();
    prisma.invoice.findFirst.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('rejects a reading lower than the previous period', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // prev-period lookup reads 250; next-period lookup finds nothing.
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 250, waterReading: 22 })
      .mockResolvedValueOnce(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 200, waterReading: 30 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a reading higher than the next recorded period', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 100, waterReading: 10 })
      .mockResolvedValueOnce({
        year: 2026,
        month: 8,
        electricityReading: 280,
        waterReading: 25,
      });
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a back-dated edit within bounds and cascades', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 100, waterReading: 10 })
      .mockResolvedValueOnce({
        year: 2026,
        month: 8,
        electricityReading: 280,
        waterReading: 25,
      });
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.upsert.mockResolvedValue({});
    prisma.meterReadingHistory.create.mockResolvedValue({});

    await service.bulkUpdateReadings({
      year: 2026,
      month: 7,
      items: [{ roomId: 1, electricityReading: 260, waterReading: 20 }],
    });

    expect(prisma.meterReading.upsert).toHaveBeenCalled();
    expect(invoices.resyncFromPeriod).toHaveBeenCalledWith(1, 2026, 7);
  });

  it('leaves the room mirror alone for a back-dated edit', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 100, waterReading: 10 })
      .mockResolvedValueOnce({
        year: 2026,
        month: 8,
        electricityReading: 280,
        waterReading: 25,
      });
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.upsert.mockResolvedValue({});
    prisma.meterReadingHistory.create.mockResolvedValue({});

    await service.bulkUpdateReadings({
      year: 2026,
      month: 7,
      items: [{ roomId: 1, electricityReading: 260, waterReading: 20 }],
    });

    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it('upserts the reading, writes history, and mirrors the newest period', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // prev-period: none; next-period: none -> this IS the newest period.
    prisma.meterReading.findFirst.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
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

  it('rejects with ConflictException and performs NO writes when this period is PAID', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue({ year: 2026, month: 7 });

    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.meterReading.upsert).not.toHaveBeenCalled();
    expect(prisma.meterReadingHistory.create).not.toHaveBeenCalled();
    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it('rejects with ConflictException when a LATER period is PAID', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null);
    // The settled lookup covers this period and everything after it.
    prisma.invoice.findFirst.mockResolvedValue({ year: 2026, month: 8 });

    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
      }),
    ).rejects.toThrow(/8\/2026/);

    expect(prisma.meterReading.upsert).not.toHaveBeenCalled();
  });
});
