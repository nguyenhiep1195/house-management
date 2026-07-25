import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/types/auth-user';
import { FeeSetting, FeeSettingHistory } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeSettingDto } from './dto/create-fee-setting.dto';
import { UpdateFeeSettingDto } from './dto/update-fee-setting.dto';

const NOT_FOUND = 'Không tìm thấy loại phí';
const NAME_TAKEN = 'Tên loại phí đã tồn tại';
const DELETE_DEFAULT = 'Không thể xoá loại phí mặc định';
const DELETE_LAST = 'Không thể xoá loại phí cuối cùng';
const DELETE_IN_USE =
  'Không thể xoá: vẫn còn phòng đang dùng loại phí này. Hãy đổi loại phí của các phòng đó trước.';

// The 8 fee-value fields shared by FeeSetting and its history snapshots.
type FeeValues = Pick<
  FeeSetting,
  | 'electricityUnitPrice'
  | 'waterUnitPrice'
  | 'internetFee'
  | 'elevatorFeePerPerson'
  | 'cleaningFeePerPerson'
  | 'motorbikeFeePerExtra'
  | 'freeMotorbikeCount'
  | 'otherFee'
>;

const FEE_DEFAULTS: FeeValues = {
  electricityUnitPrice: 3500,
  waterUnitPrice: 15000,
  internetFee: 100000,
  elevatorFeePerPerson: 30000,
  cleaningFeePerPerson: 20000,
  motorbikeFeePerExtra: 100000,
  freeMotorbikeCount: 2,
  otherFee: 0,
};

function mergeFees(current: FeeValues, dto: Partial<FeeValues>): FeeValues {
  return {
    electricityUnitPrice:
      dto.electricityUnitPrice ?? current.electricityUnitPrice,
    waterUnitPrice: dto.waterUnitPrice ?? current.waterUnitPrice,
    internetFee: dto.internetFee ?? current.internetFee,
    elevatorFeePerPerson:
      dto.elevatorFeePerPerson ?? current.elevatorFeePerPerson,
    cleaningFeePerPerson:
      dto.cleaningFeePerPerson ?? current.cleaningFeePerPerson,
    motorbikeFeePerExtra:
      dto.motorbikeFeePerExtra ?? current.motorbikeFeePerExtra,
    freeMotorbikeCount: dto.freeMotorbikeCount ?? current.freeMotorbikeCount,
    otherFee: dto.otherFee ?? current.otherFee,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<FeeSetting[]> {
    return this.prisma.feeSetting.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  // The default fee type, self-healing if none/many are flagged. Creates a
  // seed "Loại I" when the table is empty so the app always has one.
  async getDefault(): Promise<FeeSetting> {
    const flagged = await this.prisma.feeSetting.findFirst({
      where: { isDefault: true },
      orderBy: { id: 'asc' },
    });
    if (flagged) return flagged;

    const any = await this.prisma.feeSetting.findFirst({
      orderBy: { id: 'asc' },
    });
    if (any) {
      return this.prisma.feeSetting.update({
        where: { id: any.id },
        data: { isDefault: true },
      });
    }
    return this.prisma.feeSetting.create({
      data: { name: 'Loại I', isDefault: true },
    });
  }

  // Resolve the fee type an invoice should use: explicit id → the room's
  // assigned type → the default.
  async resolve(feeSettingId?: number | null): Promise<FeeSetting> {
    if (feeSettingId != null) {
      const found = await this.prisma.feeSetting.findUnique({
        where: { id: feeSettingId },
      });
      if (found) return found;
    }
    return this.getDefault();
  }

  async findOne(id: number): Promise<FeeSetting> {
    const found = await this.prisma.feeSetting.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(NOT_FOUND);
    return found;
  }

  async create(dto: CreateFeeSettingDto, user?: AuthUser): Promise<FeeSetting> {
    const count = await this.prisma.feeSetting.count();
    const { name, ...feeDto } = dto;
    const fees = mergeFees(FEE_DEFAULTS, feeDto);
    try {
      const created = await this.prisma.feeSetting.create({
        data: { name, isDefault: count === 0, ...fees },
      });
      await this.prisma.feeSettingHistory.create({
        data: {
          feeSettingId: created.id,
          ...fees,
          changedById: user?.id ?? null,
          changedByName: user?.name ?? null,
        },
      });
      return created;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(NAME_TAKEN);
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdateFeeSettingDto,
    user?: AuthUser,
  ): Promise<FeeSetting> {
    const current = await this.findOne(id);
    const { name, ...feeDto } = dto;
    // Merge current + patch into the full effective fee set so the row and the
    // history snapshot stay in lockstep.
    const fees = mergeFees(current, feeDto);
    try {
      const [updated] = await this.prisma.$transaction([
        this.prisma.feeSetting.update({
          where: { id },
          data: { ...fees, ...(name !== undefined ? { name } : {}) },
        }),
        this.prisma.feeSettingHistory.create({
          data: {
            feeSettingId: id,
            ...fees,
            changedById: user?.id ?? null,
            changedByName: user?.name ?? null,
          },
        }),
      ]);
      return updated;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(NAME_TAKEN);
      throw e;
    }
  }

  async setDefault(id: number): Promise<FeeSetting> {
    await this.findOne(id);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.feeSetting.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      }),
      this.prisma.feeSetting.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    return updated;
  }

  async remove(id: number): Promise<{ message: string }> {
    const target = await this.findOne(id);
    if (target.isDefault) throw new ConflictException(DELETE_DEFAULT);

    const total = await this.prisma.feeSetting.count();
    if (total <= 1) throw new ConflictException(DELETE_LAST);

    const roomsUsing = await this.prisma.room.count({
      where: { feeSettingId: id },
    });
    if (roomsUsing > 0) throw new ConflictException(DELETE_IN_USE);

    await this.prisma.feeSetting.delete({ where: { id } });
    return { message: 'Đã xoá loại phí' };
  }

  async getHistory(feeSettingId: number): Promise<FeeSettingHistory[]> {
    await this.findOne(feeSettingId);
    return this.prisma.feeSettingHistory.findMany({
      where: { feeSettingId },
      orderBy: { changedAt: 'desc' },
    });
  }
}
