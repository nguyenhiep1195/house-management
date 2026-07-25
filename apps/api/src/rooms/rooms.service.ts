import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdateReadingsDto } from './dto/bulk-update-readings.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

const ROOM_NAME_TAKEN = 'Tên phòng đã tồn tại';
const ROOM_NOT_FOUND = 'Không tìm thấy phòng';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async bulkUpdateReadings(
    dto: BulkUpdateReadingsDto,
  ): Promise<{ message: string; updated: number }> {
    const ids = dto.items.map((i) => i.roomId);
    const rooms = await this.prisma.room.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        electricityReading: true,
        waterReading: true,
      },
    });
    const byId = new Map(rooms.map((r) => [r.id, r]));

    for (const item of dto.items) {
      const room = byId.get(item.roomId);
      if (!room) throw new NotFoundException(ROOM_NOT_FOUND);
      if (
        item.electricityReading < room.electricityReading ||
        item.waterReading < room.waterReading
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số cũ`,
        );
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.room.update({
          where: { id: item.roomId },
          data: {
            electricityReading: item.electricityReading,
            waterReading: item.waterReading,
          },
        }),
      ),
    );
    return { message: 'Đã cập nhật chỉ số', updated: dto.items.length };
  }
}
