import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';

const ROOM_NOT_FOUND = 'Không tìm thấy phòng';
const INVOICE_NOT_FOUND = 'Không tìm thấy hoá đơn';
const INVOICE_EXISTS = 'Phòng đã có hoá đơn cho tháng này';
const DELETE_PAID = 'Không thể xoá hoá đơn đã thanh toán';
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

  findAll(filter: { year?: number; month?: number; roomId?: number }) {
    return this.prisma.invoice.findMany({
      where: {
        ...(filter.year ? { year: filter.year } : {}),
        ...(filter.month ? { month: filter.month } : {}),
        ...(filter.roomId ? { roomId: filter.roomId } : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { roomId: 'asc' }],
      include: INVOICE_INCLUDE,
    });
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

    const reading = await this.prisma.meterReading.findUnique({
      where: {
        roomId_year_month: {
          roomId: dto.roomId,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (!reading) {
      throw new BadRequestException(
        `Phòng ${room.name} chưa nhập chỉ số điện nước tháng ${dto.month}/${dto.year}`,
      );
    }

    const setting = await this.settingsService.get();

    // previous billing period: latest invoice strictly before (year, month)
    const previous = await this.prisma.invoice.findFirst({
      where: {
        roomId: dto.roomId,
        OR: [
          { year: { lt: dto.year } },
          { year: dto.year, month: { lt: dto.month } },
        ],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const electricityPrev =
      previous?.electricityCurrent ?? room.initialElectricityReading;
    const waterPrev = previous?.waterCurrent ?? room.initialWaterReading;
    const electricityCurrent = reading.electricityReading;
    const waterCurrent = reading.waterReading;

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

    try {
      return await this.prisma.invoice.create({
        data: {
          roomId: dto.roomId,
          month: dto.month,
          year: dto.year,
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

  async generateForMonth(
    month: number,
    year: number,
  ): Promise<{
    created: number;
    skipped: number;
    missingReadings: { roomId: number; roomName: string }[];
  }> {
    const rooms = await this.prisma.room.findMany({
      where: { status: 'OCCUPIED' },
    });
    let created = 0;
    let skipped = 0;
    const missingReadings: { roomId: number; roomName: string }[] = [];
    for (const room of rooms) {
      try {
        await this.create({ roomId: room.id, month, year });
        created += 1;
      } catch (e) {
        if (e instanceof ConflictException) {
          skipped += 1;
          continue;
        }
        if (e instanceof BadRequestException) {
          missingReadings.push({ roomId: room.id, roomName: room.name });
          continue;
        }
        throw e;
      }
    }
    return { created, skipped, missingReadings };
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

  async remove(id: number): Promise<{ message: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (invoice.status === 'PAID') throw new ConflictException(DELETE_PAID);
    await this.prisma.invoice.delete({ where: { id } });
    return { message: 'Đã xoá hoá đơn' };
  }

  async syncMeterReading(
    roomId: number,
    year: number,
    month: number,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { roomId_year_month: { roomId, year, month } },
    });
    if (!invoice) return;
    if (invoice.status === 'PAID') {
      throw new ConflictException(INVOICE_PAID_LOCKED);
    }
    const reading = await this.prisma.meterReading.findUnique({
      where: { roomId_year_month: { roomId, year, month } },
    });
    if (!reading) return;

    const electricityCurrent = reading.electricityReading;
    const waterCurrent = reading.waterReading;
    const electricityAmount =
      (electricityCurrent - invoice.electricityPrev) *
      invoice.electricityUnitPrice;
    const waterAmount =
      (waterCurrent - invoice.waterPrev) * invoice.waterUnitPrice;
    const totalAmount =
      invoice.roomPrice +
      electricityAmount +
      waterAmount +
      invoice.internetFee +
      invoice.elevatorFee +
      invoice.cleaningFee +
      invoice.motorbikeFee +
      invoice.otherFee;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { electricityCurrent, waterCurrent, totalAmount },
    });
  }
}
