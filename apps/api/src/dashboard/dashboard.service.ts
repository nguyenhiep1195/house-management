import { Injectable } from '@nestjs/common';
import { InvoiceStatus, RoomStatus } from '../generated/enums';
import { PrismaService } from '../prisma/prisma.service';

const TREND_MONTHS = 6;

interface Period {
  year: number;
  month: number;
}

interface TrendPoint extends Period {
  electricityConsumption: number;
  waterConsumption: number;
  revenue: number;
}

export interface DashboardStats {
  period: Period;
  rooms: {
    total: number;
    available: number;
    occupied: number;
    maintenance: number;
  };
  occupants: number;
  motorbikes: number;
  utilities: { electricityConsumption: number; waterConsumption: number };
  invoices: { paid: number; unpaid: number; total: number; revenue: number };
  trend: TrendPoint[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(year: number, month: number): Promise<DashboardStats> {
    const periods = buildPeriods(year, month, TREND_MONTHS);

    const [roomsByStatus, roomAgg, trendInvoices] = await Promise.all([
      this.prisma.room.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.room.aggregate({
        _count: { _all: true },
        _sum: { occupantCount: true, motorbikeCount: true },
      }),
      this.prisma.invoice.findMany({
        where: { OR: periods.map((p) => ({ year: p.year, month: p.month })) },
        select: {
          year: true,
          month: true,
          status: true,
          totalAmount: true,
          electricityPrev: true,
          electricityCurrent: true,
          waterPrev: true,
          waterCurrent: true,
        },
      }),
    ]);

    const countByStatus = (status: RoomStatus) =>
      roomsByStatus.find((r) => r.status === status)?._count._all ?? 0;

    // Bucket invoices by "year-month" so we walk the list once.
    const byPeriod = new Map<string, (typeof trendInvoices)[number][]>();
    for (const inv of trendInvoices) {
      const bucket = byPeriod.get(periodKey(inv));
      if (bucket) bucket.push(inv);
      else byPeriod.set(periodKey(inv), [inv]);
    }

    const trend: TrendPoint[] = periods.map((p) => {
      const list = byPeriod.get(periodKey(p)) ?? [];
      return {
        year: p.year,
        month: p.month,
        electricityConsumption: sum(
          list,
          (i) => i.electricityCurrent - i.electricityPrev,
        ),
        waterConsumption: sum(list, (i) => i.waterCurrent - i.waterPrev),
        revenue: sum(
          list.filter((i) => i.status === InvoiceStatus.PAID),
          (i) => i.totalAmount,
        ),
      };
    });

    const selected = trend[trend.length - 1];
    const selectedList = byPeriod.get(periodKey({ year, month })) ?? [];

    return {
      period: { year, month },
      rooms: {
        total: roomAgg._count._all,
        available: countByStatus(RoomStatus.AVAILABLE),
        occupied: countByStatus(RoomStatus.OCCUPIED),
        maintenance: countByStatus(RoomStatus.MAINTENANCE),
      },
      occupants: roomAgg._sum.occupantCount ?? 0,
      motorbikes: roomAgg._sum.motorbikeCount ?? 0,
      utilities: {
        electricityConsumption: selected.electricityConsumption,
        waterConsumption: selected.waterConsumption,
      },
      invoices: {
        paid: selectedList.filter((i) => i.status === InvoiceStatus.PAID).length,
        unpaid: selectedList.filter((i) => i.status === InvoiceStatus.UNPAID)
          .length,
        total: selectedList.length,
        revenue: selected.revenue,
      },
      trend,
    };
  }
}

/** Oldest → newest list of `count` periods ending at (year, month). */
function buildPeriods(year: number, month: number, count: number): Period[] {
  const periods: Period[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < count; i++) {
    periods.unshift({ year: y, month: m });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return periods;
}

function periodKey(p: Period): string {
  return `${p.year}-${p.month}`;
}

function sum<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((acc, item) => acc + selector(item), 0);
}
