import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

const ROOM_NOT_FOUND = 'Không tìm thấy phòng';
const CONTRACT_NOT_FOUND = 'Không tìm thấy hợp đồng';
const ACTIVE_EXISTS = 'Phòng đã có hợp đồng đang hiệu lực';
const INVALID_RANGE = 'Ngày kết thúc phải sau ngày bắt đầu';
const DELETE_ACTIVE = 'Không thể xoá hợp đồng đang hiệu lực';

const CONTRACT_INCLUDE = {
  room: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(roomId: number | undefined) {
    return this.prisma.contract.findMany({
      where: roomId ? { roomId } : {},
      orderBy: { startDate: 'desc' },
      include: CONTRACT_INCLUDE,
    });
  }

  async create(dto: CreateContractDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException(INVALID_RANGE);

    const active = await this.prisma.contract.findFirst({
      where: { roomId: dto.roomId, status: 'ACTIVE' },
    });
    if (active) throw new ConflictException(ACTIVE_EXISTS);

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          roomId: dto.roomId,
          price: dto.price,
          deposit: dto.deposit ?? 0,
          initialElectricityReading: dto.initialElectricityReading,
          initialWaterReading: dto.initialWaterReading,
          startDate: start,
          endDate: end,
          note: dto.note,
        },
        include: CONTRACT_INCLUDE,
      });
      await tx.room.update({
        where: { id: dto.roomId },
        data: {
          status: 'OCCUPIED',
          price: dto.price,
          electricityReading: dto.initialElectricityReading,
          waterReading: dto.initialWaterReading,
        },
      });
      return contract;
    });
  }

  async update(id: number, dto: UpdateContractDto) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException(CONTRACT_NOT_FOUND);

    const start = dto.startDate ? new Date(dto.startDate) : contract.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : contract.endDate;
    if (end <= start) throw new BadRequestException(INVALID_RANGE);

    const nextStatus = dto.status ?? contract.status;
    const nextPrice = dto.price ?? contract.price;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.startDate ? { startDate: start } : {}),
          ...(dto.endDate ? { endDate: end } : {}),
        },
        include: CONTRACT_INCLUDE,
      });

      if (nextStatus === 'ACTIVE') {
        await tx.room.update({
          where: { id: contract.roomId },
          data: { status: 'OCCUPIED', price: nextPrice },
        });
      } else if (contract.status === 'ACTIVE') {
        // contract left ACTIVE — release the room if nothing else holds it
        const otherActive = await tx.contract.findFirst({
          where: { roomId: contract.roomId, status: 'ACTIVE', id: { not: id } },
        });
        if (!otherActive) {
          await tx.room.update({
            where: { id: contract.roomId },
            data: { status: 'AVAILABLE' },
          });
        }
      }
      return updated;
    });
  }

  async remove(id: number): Promise<{ message: string }> {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException(CONTRACT_NOT_FOUND);
    if (contract.status === 'ACTIVE') {
      throw new BadRequestException(DELETE_ACTIVE);
    }
    await this.prisma.contract.delete({ where: { id } });
    return { message: 'Đã xoá hợp đồng' };
  }
}
