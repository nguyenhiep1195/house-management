import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  const prisma = {
    setting: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    settingHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const setting = {
    id: 1,
    electricityUnitPrice: 3500,
    waterUnitPrice: 15000,
    internetFee: 100000,
    elevatorFeePerPerson: 30000,
    cleaningFeePerPerson: 20000,
    motorbikeFeePerExtra: 100000,
    freeMotorbikeCount: 2,
    otherFee: 0,
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

  it('returns the existing settings row', async () => {
    prisma.setting.findFirst.mockResolvedValue(setting);
    await expect(service.get()).resolves.toEqual(setting);
    expect(prisma.setting.create).not.toHaveBeenCalled();
  });

  it('creates a default row when the table is empty', async () => {
    prisma.setting.findFirst.mockResolvedValue(null);
    prisma.setting.create.mockResolvedValue(setting);
    await expect(service.get()).resolves.toEqual(setting);
    expect(prisma.setting.create).toHaveBeenCalledWith({ data: {} });
  });

  it('updates the settings row by id', async () => {
    const updated = { ...setting, electricityUnitPrice: 4000 };
    prisma.setting.findFirst.mockResolvedValue(setting);
    prisma.setting.update.mockReturnValue('updateOp');
    prisma.settingHistory.create.mockReturnValue('historyOp');
    prisma.$transaction.mockResolvedValue([updated, {}]);

    const result = await service.update({ electricityUnitPrice: 4000 });
    // Writes the full effective fee set (changed field + unchanged current values).
    expect(prisma.setting.update).toHaveBeenCalledWith({
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

  it('records a full fee snapshot (merged with current) plus who changed it', async () => {
    prisma.setting.findFirst.mockResolvedValue(setting);
    prisma.$transaction.mockResolvedValue([setting, {}]);

    await service.update(
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

    expect(prisma.settingHistory.create).toHaveBeenCalledWith({
      data: {
        electricityUnitPrice: 4000,
        waterUnitPrice: 15000,
        internetFee: 100000,
        elevatorFeePerPerson: 30000,
        cleaningFeePerPerson: 20000,
        motorbikeFeePerExtra: 100000,
        freeMotorbikeCount: 2,
        otherFee: 0,
        changedById: 7,
        changedByName: 'Quản trị viên',
      },
    });
  });

  it('stores a null changer when no user is provided', async () => {
    prisma.setting.findFirst.mockResolvedValue(setting);
    prisma.$transaction.mockResolvedValue([setting, {}]);

    await service.update({ otherFee: 5000 });

    expect(prisma.settingHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          otherFee: 5000,
          changedById: null,
          changedByName: null,
        }),
      }),
    );
  });

  it('returns history newest-first', async () => {
    prisma.settingHistory.findMany.mockResolvedValue([]);
    await service.getHistory();
    expect(prisma.settingHistory.findMany).toHaveBeenCalledWith({
      orderBy: { changedAt: 'desc' },
    });
  });
});
