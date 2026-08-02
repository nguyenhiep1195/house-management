/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  let service: InvoicesService;
  const prisma = {
    invoice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    room: { findUnique: jest.fn(), findMany: jest.fn() },
    contract: { findFirst: jest.fn() },
    meterReading: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const settings = { resolve: jest.fn() };

  const setting = {
    id: 1,
    electricityUnitPrice: 3500,
    waterUnitPrice: 15000,
    internetFee: 100000,
    elevatorFeePerPerson: 30000,
    cleaningFeePerPerson: 20000,
    motorbikeFeePerExtra: 100000,
    freeMotorbikeCount: 2,
    otherFee: 50000,
    updatedAt: new Date(),
  };

  const room = {
    id: 1,
    name: 'P101',
    price: 3000000,
    status: 'OCCUPIED',
    occupantCount: 2,
    motorbikeCount: 3,
    internetEnabled: true,
    initialElectricityReading: 100,
    initialWaterReading: 10,
    electricityReading: 250,
    waterReading: 22,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    settings.resolve.mockResolvedValue(setting);
    prisma.contract.findFirst.mockResolvedValue(null);
    prisma.meterReading.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(InvoicesService);
  });

  it('rejects a duplicate invoice for the same room and month', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue({ id: 9 });
    await expect(
      service.create({ roomId: 1, month: 7, year: 2026 }),
    ).rejects.toThrow(ConflictException);
  });

  it('computes all amounts from settings and meter deltas', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null); // no previous invoice
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );

    await service.create({ roomId: 1, month: 7, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];

    expect(data.electricityPrev).toBe(100); // initial reading (no prior invoice)
    expect(data.electricityCurrent).toBe(250);
    // (250-100)*3500 = 525000
    expect(data.electricityCurrent - data.electricityPrev).toBe(150);
    expect(data.waterPrev).toBe(10);
    expect(data.waterCurrent).toBe(22);
    expect(data.internetFee).toBe(100000);
    expect(data.elevatorFee).toBe(60000); // 2 người * 30000
    expect(data.cleaningFee).toBe(40000); // 2 người * 20000
    expect(data.motorbikeFee).toBe(100000); // (3-2)*100000
    expect(data.otherFee).toBe(50000);
    // 3000000 + 525000 + 12*15000(=180000) + 100000 + 60000 + 40000 + 100000 + 50000
    expect(data.totalAmount).toBe(4055000);
  });

  it('uses the previous invoice readings as prev when one exists', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue({
      electricityCurrent: 200,
      waterCurrent: 18,
    });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 2, ...data }),
    );

    await service.create({ roomId: 1, month: 8, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];
    expect(data.electricityPrev).toBe(200);
    expect(data.waterPrev).toBe(18);
  });

  it('uses the governing contract initial readings when no invoice exists yet', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null); // no prior invoice in span
    prisma.contract.findFirst.mockResolvedValue({
      id: 1,
      startDate: new Date('2026-07-01'),
      initialElectricityReading: 500,
      initialWaterReading: 50,
    });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 560,
      waterReading: 58,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );

    await service.create({ roomId: 1, month: 7, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];
    expect(data.electricityPrev).toBe(500);
    expect(data.waterPrev).toBe(50);
  });

  it('scopes the previous-invoice lookup to the governing contract span', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.contract.findFirst.mockResolvedValue({
      id: 1,
      startDate: new Date('2026-08-01'),
      initialElectricityReading: 500,
      initialWaterReading: 50,
    });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 560,
      waterReading: 58,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );

    await service.create({ roomId: 1, month: 8, year: 2026 });
    const where = prisma.invoice.findFirst.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lt: 8 } }] },
      { OR: [{ year: { gt: 2026 } }, { year: 2026, month: { gte: 8 } }] },
    ]);
  });

  it('prefers a previous invoice over the contract initial when one exists in span', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.contract.findFirst.mockResolvedValue({
      id: 1,
      startDate: new Date('2026-07-01'),
      initialElectricityReading: 500,
      initialWaterReading: 50,
    });
    prisma.invoice.findFirst.mockResolvedValue({
      electricityCurrent: 540,
      waterCurrent: 55,
    });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 560,
      waterReading: 58,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );

    await service.create({ roomId: 1, month: 8, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];
    expect(data.electricityPrev).toBe(540);
    expect(data.waterPrev).toBe(55);
  });

  it('bills zero consumption when the room has no meter reading yet', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue(null);
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );

    await service.create({ roomId: 1, month: 7, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];

    expect(data.electricityCurrent).toBe(data.electricityPrev);
    expect(data.waterCurrent).toBe(data.waterPrev);
    // rent + fixed fees only: no electricity or water
    expect(data.totalAmount).toBe(
      3000000 + 100000 + 60000 + 40000 + 100000 + 50000,
    );
  });

  it('sources electricity/water current from the meter reading', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 400,
      waterReading: 40,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );
    await service.create({ roomId: 1, month: 7, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];
    expect(data.electricityCurrent).toBe(400);
    expect(data.waterCurrent).toBe(40);
  });

  it('generateForMonth creates invoices only for OCCUPIED rooms without one', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findMany.mockResolvedValue([{ roomId: 1 }]);
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique
      .mockResolvedValueOnce({ id: 5 }) // already has invoice -> skipped
      .mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    prisma.invoice.create.mockResolvedValue({ id: 6 });

    const result = await service.generateForMonth(7, 2026);
    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { status: 'OCCUPIED' },
    });
    expect(result).toEqual({
      created: 0,
      skipped: 1,
      skippedRooms: [{ roomId: 1, roomName: 'P101' }],
      missingReadings: [],
    });
  });

  it('generateForMonth increments created for an OCCUPIED room with no existing invoice', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findMany.mockResolvedValue([{ roomId: 1 }]);
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null); // no existing invoice
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 10, ...data }),
    );

    const result = await service.generateForMonth(7, 2026);
    expect(result).toEqual({
      created: 1,
      skipped: 0,
      skippedRooms: [],
      missingReadings: [],
    });
    expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('generateForMonth counts a concurrent P2002 from create as skipped, not fatal', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findMany.mockResolvedValue([{ roomId: 1 }]);
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null); // passes pre-check
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    const p2002 = Object.assign(new Error('Unique constraint'), {
      code: 'P2002',
    });
    prisma.invoice.create.mockRejectedValue(p2002); // race -> P2002 -> ConflictException

    const result = await service.generateForMonth(7, 2026);
    expect(result).toEqual({
      created: 0,
      skipped: 1,
      skippedRooms: [{ roomId: 1, roomName: 'P101' }],
      missingReadings: [],
    });
  });

  it('generateForMonth still bills rooms with missing readings, and reports them', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findMany.mockResolvedValue([]); // no reading for the period
    prisma.meterReading.findUnique.mockResolvedValue(null);
    prisma.invoice.create.mockResolvedValue({ id: 11 });

    const result = await service.generateForMonth(7, 2026);
    expect(result).toEqual({
      created: 1,
      skipped: 0,
      skippedRooms: [],
      missingReadings: [{ roomId: 1, roomName: 'P101' }],
    });
  });

  it('findAll flags invoices whose period has no meter reading', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: 1, roomId: 1, year: 2026, month: 7 },
      { id: 2, roomId: 2, year: 2026, month: 7 },
    ]);
    prisma.meterReading.findMany.mockResolvedValue([
      { roomId: 1, year: 2026, month: 7 },
    ]);

    const result = await service.findAll({ year: 2026, month: 7 });
    expect(result.map((i) => i.meterReadingMissing)).toEqual([false, true]);
  });

  it('marks an invoice as paid with a payment method', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 1, status: 'UNPAID' });
    prisma.invoice.update.mockResolvedValue({ id: 1, status: 'PAID' });
    await service.pay(1, { paymentMethod: 'CASH' });
    const args = prisma.invoice.update.mock.calls[0][0];
    expect(args.data.status).toBe('PAID');
    expect(args.data.paymentMethod).toBe('CASH');
    expect(args.data.paidAt).toBeInstanceOf(Date);
  });

  it('refuses to delete a PAID invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 1, status: 'PAID' });
    await expect(service.remove(1)).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException for a missing invoice on pay', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(service.pay(9, { paymentMethod: 'CASH' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when unpaying an already UNPAID invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 1, status: 'UNPAID' });
    await expect(service.unpay(1)).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when unpaying a missing invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(service.unpay(9)).rejects.toThrow(NotFoundException);
  });

  it('resyncFromPeriod is a no-op when the edited period has no invoice', async () => {
    // Only a LATER invoice exists. The prev chain runs through invoices, so a
    // reading in a period with no invoice cannot shift anything downstream.
    prisma.invoice.findMany.mockResolvedValue([
      { id: 6, roomId: 1, year: 2026, month: 8, status: 'UNPAID' },
    ]);
    await service.resyncFromPeriod(1, 2026, 7);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('resyncFromPeriod recomputes the edited invoice from snapshot prices', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: 5,
        roomId: 1,
        year: 2026,
        month: 7,
        status: 'UNPAID',
        roomPrice: 3000000,
        electricityPrev: 100,
        electricityCurrent: 100,
        electricityUnitPrice: 3500,
        waterPrev: 10,
        waterCurrent: 10,
        waterUnitPrice: 15000,
        internetFee: 100000,
        elevatorFee: 60000,
        cleaningFee: 40000,
        motorbikeFee: 100000,
        otherFee: 50000,
        totalAmount: 3350000,
      },
    ]);
    prisma.meterReading.findMany.mockResolvedValue([
      { year: 2026, month: 7, electricityReading: 250, waterReading: 22 },
    ]);
    prisma.invoice.update.mockResolvedValue({});

    await service.resyncFromPeriod(1, 2026, 7);

    const { data } = prisma.invoice.update.mock.calls[0][0];
    // elec (250-100)*3500=525000 ; water (22-10)*15000=180000
    expect(data.electricityCurrent).toBe(250);
    expect(data.waterCurrent).toBe(22);
    expect(data.electricityPrev).toBe(100);
    expect(data.totalAmount).toBe(
      3000000 + 525000 + 180000 + 100000 + 60000 + 40000 + 100000 + 50000,
    );
  });

  it('resyncFromPeriod cascades the new current into the next invoice prev', async () => {
    const base = {
      roomId: 1,
      status: 'UNPAID',
      roomPrice: 1000000,
      electricityUnitPrice: 1000,
      waterUnitPrice: 0,
      internetFee: 0,
      elevatorFee: 0,
      cleaningFee: 0,
      motorbikeFee: 0,
      otherFee: 0,
      waterPrev: 0,
      waterCurrent: 0,
    };
    prisma.invoice.findMany.mockResolvedValue([
      {
        ...base,
        id: 5,
        year: 2026,
        month: 7,
        electricityPrev: 100,
        electricityCurrent: 200,
        totalAmount: 1100000,
      },
      {
        ...base,
        id: 6,
        year: 2026,
        month: 8,
        electricityPrev: 200, // stale snapshot of month 7's old current
        electricityCurrent: 260,
        totalAmount: 1060000,
      },
    ]);
    prisma.meterReading.findMany.mockResolvedValue([
      { year: 2026, month: 7, electricityReading: 250, waterReading: 0 },
      { year: 2026, month: 8, electricityReading: 260, waterReading: 0 },
    ]);
    prisma.invoice.update.mockResolvedValue({});

    await service.resyncFromPeriod(1, 2026, 7);

    expect(prisma.invoice.update).toHaveBeenCalledTimes(2);
    const july = prisma.invoice.update.mock.calls[0][0].data;
    const august = prisma.invoice.update.mock.calls[1][0].data;
    expect(july.electricityCurrent).toBe(250);
    expect(july.totalAmount).toBe(1000000 + 150 * 1000);
    // August must restart from July's NEW current, not the stale 200.
    expect(august.electricityPrev).toBe(250);
    expect(august.totalAmount).toBe(1000000 + 10 * 1000);
  });

  it('resyncFromPeriod refuses when any invoice in the chain is PAID', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: 5, roomId: 1, year: 2026, month: 7, status: 'UNPAID' },
      { id: 6, roomId: 1, year: 2026, month: 8, status: 'PAID' },
    ]);
    await expect(service.resyncFromPeriod(1, 2026, 7)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  describe('refreshForMonth', () => {
    // Matches what computeInvoiceData produces for `room` + `setting` with
    // reading 250/22 and no previous invoice/contract.
    const freshInvoice = {
      id: 7,
      roomId: 1,
      month: 7,
      year: 2026,
      status: 'UNPAID',
      roomPrice: 3000000,
      electricityPrev: 100,
      electricityCurrent: 250,
      electricityUnitPrice: 3500,
      waterPrev: 10,
      waterCurrent: 22,
      waterUnitPrice: 15000,
      internetFee: 100000,
      elevatorFee: 60000,
      cleaningFee: 40000,
      motorbikeFee: 100000,
      otherFee: 50000,
      occupantCount: 2,
      motorbikeCount: 3,
      totalAmount: 4055000,
      room,
    };

    it('only targets UNPAID invoices of the requested period', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.refreshForMonth(7, 2026);
      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: { year: 2026, month: 7, status: 'UNPAID' },
        include: { room: true },
      });
    });

    it('updates an invoice whose snapshot diverged from current settings', async () => {
      // Invoice was created with an older, cheaper electricity price.
      prisma.invoice.findMany.mockResolvedValue([
        { ...freshInvoice, electricityUnitPrice: 3000, totalAmount: 3980000 },
      ]);
      prisma.meterReading.findMany.mockResolvedValue([{ roomId: 1 }]);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.meterReading.findUnique.mockResolvedValue({
        electricityReading: 250,
        waterReading: 22,
      });
      prisma.invoice.update.mockResolvedValue({});

      const result = await service.refreshForMonth(7, 2026);
      expect(result).toEqual({
        updated: 1,
        unchanged: 0,
        missingReadings: [],
      });
      const { data } = prisma.invoice.update.mock.calls[0][0];
      expect(data.electricityUnitPrice).toBe(3500);
      expect(data.totalAmount).toBe(4055000);
    });

    it('leaves an already up-to-date invoice untouched', async () => {
      prisma.invoice.findMany.mockResolvedValue([freshInvoice]);
      prisma.meterReading.findMany.mockResolvedValue([{ roomId: 1 }]);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.meterReading.findUnique.mockResolvedValue({
        electricityReading: 250,
        waterReading: 22,
      });

      const result = await service.refreshForMonth(7, 2026);
      expect(result).toEqual({
        updated: 0,
        unchanged: 1,
        missingReadings: [],
      });
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('rebuilds at zero consumption and reports the missing reading', async () => {
      prisma.invoice.findMany.mockResolvedValue([freshInvoice]);
      prisma.meterReading.findMany.mockResolvedValue([]);
      prisma.meterReading.findUnique.mockResolvedValue(null);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.update.mockResolvedValue({});

      const result = await service.refreshForMonth(7, 2026);
      expect(result).toEqual({
        updated: 1,
        unchanged: 0,
        missingReadings: [{ roomId: 1, roomName: 'P101' }],
      });
      const { data } = prisma.invoice.update.mock.calls[0][0];
      expect(data.electricityCurrent).toBe(100); // = prev
      expect(data.waterCurrent).toBe(10); // = prev
      expect(data.totalAmount).toBe(
        3000000 + 100000 + 60000 + 40000 + 100000 + 50000,
      );
    });
  });

  it('update recomputes total and rejects paid invoices', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({ id: 5, status: 'PAID' });
    await expect(service.update(5, { roomPrice: 1 })).rejects.toThrow(
      ConflictException,
    );

    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 6,
      status: 'UNPAID',
      roomPrice: 3000000,
      electricityPrev: 100,
      electricityCurrent: 250,
      electricityUnitPrice: 3500,
      waterPrev: 10,
      waterCurrent: 22,
      waterUnitPrice: 15000,
      internetFee: 100000,
      elevatorFee: 60000,
      cleaningFee: 40000,
      motorbikeFee: 100000,
      otherFee: 50000,
      occupantCount: 2,
      motorbikeCount: 3,
    });
    prisma.invoice.update.mockResolvedValue({});
    await service.update(6, { roomPrice: 3500000 });
    const { data } = prisma.invoice.update.mock.calls.at(-1)![0];
    expect(data.roomPrice).toBe(3500000);
    expect(data.totalAmount).toBe(
      3500000 + 525000 + 180000 + 100000 + 60000 + 40000 + 100000 + 50000,
    );
  });
});
