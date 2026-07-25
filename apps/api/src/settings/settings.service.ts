import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/types/auth-user';
import { Setting, SettingHistory } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Setting> {
    const existing = await this.prisma.setting.findFirst();
    if (existing) return existing;
    return this.prisma.setting.create({ data: {} });
  }

  async update(dto: UpdateSettingDto, user?: AuthUser): Promise<Setting> {
    const current = await this.get();
    // Merge current + patch into the full effective fee set. Writing every field
    // (not just the changed subset) keeps the row and the history snapshot in
    // lockstep and avoids partial-update edge cases.
    const fees = {
      electricityUnitPrice: dto.electricityUnitPrice ?? current.electricityUnitPrice,
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
    const [updated] = await this.prisma.$transaction([
      this.prisma.setting.update({ where: { id: current.id }, data: fees }),
      this.prisma.settingHistory.create({
        data: {
          ...fees,
          changedById: user?.id ?? null,
          changedByName: user?.name ?? null,
        },
      }),
    ]);
    return updated;
  }

  getHistory(): Promise<SettingHistory[]> {
    return this.prisma.settingHistory.findMany({
      orderBy: { changedAt: 'desc' },
    });
  }
}
