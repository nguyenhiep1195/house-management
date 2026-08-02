import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/types/auth-user';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { BulkUpdateReadingsDto } from './dto/bulk-update-readings.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

const ROOM_NAME_TAKEN = 'Tên phòng đã tồn tại';
const ROOM_NOT_FOUND = 'Không tìm thấy phòng';
const FEE_SETTING_NOT_FOUND = 'Không tìm thấy loại phí';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly settingsService: SettingsService,
  ) {}

  // Ensure a fee type id refers to an existing type (FK would otherwise throw a
  // raw P2003). Returns void; throws BadRequest with a friendly message.
  private async assertFeeSettingExists(id: number): Promise<void> {
    const found = await this.prisma.feeSetting.findUnique({ where: { id } });
    if (!found) throw new BadRequestException(FEE_SETTING_NOT_FOUND);
  }

  // Baseline a reading is measured against: the latest recorded period strictly
  // before this one, falling back to the room's initial readings. Shared by the
  // write path and the readings endpoint so the number shown to the user and
  // the number enforced on save cannot drift apart.
  private async resolvePrevReading(
    roomId: number,
    year: number,
    month: number,
    fallback: {
      initialElectricityReading: number;
      initialWaterReading: number;
    },
  ): Promise<{ electricity: number; water: number }> {
    const prev = await this.prisma.meterReading.findFirst({
      where: {
        roomId,
        OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return {
      electricity:
        prev?.electricityReading ?? fallback.initialElectricityReading,
      water: prev?.waterReading ?? fallback.initialWaterReading,
    };
  }

  // The earliest recorded period strictly after this one. Doubles as the
  // upper bound for a back-dated edit and as "is this the newest period".
  private findNextReading(roomId: number, year: number, month: number) {
    return this.prisma.meterReading.findFirst({
      where: {
        roomId,
        OR: [{ year: { gt: year } }, { year, month: { gt: month } }],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

  // The earliest PAID invoice at or after this period. A reading edit shifts
  // every later invoice's baseline, so a settled invoice anywhere downstream
  // blocks the edit outright.
  private findSettledInvoiceFrom(roomId: number, year: number, month: number) {
    return this.prisma.invoice.findFirst({
      where: {
        roomId,
        status: 'PAID',
        OR: [{ year: { gt: year } }, { year, month: { gte: month } }],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

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
    // Same "chưa cập nhật chỉ số" flag the invoices list shows, so the room
    // page renders the warning too.
    return {
      ...room,
      invoices: await this.invoicesService.withMeterReadingFlag(room.invoices),
    };
  }

  async create(dto: CreateRoomDto) {
    const existing = await this.prisma.room.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException(ROOM_NAME_TAKEN);

    // Default to the default fee type when the caller doesn't pick one.
    let feeSettingId = dto.feeSettingId;
    if (feeSettingId != null) {
      await this.assertFeeSettingExists(feeSettingId);
    } else {
      feeSettingId = (await this.settingsService.getDefault()).id;
    }

    return this.prisma.room.create({
      data: {
        ...dto,
        feeSettingId,
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

    if (dto.feeSettingId != null) {
      await this.assertFeeSettingExists(dto.feeSettingId);
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

    // Validate every item before writing anything, and remember per item
    // whether it is the room's newest period — only that one may refresh the
    // room's mirror columns.
    const planned: { roomId: number; isNewest: boolean }[] = [];
    for (const item of dto.items) {
      const room = byId.get(item.roomId);
      if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

      // Lower bound: never below the period before this one.
      const prev = await this.resolvePrevReading(
        item.roomId,
        dto.year,
        dto.month,
        room,
      );
      if (
        item.electricityReading < prev.electricity ||
        item.waterReading < prev.water
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số kỳ trước`,
        );
      }

      // Upper bound: a back-dated edit must not push the following period into
      // negative consumption.
      const next = await this.findNextReading(item.roomId, dto.year, dto.month);
      if (
        next &&
        (item.electricityReading > next.electricityReading ||
          item.waterReading > next.waterReading)
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải nhỏ hơn hoặc bằng chỉ số kỳ ${next.month}/${next.year}`,
        );
      }

      // A settled invoice at or after this period must not be mutated by a
      // reading edit. Rejected up-front so the reading store can never drift
      // ahead of a locked invoice — resyncFromPeriod guards too, but only
      // after the reading/history/room writes would have committed.
      const settled = await this.findSettledInvoiceFrom(
        item.roomId,
        dto.year,
        dto.month,
      );
      if (settled) {
        throw new ConflictException(
          `Không thể sửa chỉ số kỳ ${dto.month}/${dto.year} của phòng ${room.name}: hoá đơn kỳ ${settled.month}/${settled.year} đã thanh toán`,
        );
      }

      planned.push({ roomId: item.roomId, isNewest: next === null });
    }

    // Persist: upsert reading, snapshot history, mirror newest into the room,
    // then rewalk that room's invoice chain from this period forward.
    for (const [index, item] of dto.items.entries()) {
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
      // Room.electricityReading/waterReading mirror the room's CURRENT state.
      // A back-dated edit must not stamp an old number onto them.
      if (planned[index].isNewest) {
        await this.prisma.room.update({
          where: { id: item.roomId },
          data: {
            electricityReading: item.electricityReading,
            waterReading: item.waterReading,
          },
        });
      }
      await this.invoicesService.resyncFromPeriod(
        item.roomId,
        dto.year,
        dto.month,
      );
    }

    return { message: 'Đã cập nhật chỉ số', updated: dto.items.length };
  }
}
