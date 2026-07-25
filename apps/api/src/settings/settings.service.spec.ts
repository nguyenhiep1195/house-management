/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  const prisma = {
    feeSetting: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    feeSettingHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    room: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  const setting = {
    id: 1,
    name: 'Loại I',
    isDefault: true,
    electricityUnitPrice: 3500,
    waterUnitPrice: 15000,
    internetFee: 100000,
    elevatorFeePerPerson: 30000,
    cleaningFeePerPerson: 20000,
    motorbikeFeePerExtra: 100000,
    freeMotorbikeCount: 2,
    otherFee: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  it('lists fee types default-first', async () => {
    prisma.feeSetting.findMany.mockResolvedValue([setting]);
    await service.list();
    expect(prisma.feeSetting.findMany).toHaveBeenCalledWith({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('getDefault returns the flagged default', async () => {
    prisma.feeSetting.findFirst.mockResolvedValue(setting);
    await expect(service.getDefault()).resolves.toEqual(setting);
    expect(prisma.feeSetting.create).not.toHaveBeenCalled();
  });

  it('getDefault seeds "Loại I" when the table is empty', async () => {
    prisma.feeSetting.findFirst.mockResolvedValue(null);
    prisma.feeSetting.create.mockResolvedValue(setting);
    await expect(service.getDefault()).resolves.toEqual(setting);
    expect(prisma.feeSetting.create).toHaveBeenCalledWith({
      data: { name: 'Loại I', isDefault: true },
    });
  });

  it('resolve prefers an explicit id, falling back to default', async () => {
    prisma.feeSetting.findUnique.mockResolvedValue(setting);
    await expect(service.resolve(1)).resolves.toEqual(setting);
    expect(prisma.feeSetting.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('updates a fee type by id, writing the full merged fee set + history', async () => {
    const updated = { ...setting, electricityUnitPrice: 4000 };
    prisma.feeSetting.findUnique.mockResolvedValue(setting);
    prisma.feeSetting.update.mockReturnValue('updateOp');
    prisma.feeSettingHistory.create.mockReturnValue('historyOp');
    prisma.$transaction.mockResolvedValue([updated, {}]);

    const result = await service.update(1, { electricityUnitPrice: 4000 });
    expect(prisma.feeSetting.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        electricityUnitPrice: 4000,
        waterUnitPrice: 15000,
        internetFee: 100000,
        elevatorFeePerPerson: 30000,
        cleaningFeePerPerson: 20000,
        motorbikeFeePerExtra: 100000,
        freeMotorbikeCount: 2,
        otherFee: 0,
      },
    });
    expect(result.electricityUnitPrice).toBe(4000);
    expect(prisma.$transaction).toHaveBeenCalledWith(['updateOp', 'historyOp']);
  });

  it('snapshots the changer into history', async () => {
    prisma.feeSetting.findUnique.mockResolvedValue(setting);
    prisma.$transaction.mockResolvedValue([setting, {}]);

    await service.update(
      1,
      { electricityUnitPrice: 4000 },
      {
        id: 7,
        username: 'admin',
        email: null,
        name: 'Quản trị viên',
        phone: null,
        role: 'ADMIN' as never,
      },
    );

    expect(prisma.feeSettingHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feeSettingId: 1,
        electricityUnitPrice: 4000,
        changedById: 7,
        changedByName: 'Quản trị viên',
      }),
    });
  });

  it('refuses to delete the default fee type', async () => {
    prisma.feeSetting.findUnique.mockResolvedValue(setting);
    await expect(service.remove(1)).rejects.toThrow(ConflictException);
    expect(prisma.feeSetting.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a fee type still used by rooms', async () => {
    prisma.feeSetting.findUnique.mockResolvedValue({
      ...setting,
      isDefault: false,
    });
    prisma.feeSetting.count.mockResolvedValue(3);
    prisma.room.count.mockResolvedValue(2);
    await expect(service.remove(1)).rejects.toThrow(ConflictException);
    expect(prisma.feeSetting.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused non-default fee type', async () => {
    prisma.feeSetting.findUnique.mockResolvedValue({
      ...setting,
      isDefault: false,
    });
    prisma.feeSetting.count.mockResolvedValue(3);
    prisma.room.count.mockResolvedValue(0);
    prisma.feeSetting.delete.mockResolvedValue({});
    await service.remove(1);
    expect(prisma.feeSetting.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('returns per-type history newest-first', async () => {
    prisma.feeSetting.findUnique.mockResolvedValue(setting);
    prisma.feeSettingHistory.findMany.mockResolvedValue([]);
    await service.getHistory(1);
    expect(prisma.feeSettingHistory.findMany).toHaveBeenCalledWith({
      where: { feeSettingId: 1 },
      orderBy: { changedAt: 'desc' },
    });
  });
});
