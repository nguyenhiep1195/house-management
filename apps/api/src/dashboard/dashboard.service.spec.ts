import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const prisma = {
    room: { groupBy: jest.fn(), aggregate: jest.fn() },
    invoice: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  it('aggregates rooms, occupants, vehicles, period utilities and invoices', async () => {
    prisma.room.groupBy.mockResolvedValue([
      { status: 'AVAILABLE', _count: { _all: 3 } },
      { status: 'OCCUPIED', _count: { _all: 5 } },
      { status: 'MAINTENANCE', _count: { _all: 1 } },
    ]);
    prisma.room.aggregate.mockResolvedValue({
      _count: { _all: 9 },
      _sum: { occupantCount: 20, motorbikeCount: 12 },
    });
    prisma.invoice.findMany.mockResolvedValue([
      // selected period (2026-07)
      {
        year: 2026,
        month: 7,
        status: 'PAID',
        totalAmount: 1_000_000,
        electricityPrev: 100,
        electricityCurrent: 150,
        waterPrev: 10,
        waterCurrent: 15,
      },
      {
        year: 2026,
        month: 7,
        status: 'UNPAID',
        totalAmount: 500_000,
        electricityPrev: 200,
        electricityCurrent: 220,
        waterPrev: 20,
        waterCurrent: 23,
      },
      // an earlier period (2026-06) — counts toward trend only
      {
        year: 2026,
        month: 6,
        status: 'PAID',
        totalAmount: 800_000,
        electricityPrev: 90,
        electricityCurrent: 120,
        waterPrev: 8,
        waterCurrent: 12,
      },
    ]);

    const stats = await service.getStats(2026, 7);

    expect(stats.rooms).toEqual({
      total: 9,
      available: 3,
      occupied: 5,
      maintenance: 1,
    });
    expect(stats.occupants).toBe(20);
    expect(stats.motorbikes).toBe(12);

    // Utilities for selected period only: electricity (50+20), water (5+3).
    expect(stats.utilities).toEqual({
      electricityConsumption: 70,
      waterConsumption: 8,
    });

    // Invoices for selected period: 1 paid, 1 unpaid, revenue = PAID only.
    expect(stats.invoices).toEqual({
      paid: 1,
      unpaid: 1,
      total: 2,
      revenue: 1_000_000,
    });
  });

  it('returns a 6-point trend oldest→newest ending at the selected period', async () => {
    prisma.room.groupBy.mockResolvedValue([]);
    prisma.room.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { occupantCount: null, motorbikeCount: null },
    });
    prisma.invoice.findMany.mockResolvedValue([
      {
        year: 2025,
        month: 12,
        status: 'PAID',
        totalAmount: 300_000,
        electricityPrev: 0,
        electricityCurrent: 10,
        waterPrev: 0,
        waterCurrent: 2,
      },
    ]);

    const stats = await service.getStats(2026, 3);

    expect(stats.trend).toHaveLength(6);
    expect(stats.trend[0]).toMatchObject({ year: 2025, month: 10 });
    expect(stats.trend[5]).toMatchObject({ year: 2026, month: 3 });
    // The 2025-12 point (index 2) carries its consumption/revenue.
    expect(stats.trend[2]).toEqual({
      year: 2025,
      month: 12,
      electricityConsumption: 10,
      waterConsumption: 2,
      revenue: 300_000,
    });
    // Missing periods are zero-filled.
    expect(stats.trend[5]).toEqual({
      year: 2026,
      month: 3,
      electricityConsumption: 0,
      waterConsumption: 0,
      revenue: 0,
    });
    // room aggregate nulls fall back to 0.
    expect(stats.occupants).toBe(0);
    expect(stats.motorbikes).toBe(0);

    // The OR query covers exactly the 6 trend periods.
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { year: 2025, month: 10 },
            { year: 2025, month: 11 },
            { year: 2025, month: 12 },
            { year: 2026, month: 1 },
            { year: 2026, month: 2 },
            { year: 2026, month: 3 },
          ],
        },
      }),
    );
  });
});
