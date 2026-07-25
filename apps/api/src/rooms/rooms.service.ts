import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/types/auth-user';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdateReadingsDto } from './dto/bulk-update-readings.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

const ROOM_NAME_TAKEN = 'Tên phòng đã tồn tại';
const ROOM_NOT_FOUND = 'Không tìm thấy phòng';
const READING_PAID_LOCKED =
  'Hoá đơn kỳ này đã thanh toán, không thể sửa chỉ số';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  findAll() {
    return this.prisma.room.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { tenants: true } } },
    });
  }

  async findOne(id: number) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        tenants: { orderBy: { createdAt: 'desc' } },
        contracts: { orderBy: { startDate: 'desc' } },
        invoices: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
      },
    });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);
    return room;
  }

  async create(dto: CreateRoomDto) {
    const existing = await this.prisma.room.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException(ROOM_NAME_TAKEN);

    return this.prisma.room.create({
      data: {
        ...dto,
        price: dto.price ?? 0,
        electricityReading: dto.initialElectricityReading,
        waterReading: dto.initialWaterReading,
      },
    });
  }

  async update(id: number, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

    if (dto.name && dto.name !== room.name) {
      const existing = await this.prisma.room.findUnique({
        where: { name: dto.name },
      });
      if (existing) throw new ConflictException(ROOM_NAME_TAKEN);
    }

    return this.prisma.room.update({ where: { id }, data: { ...dto } });
  }

  async remove(id: number): Promise<{ message: string }> {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);
    await this.prisma.room.delete({ where: { id } });
    return { message: 'Đã xoá phòng' };
  }

  getReadingHistory(roomId: number) {
    return this.prisma.meterReadingHistory.findMany({
      where: { roomId },
      orderBy: { changedAt: 'desc' },
    });
  }

  async bulkUpdateReadings(
    dto: BulkUpdateReadingsDto,
    user?: AuthUser,
  ): Promise<{ message: string; updated: number }> {
    const ids = dto.items.map((i) => i.roomId);
    const rooms = await this.prisma.room.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        initialElectricityReading: true,
        initialWaterReading: true,
      },
    });
    const byId = new Map(rooms.map((r) => [r.id, r]));

    // Validate every item before writing anything.
    for (const item of dto.items) {
      const room = byId.get(item.roomId);
      if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

      // Only the room's most recent recorded month may be edited.
      const newer = await this.prisma.meterReading.findFirst({
        where: {
          roomId: item.roomId,
          OR: [
            { year: { gt: dto.year } },
            { year: dto.year, month: { gt: dto.month } },
          ],
        },
      });
      if (newer) {
        throw new BadRequestException(
          `Chỉ được sửa chỉ số của kỳ gần nhất (phòng ${room.name})`,
        );
      }

      // New reading must be >= the previous month's reading (or the baseline).
      const prev = await this.prisma.meterReading.findFirst({
        where: {
          roomId: item.roomId,
          OR: [
            { year: { lt: dto.year } },
            { year: dto.year, month: { lt: dto.month } },
          ],
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });
      const prevElectricity =
        prev?.electricityReading ?? room.initialElectricityReading;
      const prevWater = prev?.waterReading ?? room.initialWaterReading;
      if (
        item.electricityReading < prevElectricity ||
        item.waterReading < prevWater
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số kỳ trước`,
        );
      }

      // A PAID invoice for this month must not be mutated by a reading edit.
      // Reject up-front (before any write) so the reading store can't drift
      // ahead of a locked invoice — syncMeterReading also guards this, but only
      // after the reading/history/room writes would have committed.
      const invoice = await this.prisma.invoice.findUnique({
        where: {
          roomId_year_month: {
            roomId: item.roomId,
            year: dto.year,
            month: dto.month,
          },
        },
        select: { status: true },
      });
      if (invoice?.status === 'PAID') {
        throw new ConflictException(READING_PAID_LOCKED);
      }
    }

    // Persist: upsert reading, snapshot history, mirror newest into the room.
    for (const item of dto.items) {
      await this.prisma.meterReading.upsert({
        where: {
          roomId_year_month: {
            roomId: item.roomId,
            year: dto.year,
            month: dto.month,
          },
        },
        create: {
          roomId: item.roomId,
          year: dto.year,
          month: dto.month,
          electricityReading: item.electricityReading,
          waterReading: item.waterReading,
        },
        update: {
          electricityReading: item.electricityReading,
          waterReading: item.waterReading,
        },
      });
      await this.prisma.meterReadingHistory.create({
        data: {
          roomId: item.roomId,
          year: dto.year,
          month: dto.month,
          electricityReading: item.electricityReading,
          waterReading: item.waterReading,
          changedById: user?.id ?? null,
          changedByName: user?.name ?? null,
        },
      });
      await this.prisma.room.update({
        where: { id: item.roomId },
        data: {
          electricityReading: item.electricityReading,
          waterReading: item.waterReading,
        },
      });
      // Keep the month's invoice in sync (added in Task 4).
      await this.invoicesService.syncMeterReading(
        item.roomId,
        dto.year,
        dto.month,
      );
    }

    return { message: 'Đã cập nhật chỉ số', updated: dto.items.length };
  }
}
