import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const ID_CARD_TAKEN = 'Số CCCD đã tồn tại';
const TENANT_NOT_FOUND = 'Không tìm thấy người thuê';
const ROOM_NOT_FOUND = 'Không tìm thấy phòng';

const TENANT_INCLUDE = {
  room: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(roomId: number | undefined) {
    return this.prisma.tenant.findMany({
      where: roomId ? { roomId } : {},
      orderBy: { createdAt: 'desc' },
      include: TENANT_INCLUDE,
    });
  }

  async create(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { idCardNumber: dto.idCardNumber },
    });
    if (existing) throw new ConflictException(ID_CARD_TAKEN);
    if (dto.roomId !== undefined) await this.assertRoomExists(dto.roomId);

    return this.prisma.tenant.create({
      data: {
        fullName: dto.fullName,
        idCardNumber: dto.idCardNumber,
        dateOfBirth: new Date(dto.dateOfBirth),
        hometown: dto.hometown,
        roomId: dto.roomId,
      },
      include: TENANT_INCLUDE,
    });
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND);

    if (dto.idCardNumber) {
      const existing = await this.prisma.tenant.findUnique({
        where: { idCardNumber: dto.idCardNumber },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(ID_CARD_TAKEN);
      }
    }
    if (typeof dto.roomId === 'number') {
      await this.assertRoomExists(dto.roomId);
    }

    const { dateOfBirth, ...rest } = dto;
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...rest,
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
      },
      include: TENANT_INCLUDE,
    });
  }

  async remove(id: number): Promise<{ message: string }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND);
    await this.prisma.tenant.delete({ where: { id } });
    return { message: 'Đã xoá người thuê' };
  }

  private async assertRoomExists(roomId: number): Promise<void> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);
  }
}
