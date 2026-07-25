import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../auth/auth.service';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export const SAFE_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const MANAGER_ONLY = 'Chỉ có thể thao tác trên tài khoản quản lý';
const USERNAME_TAKEN = 'Tên đăng nhập đã được sử dụng';
const EMAIL_TAKEN = 'Email đã được sử dụng';

// map Prisma's unique-constraint error to a field-specific message
function conflictFromP2002(e: unknown): ConflictException | null {
  if (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  ) {
    const target = (e as { meta?: { target?: unknown } }).meta?.target;
    const field = Array.isArray(target) ? target.join(',') : String(target);
    return new ConflictException(
      field.includes('email') ? EMAIL_TAKEN : USERNAME_TAKEN,
    );
  }
  return null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { role: 'MANAGER' },
      orderBy: { createdAt: 'desc' },
      select: SAFE_USER_SELECT,
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException(USERNAME_TAKEN);

    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          password: await bcrypt.hash(dto.password, SALT_ROUNDS),
          name: dto.name,
          phone: dto.phone,
          role: 'MANAGER',
        },
        select: SAFE_USER_SELECT,
      });
    } catch (e) {
      const conflict = conflictFromP2002(e);
      if (conflict) throw conflict;
      throw e;
    }
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.assertManagedUser(id);

    if (dto.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(USERNAME_TAKEN);
      }
    }

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(EMAIL_TAKEN);
      }
    }

    const { password, ...rest } = dto;
    const data: Prisma.UserUpdateInput = { ...rest };
    if (password) {
      data.password = await bcrypt.hash(password, SALT_ROUNDS);
      data.tokenVersion = { increment: 1 };
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: SAFE_USER_SELECT,
      });
    } catch (e) {
      const conflict = conflictFromP2002(e);
      if (conflict) throw conflict;
      throw e;
    }
  }

  async remove(id: number): Promise<{ message: string }> {
    await this.assertManagedUser(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Đã xoá tài khoản' };
  }

  private async assertManagedUser(id: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.role !== 'MANAGER') throw new ForbiddenException(MANAGER_ONLY);
  }
}
