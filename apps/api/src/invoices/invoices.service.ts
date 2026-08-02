import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Room } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

const ROOM_NOT_FOUND = 'Không tìm thấy phòng';
const INVOICE_NOT_FOUND = 'Không tìm thấy hoá đơn';
const INVOICE_EXISTS = 'Phòng đã có hoá đơn cho tháng này';
const DELETE_PAID = 'Không thể xoá hoá đơn đã thanh toán';
const EDIT_PAID = 'Không thể sửa hoá đơn đã thanh toán';
const ALREADY_UNPAID = 'Hoá đơn chưa được thanh toán';
const INVOICE_PAID_LOCKED =
  'Hoá đơn kỳ này đã thanh toán, không thể sửa chỉ số';

const INVOICE_INCLUDE = {
  room: { select: { id: true, name: true } },
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(filter: { year?: number; month?: number; roomId?: number }) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...(filter.year ? { year: filter.year } : {}),
        ...(filter.month ? { month: filter.month } : {}),
        ...(filter.roomId ? { roomId: filter.roomId } : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { roomId: 'asc' }],
      include: INVOICE_INCLUDE,
    });
    return this.withMeterReadingFlag(invoices);
  }

  // An invoice can be issued before its meter reading is entered (electricity
  // and water then bill at zero consumption). Rather than storing that state,
  // derive it on read so it clears itself once the reading arrives — entering a
  // reading runs syncMeterReading, which rewrites the amounts.
  async withMeterReadingFlag<
    T extends { roomId: number; year: number; month: number },
  >(invoices: T[]): Promise<(T & { meterReadingMissing: boolean })[]> {
    if (invoices.length === 0) return [];
    const readings = await this.prisma.meterReading.findMany({
      where: {
        OR: invoices.map(({ roomId, year, month }) => ({
          roomId,
          year,
          month,
        })),
      },
      select: { roomId: true, year: true, month: true },
    });
    const key = (r: { roomId: number; year: number; month: number }) =>
      `${r.roomId}:${r.year}:${r.month}`;
    const recorded = new Set(readings.map(key));
    return invoices.map((invoice) => ({
      ...invoice,
      meterReadingMissing: !recorded.has(key(invoice)),
    }));
  }

  async create(dto: CreateInvoiceDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

    const existing = await this.prisma.invoice.findUnique({
      where: {
        roomId_year_month: {
          roomId: dto.roomId,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (existing) throw new ConflictException(INVOICE_EXISTS);

    const data = await this.computeInvoiceData(
      room,
      dto.month,
      dto.year,
      dto.feeSettingId,
    );

    try {
      return await this.prisma.invoice.create({
        data: {
          roomId: dto.roomId,
          month: dto.month,
          year: dto.year,
          ...data,
        },
        include: INVOICE_INCLUDE,
      });
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException(INVOICE_EXISTS);
      }
      throw e;
    }
  }

  // Single source of truth for invoice amounts: resolves the room's current
  // fee type, meter reading, and prev-reading baseline (previous invoice →
  // contract → room initials) for the given billing period.
  //
  // A missing meter reading is not an error: the invoice still bills rent and
  // the fixed fees, with current = prev so electricity and water come to zero.
  // Callers surface that state separately (see withMeterReadingFlag).
  private async computeInvoiceData(
    room: Room,
    month: number,
    year: number,
    feeSettingId?: number,
  ) {
    const reading = await this.prisma.meterReading.findUnique({
      where: {
        roomId_year_month: { roomId: room.id, year, month },
      },
    });

    // Resolve fee type: explicit override → room's assigned type → default.
    const setting = await this.settingsService.resolve(
      feeSettingId ?? room.feeSettingId,
    );

    // governing contract for this billing period: the room's latest contract
    // that started on or before the end of the billing month
    const periodEnd = new Date(year, month, 0, 23, 59, 59);
    const contract = await this.prisma.contract.findFirst({
      where: { roomId: room.id, startDate: { lte: periodEnd } },
      orderBy: { startDate: 'desc' },
    });
    const contractStartYear = contract?.startDate.getFullYear();
    const contractStartMonth = contract
      ? contract.startDate.getMonth() + 1
      : undefined;

    // previous billing period: latest invoice strictly before (year, month),
    // and — when a governing contract exists — no earlier than its start month,
    // so a new contract resets the baseline.
    const beforePeriod = {
      OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
    };
    const withinContract =
      contractStartYear !== undefined && contractStartMonth !== undefined
        ? {
            OR: [
              { year: { gt: contractStartYear } },
              { year: contractStartYear, month: { gte: contractStartMonth } },
            ],
          }
        : undefined;
    const previous = await this.prisma.invoice.findFirst({
      where: {
        roomId: room.id,
        AND: withinContract ? [beforePeriod, withinContract] : [beforePeriod],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const electricityPrev =
      previous?.electricityCurrent ??
      contract?.initialElectricityReading ??
      room.initialElectricityReading;
    const waterPrev =
      previous?.waterCurrent ??
      contract?.initialWaterReading ??
      room.initialWaterReading;
    const electricityCurrent = reading?.electricityReading ?? electricityPrev;
    const waterCurrent = reading?.waterReading ?? waterPrev;

    const electricityAmount =
      (electricityCurrent - electricityPrev) * setting.electricityUnitPrice;
    const waterAmount = (waterCurrent - waterPrev) * setting.waterUnitPrice;
    const internetFee = room.internetEnabled ? setting.internetFee : 0;
    const elevatorFee = room.occupantCount * setting.elevatorFeePerPerson;
    const cleaningFee = room.occupantCount * setting.cleaningFeePerPerson;
    const motorbikeFee =
      Math.max(0, room.motorbikeCount - setting.freeMotorbikeCount) *
      setting.motorbikeFeePerExtra;

    const totalAmount =
      room.price +
      electricityAmount +
      waterAmount +
      internetFee +
      elevatorFee +
      cleaningFee +
      motorbikeFee +
      setting.otherFee;

    return {
      roomPrice: room.price,
      electricityPrev,
      electricityCurrent,
      electricityUnitPrice: setting.electricityUnitPrice,
      waterPrev,
      waterCurrent,
      waterUnitPrice: setting.waterUnitPrice,
      internetFee,
      elevatorFee,
      cleaningFee,
      motorbikeFee,
      otherFee: setting.otherFee,
      occupantCount: room.occupantCount,
      motorbikeCount: room.motorbikeCount,
      totalAmount,
    };
  }

  private async roomsMissingReading(
    rooms: { id: number; name: string }[],
    month: number,
    year: number,
  ): Promise<{ roomId: number; roomName: string }[]> {
    if (rooms.length === 0) return [];
    const readings = await this.prisma.meterReading.findMany({
      where: { year, month, roomId: { in: rooms.map((room) => room.id) } },
      select: { roomId: true },
    });
    const recorded = new Set(readings.map((r) => r.roomId));
    return rooms
      .filter((room) => !recorded.has(room.id))
      .map((room) => ({ roomId: room.id, roomName: room.name }));
  }

  async generateForMonth(
    month: number,
    year: number,
  ): Promise<{
    created: number;
    skipped: number;
    skippedRooms: { roomId: number; roomName: string }[];
    missingReadings: { roomId: number; roomName: string }[];
  }> {
    const rooms = await this.prisma.room.findMany({
      where: { status: 'OCCUPIED' },
    });
    // Rooms still without a reading for the period. They are billed all the
    // same (zero consumption), so this is a follow-up list for the caller, not
    // a list of failures.
    const missingReadings = await this.roomsMissingReading(rooms, month, year);

    let created = 0;
    const skippedRooms: { roomId: number; roomName: string }[] = [];
    for (const room of rooms) {
      try {
        await this.create({ roomId: room.id, month, year });
        created += 1;
      } catch (e) {
        if (e instanceof ConflictException) {
          skippedRooms.push({ roomId: room.id, roomName: room.name });
          continue;
        }
        throw e;
      }
    }
    return {
      created,
      skipped: skippedRooms.length,
      skippedRooms,
      missingReadings,
    };
  }

  // Rebuilds every UNPAID invoice of the period from the current data (room
  // price, fee setting, meter readings, occupant/motorbike counts). PAID
  // invoices are never touched. Note: this overwrites manual edits made via
  // the invoice edit dialog.
  async refreshForMonth(
    month: number,
    year: number,
  ): Promise<{
    updated: number;
    unchanged: number;
    missingReadings: { roomId: number; roomName: string }[];
  }> {
    const invoices = await this.prisma.invoice.findMany({
      where: { year, month, status: 'UNPAID' },
      include: { room: true },
    });
    const missingReadings = await this.roomsMissingReading(
      invoices.map((invoice) => invoice.room),
      month,
      year,
    );
    let updated = 0;
    let unchanged = 0;

    for (const invoice of invoices) {
      const data = await this.computeInvoiceData(invoice.room, month, year);

      const changed = (Object.keys(data) as (keyof typeof data)[]).some(
        (key) => invoice[key] !== data[key],
      );
      if (!changed) {
        unchanged += 1;
        continue;
      }
      await this.prisma.invoice.update({ where: { id: invoice.id }, data });
      updated += 1;
    }

    return { updated, unchanged, missingReadings };
  }

  async pay(id: number, dto: PayInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentMethod: dto.paymentMethod,
        paidAt: new Date(),
      },
      include: INVOICE_INCLUDE,
    });
  }

  async unpay(id: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (invoice.status === 'UNPAID')
      throw new BadRequestException(ALREADY_UNPAID);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'UNPAID', paymentMethod: null, paidAt: null },
      include: INVOICE_INCLUDE,
    });
  }

  async update(id: number, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (invoice.status === 'PAID') throw new ConflictException(EDIT_PAID);

    const merged = {
      roomPrice: dto.roomPrice ?? invoice.roomPrice,
      electricityPrev: dto.electricityPrev ?? invoice.electricityPrev,
      electricityCurrent: dto.electricityCurrent ?? invoice.electricityCurrent,
      electricityUnitPrice:
        dto.electricityUnitPrice ?? invoice.electricityUnitPrice,
      waterPrev: dto.waterPrev ?? invoice.waterPrev,
      waterCurrent: dto.waterCurrent ?? invoice.waterCurrent,
      waterUnitPrice: dto.waterUnitPrice ?? invoice.waterUnitPrice,
      internetFee: dto.internetFee ?? invoice.internetFee,
      elevatorFee: dto.elevatorFee ?? invoice.elevatorFee,
      cleaningFee: dto.cleaningFee ?? invoice.cleaningFee,
      motorbikeFee: dto.motorbikeFee ?? invoice.motorbikeFee,
      otherFee: dto.otherFee ?? invoice.otherFee,
      occupantCount: dto.occupantCount ?? invoice.occupantCount,
      motorbikeCount: dto.motorbikeCount ?? invoice.motorbikeCount,
    };
    const electricityAmount =
      (merged.electricityCurrent - merged.electricityPrev) *
      merged.electricityUnitPrice;
    const waterAmount =
      (merged.waterCurrent - merged.waterPrev) * merged.waterUnitPrice;
    const totalAmount =
      merged.roomPrice +
      electricityAmount +
      waterAmount +
      merged.internetFee +
      merged.elevatorFee +
      merged.cleaningFee +
      merged.motorbikeFee +
      merged.otherFee;

    return this.prisma.invoice.update({
      where: { id },
      data: { ...merged, totalAmount },
      include: INVOICE_INCLUDE,
    });
  }

  async remove(id: number): Promise<{ message: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (invoice.status === 'PAID') throw new ConflictException(DELETE_PAID);
    await this.prisma.invoice.delete({ where: { id } });
    return { message: 'Đã xoá hoá đơn' };
  }

  // Recomputes this room's invoice chain from the given period forward.
  //
  // An invoice's electricityPrev is a stored snapshot of the previous invoice's
  // electricityCurrent, not a live lookup — so editing a back-dated reading has
  // to rewalk every later invoice, or the difference gets billed twice.
  //
  // Only reading-derived fields are touched. Room price, fee settings and
  // occupant counts stay as stored, so manual invoice edits survive. That is
  // the deliberate opposite of refreshForMonth, which rebuilds everything.
  async resyncFromPeriod(
    roomId: number,
    year: number,
    month: number,
  ): Promise<void> {
    const fromPeriod = {
      OR: [{ year: { gt: year } }, { year, month: { gte: month } }],
    };
    const invoices = await this.prisma.invoice.findMany({
      where: { roomId, ...fromPeriod },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    // No invoice for the edited period itself means nothing downstream can
    // shift: the prev chain runs through invoices, not readings.
    const first = invoices[0];
    if (!first || first.year !== year || first.month !== month) return;

    // Defensive: callers check this before writing anything, so reaching here
    // with a settled invoice would mean a new call site skipped the guard.
    if (invoices.some((invoice) => invoice.status === 'PAID')) {
      throw new ConflictException(INVOICE_PAID_LOCKED);
    }

    const readings = await this.prisma.meterReading.findMany({
      where: { roomId, ...fromPeriod },
    });
    const periodKey = (p: { year: number; month: number }) =>
      `${p.year}-${p.month}`;
    const readingByPeriod = new Map(readings.map((r) => [periodKey(r), r]));

    // The baseline entering the edited period is unaffected by the edit.
    let electricityPrev = first.electricityPrev;
    let waterPrev = first.waterPrev;

    for (const invoice of invoices) {
      const reading = readingByPeriod.get(periodKey(invoice));
      const electricityCurrent = reading?.electricityReading ?? electricityPrev;
      const waterCurrent = reading?.waterReading ?? waterPrev;
      const totalAmount =
        invoice.roomPrice +
        (electricityCurrent - electricityPrev) * invoice.electricityUnitPrice +
        (waterCurrent - waterPrev) * invoice.waterUnitPrice +
        invoice.internetFee +
        invoice.elevatorFee +
        invoice.cleaningFee +
        invoice.motorbikeFee +
        invoice.otherFee;

      const changed =
        invoice.electricityPrev !== electricityPrev ||
        invoice.electricityCurrent !== electricityCurrent ||
        invoice.waterPrev !== waterPrev ||
        invoice.waterCurrent !== waterCurrent ||
        invoice.totalAmount !== totalAmount;
      if (changed) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            electricityPrev,
            electricityCurrent,
            waterPrev,
            waterCurrent,
            totalAmount,
          },
        });
      }

      electricityPrev = electricityCurrent;
      waterPrev = waterCurrent;
    }
  }
}
