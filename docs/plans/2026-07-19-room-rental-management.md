# Room Rental Management (Quản lý phòng trọ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD phòng trọ / người thuê / hợp đồng, hoá đơn hàng tháng (tự động + thủ công, duy nhất 1 hoá đơn/phòng/tháng), bảng cài đặt đơn giá, và cập nhật chỉ số điện nước hàng loạt.

**Architecture:** Backend NestJS 11 + Prisma 7 (MySQL) thêm 5 model mới (`Setting`, `Room`, `Tenant`, `Contract`, `Invoice`) và 5 module mới theo đúng pattern của `users` module (global `JwtAuthGuard`, DTO class-validator, `SAFE_*_SELECT`). Frontend Next.js 16 thêm 4 feature mới (`rooms`, `tenants`, `contracts`, `invoices`) + fee settings, theo đúng pattern `features/users` (Server Actions + `apiFetch` + shadcn/ui table/dialog). Hoá đơn được sinh tự động bằng cron (`@nestjs/schedule`) chạy vào ngày cuối cùng của tháng.

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-mariadb`), MySQL, class-validator, Jest 30, @nestjs/schedule; Next.js 16.2 (App Router, RSC), React 19, Tailwind v4, shadcn/ui, sonner.

## Global Constraints

- Monorepo KHÔNG có root workspace — chạy lệnh pnpm bên trong `apps/api` hoặc `apps/web`.
- `apps/api` có nested `.git` riêng: **commit backend bên trong `apps/api`**, commit frontend ở repo root. Luôn kiểm tra `pwd` trước khi chạy git.
- Mọi user-facing copy là **tiếng Việt**; code/comment/identifier tiếng Anh.
- Tiền tệ VND lưu là `Int` (đồng), format hiển thị bằng `Intl.NumberFormat("vi-VN")`.
- Backend: mọi endpoint mặc định authenticated (global `JwtAuthGuard`); KHÔNG endpoint nào của feature này dùng `@Public()`. `PATCH /settings` giới hạn `@Roles(Role.ADMIN)`.
- Backend: mọi input qua DTO class-validator (global `ValidationPipe` với `whitelist: true, transform: true`); DB access chỉ qua Prisma; error message tiếng Việt, không leak stack trace.
- Frontend: KHÔNG thư viện validate form (không zod) — HTML5 attributes + server-side; token đọc bằng `getSessionToken()` và truyền vào `apiFetch`; mọi trang admin check `getCurrentUser()` server-side.
- Xe máy: miễn phí `freeMotorbikeCount` (mặc định 2) xe, mỗi xe vượt tính `motorbikeFeePerExtra` (mặc định 100.000đ).
- Hoá đơn: unique theo `(roomId, year, month)`; điện/nước = (chỉ số kỳ này − chỉ số kỳ trước) × đơn giá; đơn giá load từ bảng `settings` tại thời điểm tạo và **snapshot vào hoá đơn**.
- Interpretasi "ngày tạo hoá đơn vào ngày cuối cùng của tháng trước": cron chạy 23:00 ngày cuối tháng M, sinh hoá đơn kỳ tháng M cho mọi phòng `OCCUPIED` chưa có hoá đơn tháng đó (người thuê thanh toán đầu tháng M+1).
- Prisma client được generate vào `apps/api/src/generated` (CJS) — sau khi sửa schema phải chạy `pnpm prisma migrate dev` (tự generate lại client).

## Thiết kế DB (tổng quan quan hệ)

```
Setting (1 row)   — đơn giá điện/nước, phí internet, thang máy + vệ sinh theo người, phí xe vượt, phí khác
Room 1—n Tenant   — tenant.roomId nullable (SetNull khi xoá phòng)
Room 1—n Contract — contract snapshot giá phòng; tạo/kích hoạt HĐ đồng bộ giá + trạng thái phòng
Room 1—n Invoice  — unique (roomId, year, month); snapshot toàn bộ đơn giá & chỉ số
User              — đã tồn tại (CRUD admin đã có sẵn ở users module — không làm lại)
```

Trạng thái: `RoomStatus = AVAILABLE | OCCUPIED | MAINTENANCE`; `ContractStatus = ACTIVE | EXPIRED | TERMINATED`; `InvoiceStatus = UNPAID | PAID`; `PaymentMethod = CASH | TRANSFER`.

Chỉ số điện nước: `Room.electricityReading/waterReading` là chỉ số hiện tại (khởi tạo = `initialElectricityReading/initialWaterReading` nhập khi tạo phòng). Khi tạo hoá đơn tháng M: `prev` = `electricityCurrent` của hoá đơn gần nhất trước đó, nếu chưa có hoá đơn nào thì `prev` = `initial*Reading`; `current` = chỉ số hiện tại trên phòng.

---
### Task 1: Prisma schema — Setting, Room, Tenant, Contract, Invoice + seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/migrations/<timestamp>_add_rental_models/` (do `prisma migrate dev` sinh ra)

**Interfaces:**
- Produces: Prisma models `setting`, `room`, `tenant`, `contract`, `invoice` trên `PrismaService`; enums `RoomStatus`, `ContractStatus`, `InvoiceStatus`, `PaymentMethod` import từ `../generated/enums` (cùng chỗ với `Role`).

- [ ] **Step 1: Thêm enums + models vào cuối `apps/api/prisma/schema.prisma`**

```prisma
enum RoomStatus {
  AVAILABLE
  OCCUPIED
  MAINTENANCE
}

enum ContractStatus {
  ACTIVE
  EXPIRED
  TERMINATED
}

enum InvoiceStatus {
  UNPAID
  PAID
}

enum PaymentMethod {
  CASH
  TRANSFER
}

model Setting {
  id                   Int      @id @default(autoincrement())
  electricityUnitPrice Int      @default(3500)
  waterUnitPrice       Int      @default(15000)
  internetFee          Int      @default(100000)
  elevatorFeePerPerson Int      @default(30000)
  cleaningFeePerPerson Int      @default(20000)
  motorbikeFeePerExtra Int      @default(100000)
  freeMotorbikeCount   Int      @default(2)
  otherFee             Int      @default(0)
  updatedAt            DateTime @updatedAt

  @@map("settings")
}

model Room {
  id                        Int        @id @default(autoincrement())
  name                      String     @unique
  price                     Int
  status                    RoomStatus @default(AVAILABLE)
  occupantCount             Int        @default(0)
  motorbikeCount            Int        @default(0)
  internetEnabled           Boolean    @default(true)
  initialElectricityReading Int        @default(0)
  initialWaterReading       Int        @default(0)
  electricityReading        Int        @default(0)
  waterReading              Int        @default(0)
  createdAt                 DateTime   @default(now())
  updatedAt                 DateTime   @updatedAt
  tenants                   Tenant[]
  contracts                 Contract[]
  invoices                  Invoice[]

  @@map("rooms")
}

model Tenant {
  id           Int      @id @default(autoincrement())
  fullName     String
  idCardNumber String   @unique
  dateOfBirth  DateTime
  hometown     String
  roomId       Int?
  room         Room?    @relation(fields: [roomId], references: [id], onDelete: SetNull)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([roomId])
  @@map("tenants")
}

model Contract {
  id        Int            @id @default(autoincrement())
  roomId    Int
  room      Room           @relation(fields: [roomId], references: [id], onDelete: Cascade)
  price     Int
  deposit   Int            @default(0)
  startDate DateTime
  endDate   DateTime
  status    ContractStatus @default(ACTIVE)
  note      String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([roomId])
  @@map("contracts")
}

model Invoice {
  id                   Int            @id @default(autoincrement())
  roomId               Int
  room                 Room           @relation(fields: [roomId], references: [id], onDelete: Cascade)
  month                Int
  year                 Int
  roomPrice            Int
  electricityPrev      Int
  electricityCurrent   Int
  electricityUnitPrice Int
  waterPrev            Int
  waterCurrent         Int
  waterUnitPrice       Int
  internetFee          Int
  elevatorFee          Int
  cleaningFee          Int
  motorbikeFee         Int
  otherFee             Int
  occupantCount        Int
  motorbikeCount       Int
  totalAmount          Int
  status               InvoiceStatus  @default(UNPAID)
  paymentMethod        PaymentMethod?
  paidAt               DateTime?
  createdAt            DateTime       @default(now())

  @@unique([roomId, year, month])
  @@index([year, month])
  @@map("invoices")
}
```

- [ ] **Step 2: Chạy migration (MySQL phải đang chạy: `docker compose up -d` ở repo root)**

Run (trong `apps/api`): `pnpm prisma migrate dev --name add_rental_models`
Expected: migration mới trong `prisma/migrations/`, client generate lại vào `src/generated/`, không lỗi.

- [ ] **Step 3: Seed 1 dòng settings mặc định — thêm vào `apps/api/prisma/seed.ts`, trong `main()` ngay trước khối `finally`** (sau đoạn seed admin, dùng chung `prisma` instance):

```typescript
    const settingCount = await prisma.setting.count();
    if (settingCount === 0) {
      await prisma.setting.create({ data: {} });
      console.log('Seeded default settings');
    } else {
      console.log('Settings already exist, skipping seed');
    }
```

Lưu ý: khối seed admin hiện tại có `return` sớm khi admin đã tồn tại — đổi `return` đó thành `console.log(...)` không return, để phần seed settings luôn chạy. Cấu trúc sau khi sửa:

```typescript
  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log(`Admin "${username}" already exists, skipping seed`);
    } else {
      await prisma.user.create({
        data: {
          username,
          email,
          password: await bcrypt.hash(password, SALT_ROUNDS),
          name: 'Quản trị viên',
          role: 'ADMIN',
        },
      });
      console.log(`Seeded admin "${username}"`);
    }

    const settingCount = await prisma.setting.count();
    if (settingCount === 0) {
      await prisma.setting.create({ data: {} });
      console.log('Seeded default settings');
    } else {
      console.log('Settings already exist, skipping seed');
    }
  } finally {
    await prisma.$disconnect();
  }
```

- [ ] **Step 4: Chạy seed + verify**

Run (trong `apps/api`): `pnpm prisma db seed`
Expected: in ra `Seeded default settings` (hoặc skipping nếu chạy lại).
Run: `pnpm build` — Expected: build pass (client mới có đủ model).

- [ ] **Step 5: Commit (trong `apps/api` — nested git repo)**

```bash
cd apps/api
git add prisma/schema.prisma prisma/seed.ts prisma/migrations
git commit -m "feat(db): add rental models (setting, room, tenant, contract, invoice)"
```

---
### Task 2: Settings module (API)

**Files:**
- Create: `apps/api/src/settings/settings.module.ts`
- Create: `apps/api/src/settings/settings.controller.ts`
- Create: `apps/api/src/settings/settings.service.ts`
- Create: `apps/api/src/settings/settings.service.spec.ts`
- Create: `apps/api/src/settings/dto/update-setting.dto.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `SettingsModule` vào `imports`)

**Interfaces:**
- Consumes: Prisma model `setting` (Task 1), `PrismaService`, `@Roles`/`Role`.
- Produces: `SettingsService.get(): Promise<Setting>` (tự tạo dòng default nếu bảng rỗng — các module sau gọi hàm này); `SettingsService.update(dto: UpdateSettingDto): Promise<Setting>`; HTTP `GET /settings` (mọi user đã đăng nhập), `PATCH /settings` (ADMIN). `SettingsModule` **exports `SettingsService`** để `InvoicesModule` import.

- [ ] **Step 1: Viết test fail — `apps/api/src/settings/settings.service.spec.ts`**

```typescript
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
    prisma.setting.findFirst.mockResolvedValue(setting);
    prisma.setting.update.mockResolvedValue({
      ...setting,
      electricityUnitPrice: 4000,
    });
    const result = await service.update({ electricityUnitPrice: 4000 });
    expect(prisma.setting.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { electricityUnitPrice: 4000 },
    });
    expect(result.electricityUnitPrice).toBe(4000);
  });
});
```

- [ ] **Step 2: Chạy test, verify fail**

Run (trong `apps/api`): `pnpm test settings.service.spec.ts`
Expected: FAIL — `Cannot find module './settings.service'`.

- [ ] **Step 3: Implement**

`apps/api/src/settings/dto/update-setting.dto.ts`:

```typescript
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSettingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  electricityUnitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  waterUnitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  internetFee?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  elevatorFeePerPerson?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cleaningFeePerPerson?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  motorbikeFeePerExtra?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  freeMotorbikeCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  otherFee?: number;
}
```

`apps/api/src/settings/settings.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Setting } from '../generated/client';
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

  async update(dto: UpdateSettingDto): Promise<Setting> {
    const current = await this.get();
    return this.prisma.setting.update({
      where: { id: current.id },
      data: { ...dto },
    });
  }
}
```

(Nếu type `Setting` không export từ `../generated/client`, import từ `../generated/models`.)

`apps/api/src/settings/settings.controller.ts`:

```typescript
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '../generated/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Roles(Role.ADMIN)
  @Patch()
  update(@Body() dto: UpdateSettingDto) {
    return this.settingsService.update(dto);
  }
}
```

`apps/api/src/settings/settings.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

Trong `apps/api/src/app.module.ts`: thêm `import { SettingsModule } from './settings/settings.module';` và thêm `SettingsModule` vào mảng `imports` (sau `UsersModule`).

- [ ] **Step 4: Chạy test, verify pass**

Run: `pnpm test settings.service.spec.ts` — Expected: PASS (3 tests).
Run: `pnpm lint` — Expected: không lỗi.

- [ ] **Step 5: Commit (trong `apps/api`)**

```bash
git add src/settings src/app.module.ts
git commit -m "feat(api): settings module with fee unit prices"
```

---
### Task 3: Tenants module (API)

**Files:**
- Create: `apps/api/src/tenants/tenants.module.ts`
- Create: `apps/api/src/tenants/tenants.controller.ts`
- Create: `apps/api/src/tenants/tenants.service.ts`
- Create: `apps/api/src/tenants/tenants.service.spec.ts`
- Create: `apps/api/src/tenants/dto/create-tenant.dto.ts`
- Create: `apps/api/src/tenants/dto/update-tenant.dto.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `TenantsModule`)

**Interfaces:**
- Consumes: Prisma model `tenant`, `room` (Task 1).
- Produces: HTTP `GET /tenants` (query `?roomId=` optional), `POST /tenants`, `PATCH /tenants/:id`, `DELETE /tenants/:id`. Tenant trả về kèm `room: { id, name } | null`.

- [ ] **Step 1: Viết test fail — `apps/api/src/tenants/tenants.service.spec.ts`**

```typescript
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  let service: TenantsService;
  const prisma = {
    tenant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    room: { findUnique: jest.fn() },
  };

  const tenant = {
    id: 1,
    fullName: 'Nguyễn Văn A',
    idCardNumber: '012345678901',
    dateOfBirth: new Date('1998-01-15'),
    hometown: 'Hà Nội',
    roomId: null,
    room: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TenantsService);
  });

  it('lists tenants including their room', async () => {
    prisma.tenant.findMany.mockResolvedValue([tenant]);
    await service.findAll(undefined);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      include: { room: { select: { id: true, name: true } } },
    });
  });

  it('filters tenants by roomId', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    await service.findAll(3);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 3 } }),
    );
  });

  it('rejects a duplicate id card number', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    await expect(
      service.create({
        fullName: 'B',
        idCardNumber: '012345678901',
        dateOfBirth: '1998-01-15',
        hometown: 'Hà Nội',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects assignment to a non-existent room', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        fullName: 'B',
        idCardNumber: '999',
        dateOfBirth: '1998-01-15',
        hometown: 'Hà Nội',
        roomId: 99,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a tenant with parsed dateOfBirth', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue(tenant);
    await service.create({
      fullName: 'Nguyễn Văn A',
      idCardNumber: '012345678901',
      dateOfBirth: '1998-01-15',
      hometown: 'Hà Nội',
    });
    const args = prisma.tenant.create.mock.calls[0][0];
    expect(args.data.dateOfBirth).toBeInstanceOf(Date);
  });

  it('throws NotFoundException when updating a missing tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.update(99, { fullName: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes a tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.tenant.delete.mockResolvedValue(tenant);
    await expect(service.remove(1)).resolves.toHaveProperty('message');
  });
});
```

- [ ] **Step 2: Chạy test, verify fail**

Run: `pnpm test tenants.service.spec.ts` — Expected: FAIL `Cannot find module './tenants.service'`.

- [ ] **Step 3: Implement**

`apps/api/src/tenants/dto/create-tenant.dto.ts`:

```typescript
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @Matches(/^\d{9,12}$/, { message: 'Số CCCD phải gồm 9-12 chữ số' })
  idCardNumber!: string;

  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth!: string;

  @IsString()
  @MinLength(1)
  hometown!: string;

  @IsOptional()
  @IsInt()
  roomId?: number;
}
```

`apps/api/src/tenants/dto/update-tenant.dto.ts`:

```typescript
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @Matches(/^\d{9,12}$/, { message: 'Số CCCD phải gồm 9-12 chữ số' })
  idCardNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  hometown?: string;

  // null = rời phòng (gỡ khỏi phòng hiện tại)
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  roomId?: number | null;
}
```

`apps/api/src/tenants/tenants.service.ts`:

```typescript
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
```

`apps/api/src/tenants/tenants.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll(
    @Query('roomId', new ParseIntPipe({ optional: true })) roomId?: number,
  ) {
    return this.tenantsService.findAll(roomId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}
```

`apps/api/src/tenants/tenants.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
```

Thêm `TenantsModule` vào `imports` của `app.module.ts`.

- [ ] **Step 4: Chạy test + lint, verify pass**

Run: `pnpm test tenants.service.spec.ts` — Expected: PASS (7 tests). Run: `pnpm lint`.

- [ ] **Step 5: Commit (trong `apps/api`)**

```bash
git add src/tenants src/app.module.ts
git commit -m "feat(api): tenants CRUD module"
```

---
### Task 4: Rooms module + cập nhật chỉ số hàng loạt (API)

**Files:**
- Create: `apps/api/src/rooms/rooms.module.ts`
- Create: `apps/api/src/rooms/rooms.controller.ts`
- Create: `apps/api/src/rooms/rooms.service.ts`
- Create: `apps/api/src/rooms/rooms.service.spec.ts`
- Create: `apps/api/src/rooms/dto/create-room.dto.ts`
- Create: `apps/api/src/rooms/dto/update-room.dto.ts`
- Create: `apps/api/src/rooms/dto/bulk-update-readings.dto.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `RoomsModule`)

**Interfaces:**
- Consumes: Prisma models `room`, `tenant`, `contract`, `invoice`; enum `RoomStatus`.
- Produces: HTTP `GET /rooms` (kèm `_count.tenants`), `GET /rooms/:id` (kèm `tenants`, `contracts`, `invoices` — dùng cho trang detail), `POST /rooms`, `PATCH /rooms/:id`, `DELETE /rooms/:id`, `PATCH /rooms/meter-readings` (bulk). Bulk body: `{ items: [{ roomId, electricityReading, waterReading }] }`, mỗi chỉ số mới phải ≥ chỉ số hiện tại của phòng. **Lưu ý route:** khai báo `@Patch('meter-readings')` TRƯỚC `@Patch(':id')` để không bị nuốt route.

- [ ] **Step 1: Viết test fail — `apps/api/src/rooms/rooms.service.spec.ts`**

```typescript
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  let service: RoomsService;
  const prisma = {
    room: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const room = {
    id: 1,
    name: 'P101',
    price: 3000000,
    status: 'AVAILABLE',
    occupantCount: 2,
    motorbikeCount: 1,
    internetEnabled: true,
    initialElectricityReading: 100,
    initialWaterReading: 10,
    electricityReading: 100,
    waterReading: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('rejects a duplicate room name', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    await expect(
      service.create({
        name: 'P101',
        price: 3000000,
        initialElectricityReading: 0,
        initialWaterReading: 0,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates a room with readings initialized from initial readings', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    prisma.room.create.mockResolvedValue(room);
    await service.create({
      name: 'P101',
      price: 3000000,
      initialElectricityReading: 100,
      initialWaterReading: 10,
    });
    const args = prisma.room.create.mock.calls[0][0];
    expect(args.data.electricityReading).toBe(100);
    expect(args.data.waterReading).toBe(10);
  });

  it('throws NotFoundException for a missing room on detail', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('rejects bulk readings lower than the current reading', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    await expect(
      service.bulkUpdateReadings({
        items: [{ roomId: 1, electricityReading: 50, waterReading: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects bulk update containing an unknown room', async () => {
    prisma.room.findMany.mockResolvedValue([]);
    await expect(
      service.bulkUpdateReadings({
        items: [{ roomId: 99, electricityReading: 1, waterReading: 1 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates all readings in one transaction', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.$transaction.mockResolvedValue([]);
    await service.bulkUpdateReadings({
      items: [{ roomId: 1, electricityReading: 150, waterReading: 15 }],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Chạy test, verify fail**

Run: `pnpm test rooms.service.spec.ts` — Expected: FAIL `Cannot find module './rooms.service'`.

- [ ] **Step 3: Implement**

`apps/api/src/rooms/dto/create-room.dto.ts`:

```typescript
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { RoomStatus } from '../../generated/enums';

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  occupantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  motorbikeCount?: number;

  @IsOptional()
  @IsBoolean()
  internetEnabled?: boolean;

  @IsInt()
  @Min(0)
  initialElectricityReading!: number;

  @IsInt()
  @Min(0)
  initialWaterReading!: number;
}
```

`apps/api/src/rooms/dto/update-room.dto.ts`:

```typescript
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { RoomStatus } from '../../generated/enums';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  occupantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  motorbikeCount?: number;

  @IsOptional()
  @IsBoolean()
  internetEnabled?: boolean;
}
```

`apps/api/src/rooms/dto/bulk-update-readings.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class MeterReadingItemDto {
  @IsInt()
  roomId!: number;

  @IsInt()
  @Min(0)
  electricityReading!: number;

  @IsInt()
  @Min(0)
  waterReading!: number;
}

export class BulkUpdateReadingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MeterReadingItemDto)
  items!: MeterReadingItemDto[];
}
```

`apps/api/src/rooms/rooms.service.ts`:

```typescript
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
```

`apps/api/src/rooms/rooms.controller.ts` (chú ý thứ tự route):

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { BulkUpdateReadingsDto } from './dto/bulk-update-readings.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  // MUST be declared before ':id' routes
  @Patch('meter-readings')
  bulkUpdateReadings(@Body() dto: BulkUpdateReadingsDto) {
    return this.roomsService.bulkUpdateReadings(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoomDto) {
    return this.roomsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.remove(id);
  }
}
```

`apps/api/src/rooms/rooms.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
```

Thêm `RoomsModule` vào `imports` của `app.module.ts`.

- [ ] **Step 4: Chạy test + lint, verify pass**

Run: `pnpm test rooms.service.spec.ts` — Expected: PASS (6 tests). Run: `pnpm lint`.

- [ ] **Step 5: Commit (trong `apps/api`)**

```bash
git add src/rooms src/app.module.ts
git commit -m "feat(api): rooms CRUD module with bulk meter-reading update"
```

---
### Task 5: Contracts module (API)

**Files:**
- Create: `apps/api/src/contracts/contracts.module.ts`
- Create: `apps/api/src/contracts/contracts.controller.ts`
- Create: `apps/api/src/contracts/contracts.service.ts`
- Create: `apps/api/src/contracts/contracts.service.spec.ts`
- Create: `apps/api/src/contracts/dto/create-contract.dto.ts`
- Create: `apps/api/src/contracts/dto/update-contract.dto.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `ContractsModule`)

**Interfaces:**
- Consumes: Prisma models `contract`, `room`; enum `ContractStatus`, `RoomStatus`.
- Produces: HTTP `GET /contracts` (query `?roomId=` optional, kèm `room: {id, name}`), `POST /contracts`, `PATCH /contracts/:id`, `DELETE /contracts/:id`.
- Business rules ("giá phòng match sang thông tin phòng"): tạo hợp đồng `ACTIVE` → set `room.status = OCCUPIED` và `room.price = contract.price` (trong 1 transaction); một phòng chỉ có tối đa 1 hợp đồng `ACTIVE`; đổi status hợp đồng sang `EXPIRED`/`TERMINATED` → nếu phòng không còn hợp đồng ACTIVE nào khác, set `room.status = AVAILABLE`; sửa `price` của hợp đồng ACTIVE → đồng bộ `room.price`.

- [ ] **Step 1: Viết test fail — `apps/api/src/contracts/contracts.service.spec.ts`**

```typescript
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  let service: ContractsService;
  const tx = {
    contract: { create: jest.fn(), update: jest.fn() },
    room: { update: jest.fn() },
  };
  const prisma = {
    contract: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    room: { findUnique: jest.fn() },
    $transaction: jest.fn(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  };

  const room = { id: 1, name: 'P101', price: 3000000, status: 'AVAILABLE' };
  const contract = {
    id: 1,
    roomId: 1,
    price: 3200000,
    deposit: 3000000,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-07-01'),
    status: 'ACTIVE',
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ContractsService);
  });

  it('rejects a contract for a non-existent room', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        roomId: 99,
        price: 1,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects endDate before startDate', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    await expect(
      service.create({
        roomId: 1,
        price: 1,
        startDate: '2027-07-01',
        endDate: '2026-07-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a second ACTIVE contract on the same room', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.contract.findFirst.mockResolvedValue(contract);
    await expect(
      service.create({
        roomId: 1,
        price: 1,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates an ACTIVE contract and syncs room price + status', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.contract.findFirst.mockResolvedValue(null);
    tx.contract.create.mockResolvedValue(contract);
    await service.create({
      roomId: 1,
      price: 3200000,
      deposit: 3000000,
      startDate: '2026-07-01',
      endDate: '2027-07-01',
    });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'OCCUPIED', price: 3200000 },
    });
  });

  it('releases the room when the last ACTIVE contract is terminated', async () => {
    prisma.contract.findUnique.mockResolvedValue(contract);
    tx.contract.update.mockResolvedValue({
      ...contract,
      status: 'TERMINATED',
    });
    prisma.contract.findFirst.mockResolvedValue(null); // no other ACTIVE
    await service.update(1, { status: 'TERMINATED' });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'AVAILABLE' },
    });
  });

  it('deletes a contract', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      ...contract,
      status: 'EXPIRED',
    });
    prisma.contract.delete.mockResolvedValue(contract);
    await expect(service.remove(1)).resolves.toHaveProperty('message');
  });
});
```

- [ ] **Step 2: Chạy test, verify fail**

Run: `pnpm test contracts.service.spec.ts` — Expected: FAIL `Cannot find module './contracts.service'`.

- [ ] **Step 3: Implement**

`apps/api/src/contracts/dto/create-contract.dto.ts`:

```typescript
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateContractDto {
  @IsInt()
  roomId!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  startDate!: string;

  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  endDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
```

`apps/api/src/contracts/dto/update-contract.dto.ts`:

```typescript
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ContractStatus } from '../../generated/enums';

export class UpdateContractDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  endDate?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
```

`apps/api/src/contracts/contracts.service.ts`:

```typescript
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
          startDate: start,
          endDate: end,
          note: dto.note,
        },
        include: CONTRACT_INCLUDE,
      });
      await tx.room.update({
        where: { id: dto.roomId },
        data: { status: 'OCCUPIED', price: dto.price },
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
        const otherActive = await this.prisma.contract.findFirst({
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
```

`apps/api/src/contracts/contracts.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  findAll(
    @Query('roomId', new ParseIntPipe({ optional: true })) roomId?: number,
  ) {
    return this.contractsService.findAll(roomId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contractsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.remove(id);
  }
}
```

`apps/api/src/contracts/contracts.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
```

Thêm `ContractsModule` vào `imports` của `app.module.ts`.

- [ ] **Step 4: Chạy test + lint, verify pass**

Run: `pnpm test contracts.service.spec.ts` — Expected: PASS (6 tests). Run: `pnpm lint`.

- [ ] **Step 5: Commit (trong `apps/api`)**

```bash
git add src/contracts src/app.module.ts
git commit -m "feat(api): contracts CRUD with room price/status sync"
```

---
### Task 6: Invoices module + cron tự động (API)

**Files:**
- Create: `apps/api/src/invoices/invoices.module.ts`
- Create: `apps/api/src/invoices/invoices.controller.ts`
- Create: `apps/api/src/invoices/invoices.service.ts`
- Create: `apps/api/src/invoices/invoices.service.spec.ts`
- Create: `apps/api/src/invoices/invoices.cron.ts`
- Create: `apps/api/src/invoices/dto/create-invoice.dto.ts`
- Create: `apps/api/src/invoices/dto/generate-invoices.dto.ts`
- Create: `apps/api/src/invoices/dto/pay-invoice.dto.ts`
- Modify: `apps/api/src/app.module.ts` (thêm `ScheduleModule.forRoot()` + `InvoicesModule`)
- Modify: `apps/api/package.json` (thêm dependency `@nestjs/schedule`)

**Interfaces:**
- Consumes: `SettingsService.get()` (Task 2 — import `SettingsModule`); Prisma models `invoice`, `room`.
- Produces:
  - HTTP `GET /invoices?year=&month=&roomId=` (kèm `room: {id, name}`), `POST /invoices` (tạo thủ công 1 phòng: `{ roomId, month, year }`), `POST /invoices/generate` (`{ month, year }` — sinh cho mọi phòng OCCUPIED chưa có hoá đơn, trả `{ created, skipped }`), `PATCH /invoices/:id/pay` (`{ paymentMethod: 'CASH' | 'TRANSFER' }` → status PAID + paidAt), `PATCH /invoices/:id/unpay` (hoàn tác), `DELETE /invoices/:id` (chỉ khi UNPAID).
  - `InvoicesService.generateForMonth(month: number, year: number): Promise<{ created: number; skipped: number }>` — cron dùng lại hàm này.
  - `InvoicesCron.handleEndOfMonth()` — `@Cron('0 0 23 28-31 * *')`, chỉ chạy tiếp nếu hôm nay là ngày cuối tháng; sinh hoá đơn cho tháng hiện tại.
- Công thức tính (đơn giá snapshot từ Setting tại thời điểm tạo):
  - `electricityAmount = (electricityCurrent − electricityPrev) × electricityUnitPrice`
  - `waterAmount = (waterCurrent − waterPrev) × waterUnitPrice`
  - `internetFee = room.internetEnabled ? setting.internetFee : 0`
  - `elevatorFee = room.occupantCount × setting.elevatorFeePerPerson`
  - `cleaningFee = room.occupantCount × setting.cleaningFeePerPerson`
  - `motorbikeFee = max(0, room.motorbikeCount − setting.freeMotorbikeCount) × setting.motorbikeFeePerExtra`
  - `totalAmount = room.price + electricityAmount + waterAmount + internetFee + elevatorFee + cleaningFee + motorbikeFee + setting.otherFee`
  - `prev` readings = hoá đơn gần nhất trước đó của phòng (`orderBy year desc, month desc`, lấy bản ghi có `(year, month)` nhỏ hơn kỳ đang tạo) → `electricityCurrent/waterCurrent`; nếu không có → `room.initialElectricityReading/initialWaterReading`. `current` = `room.electricityReading/waterReading`.

- [ ] **Step 1: Cài `@nestjs/schedule`**

Run (trong `apps/api`): `pnpm add @nestjs/schedule`
Expected: cài thành công, tương thích NestJS 11.

- [ ] **Step 2: Viết test fail — `apps/api/src/invoices/invoices.service.spec.ts`**

```typescript
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  let service: InvoicesService;
  const prisma = {
    invoice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    room: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const settings = { get: jest.fn() };

  const setting = {
    id: 1,
    electricityUnitPrice: 3500,
    waterUnitPrice: 15000,
    internetFee: 100000,
    elevatorFeePerPerson: 30000,
    cleaningFeePerPerson: 20000,
    motorbikeFeePerExtra: 100000,
    freeMotorbikeCount: 2,
    otherFee: 50000,
    updatedAt: new Date(),
  };

  const room = {
    id: 1,
    name: 'P101',
    price: 3000000,
    status: 'OCCUPIED',
    occupantCount: 2,
    motorbikeCount: 3,
    internetEnabled: true,
    initialElectricityReading: 100,
    initialWaterReading: 10,
    electricityReading: 250,
    waterReading: 22,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    settings.get.mockResolvedValue(setting);
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(InvoicesService);
  });

  it('rejects a duplicate invoice for the same room and month', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue({ id: 9 });
    await expect(
      service.create({ roomId: 1, month: 7, year: 2026 }),
    ).rejects.toThrow(ConflictException);
  });

  it('computes all amounts from settings and meter deltas', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null); // no previous invoice
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );

    await service.create({ roomId: 1, month: 7, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];

    expect(data.electricityPrev).toBe(100); // initial reading (no prior invoice)
    expect(data.electricityCurrent).toBe(250);
    // (250-100)*3500 = 525000
    expect(data.electricityCurrent - data.electricityPrev).toBe(150);
    expect(data.waterPrev).toBe(10);
    expect(data.waterCurrent).toBe(22);
    expect(data.internetFee).toBe(100000);
    expect(data.elevatorFee).toBe(60000); // 2 người * 30000
    expect(data.cleaningFee).toBe(40000); // 2 người * 20000
    expect(data.motorbikeFee).toBe(100000); // (3-2)*100000
    expect(data.otherFee).toBe(50000);
    // 3000000 + 525000 + 12*15000(=180000) + 100000 + 60000 + 40000 + 100000 + 50000
    expect(data.totalAmount).toBe(4055000);
  });

  it('uses the previous invoice readings as prev when one exists', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue({
      electricityCurrent: 200,
      waterCurrent: 18,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 2, ...data }),
    );

    await service.create({ roomId: 1, month: 8, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];
    expect(data.electricityPrev).toBe(200);
    expect(data.waterPrev).toBe(18);
  });

  it('generateForMonth creates invoices only for OCCUPIED rooms without one', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique
      .mockResolvedValueOnce({ id: 5 }) // already has invoice -> skipped
      .mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.invoice.create.mockResolvedValue({ id: 6 });

    const result = await service.generateForMonth(7, 2026);
    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { status: 'OCCUPIED' },
    });
    expect(result).toEqual({ created: 0, skipped: 1 });
  });

  it('marks an invoice as paid with a payment method', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 1, status: 'UNPAID' });
    prisma.invoice.update.mockResolvedValue({ id: 1, status: 'PAID' });
    await service.pay(1, { paymentMethod: 'CASH' });
    const args = prisma.invoice.update.mock.calls[0][0];
    expect(args.data.status).toBe('PAID');
    expect(args.data.paymentMethod).toBe('CASH');
    expect(args.data.paidAt).toBeInstanceOf(Date);
  });

  it('refuses to delete a PAID invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 1, status: 'PAID' });
    await expect(service.remove(1)).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException for a missing invoice on pay', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(service.pay(9, { paymentMethod: 'CASH' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 3: Chạy test, verify fail**

Run: `pnpm test invoices.service.spec.ts` — Expected: FAIL `Cannot find module './invoices.service'`.

- [ ] **Step 4: Implement DTOs**

`apps/api/src/invoices/dto/create-invoice.dto.ts`:

```typescript
import { IsInt, Max, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsInt()
  roomId!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
```

`apps/api/src/invoices/dto/generate-invoices.dto.ts`:

```typescript
import { IsInt, Max, Min } from 'class-validator';

export class GenerateInvoicesDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
```

`apps/api/src/invoices/dto/pay-invoice.dto.ts`:

```typescript
import { IsEnum } from 'class-validator';
import { PaymentMethod } from '../../generated/enums';

export class PayInvoiceDto {
  @IsEnum(PaymentMethod, { message: 'Hình thức thanh toán không hợp lệ' })
  paymentMethod!: PaymentMethod;
}
```

- [ ] **Step 5: Implement service — `apps/api/src/invoices/invoices.service.ts`**

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';

const ROOM_NOT_FOUND = 'Không tìm thấy phòng';
const INVOICE_NOT_FOUND = 'Không tìm thấy hoá đơn';
const INVOICE_EXISTS = 'Phòng đã có hoá đơn cho tháng này';
const DELETE_PAID = 'Không thể xoá hoá đơn đã thanh toán';

const INVOICE_INCLUDE = {
  room: { select: { id: true, name: true } },
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  findAll(filter: { year?: number; month?: number; roomId?: number }) {
    return this.prisma.invoice.findMany({
      where: {
        ...(filter.year ? { year: filter.year } : {}),
        ...(filter.month ? { month: filter.month } : {}),
        ...(filter.roomId ? { roomId: filter.roomId } : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { roomId: 'asc' }],
      include: INVOICE_INCLUDE,
    });
  }

  async create(dto: CreateInvoiceDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });
    if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

    const existing = await this.prisma.invoice.findUnique({
      where: {
        roomId_year_month: {
          roomId: dto.roomId,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (existing) throw new ConflictException(INVOICE_EXISTS);

    const setting = await this.settingsService.get();

    // previous billing period: latest invoice strictly before (year, month)
    const previous = await this.prisma.invoice.findFirst({
      where: {
        roomId: dto.roomId,
        OR: [
          { year: { lt: dto.year } },
          { year: dto.year, month: { lt: dto.month } },
        ],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const electricityPrev =
      previous?.electricityCurrent ?? room.initialElectricityReading;
    const waterPrev = previous?.waterCurrent ?? room.initialWaterReading;
    const electricityCurrent = room.electricityReading;
    const waterCurrent = room.waterReading;

    const electricityAmount =
      (electricityCurrent - electricityPrev) * setting.electricityUnitPrice;
    const waterAmount = (waterCurrent - waterPrev) * setting.waterUnitPrice;
    const internetFee = room.internetEnabled ? setting.internetFee : 0;
    const elevatorFee = room.occupantCount * setting.elevatorFeePerPerson;
    const cleaningFee = room.occupantCount * setting.cleaningFeePerPerson;
    const motorbikeFee =
      Math.max(0, room.motorbikeCount - setting.freeMotorbikeCount) *
      setting.motorbikeFeePerExtra;

    const totalAmount =
      room.price +
      electricityAmount +
      waterAmount +
      internetFee +
      elevatorFee +
      cleaningFee +
      motorbikeFee +
      setting.otherFee;

    return this.prisma.invoice.create({
      data: {
        roomId: dto.roomId,
        month: dto.month,
        year: dto.year,
        roomPrice: room.price,
        electricityPrev,
        electricityCurrent,
        electricityUnitPrice: setting.electricityUnitPrice,
        waterPrev,
        waterCurrent,
        waterUnitPrice: setting.waterUnitPrice,
        internetFee,
        elevatorFee,
        cleaningFee,
        motorbikeFee,
        otherFee: setting.otherFee,
        occupantCount: room.occupantCount,
        motorbikeCount: room.motorbikeCount,
        totalAmount,
      },
      include: INVOICE_INCLUDE,
    });
  }

  async generateForMonth(
    month: number,
    year: number,
  ): Promise<{ created: number; skipped: number }> {
    const rooms = await this.prisma.room.findMany({
      where: { status: 'OCCUPIED' },
    });
    let created = 0;
    let skipped = 0;
    for (const room of rooms) {
      try {
        await this.create({ roomId: room.id, month, year });
        created += 1;
      } catch (e) {
        if (e instanceof ConflictException) {
          skipped += 1;
          continue;
        }
        throw e;
      }
    }
    return { created, skipped };
  }

  async pay(id: number, dto: PayInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentMethod: dto.paymentMethod,
        paidAt: new Date(),
      },
      include: INVOICE_INCLUDE,
    });
  }

  async unpay(id: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'UNPAID', paymentMethod: null, paidAt: null },
      include: INVOICE_INCLUDE,
    });
  }

  async remove(id: number): Promise<{ message: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (invoice.status === 'PAID') throw new ConflictException(DELETE_PAID);
    await this.prisma.invoice.delete({ where: { id } });
    return { message: 'Đã xoá hoá đơn' };
  }
}
```

Lưu ý: test dùng `service.create({...})` với object literal — nếu mock `generateForMonth` test expect `{created: 0, skipped: 1}` với 1 phòng bị skip, đảm bảo `findUnique` mock trả invoice tồn tại cho phòng đó (đã set trong test).

- [ ] **Step 6: Implement cron — `apps/api/src/invoices/invoices.cron.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  // 23:00 on days 28-31; only proceeds when tomorrow is the 1st
  // ("hoá đơn tạo vào ngày cuối cùng của tháng", người thuê trả đầu tháng sau)
  @Cron('0 0 23 28-31 * *')
  async handleEndOfMonth(): Promise<void> {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (tomorrow.getDate() !== 1) return; // not the last day of the month

    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const result = await this.invoicesService.generateForMonth(month, year);
    this.logger.log(
      `Auto-generated invoices for ${month}/${year}: created=${result.created}, skipped=${result.skipped}`,
    );
  }
}
```

- [ ] **Step 7: Controller + module**

`apps/api/src/invoices/invoices.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('roomId', new ParseIntPipe({ optional: true })) roomId?: number,
  ) {
    return this.invoicesService.findAll({ year, month, roomId });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(@Body() dto: GenerateInvoicesDto) {
    return this.invoicesService.generateForMonth(dto.month, dto.year);
  }

  @Patch(':id/pay')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayInvoiceDto) {
    return this.invoicesService.pay(id, dto);
  }

  @Patch(':id/unpay')
  unpay(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.unpay(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.remove(id);
  }
}
```

`apps/api/src/invoices/invoices.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesCron } from './invoices.cron';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [SettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesCron],
})
export class InvoicesModule {}
```

Trong `app.module.ts`: thêm `import { ScheduleModule } from '@nestjs/schedule';`, thêm `ScheduleModule.forRoot()` và `InvoicesModule` vào `imports`.

- [ ] **Step 8: Chạy test + lint + build, verify pass**

Run: `pnpm test invoices.service.spec.ts` — Expected: PASS (7 tests).
Run: `pnpm test` — Expected: toàn bộ unit test pass.
Run: `pnpm lint && pnpm build` — Expected: không lỗi.

- [ ] **Step 9: Commit (trong `apps/api`)**

```bash
git add src/invoices src/app.module.ts package.json pnpm-lock.yaml
git commit -m "feat(api): invoices module with monthly auto-generation cron and payment confirmation"
```

---
### Task 7: E2E spec vòng đời phòng trọ (API)

**Files:**
- Create: `apps/api/test/rental.e2e-spec.ts`

**Interfaces:**
- Consumes: toàn bộ endpoint Task 2–6; login admin seed (`SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD`, mặc định `admin`/`admin`) như `test/auth.e2e-spec.ts`.

- [ ] **Step 1: Viết e2e spec — `apps/api/test/rental.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin';
const E2E_ROOM = 'E2E_P999';
const E2E_ID_CARD = '099999999999';

describe('Rental lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let roomId: number;
  let tenantId: number;
  let contractId: number;
  let invoiceId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function cleanup() {
    await prisma.tenant.deleteMany({ where: { idCardNumber: E2E_ID_CARD } });
    await prisma.room.deleteMany({ where: { name: E2E_ROOM } }); // cascades contracts/invoices
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
      .expect(200);
    token = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('rejects unauthenticated access to /rooms', async () => {
    await request(app.getHttpServer()).get('/rooms').expect(401);
  });

  it('creates a room with initial readings', async () => {
    const res = await request(app.getHttpServer())
      .post('/rooms')
      .set(auth())
      .send({
        name: E2E_ROOM,
        price: 3000000,
        occupantCount: 2,
        motorbikeCount: 3,
        initialElectricityReading: 100,
        initialWaterReading: 10,
      })
      .expect(201);
    roomId = (res.body as { id: number }).id;
    expect((res.body as { electricityReading: number }).electricityReading).toBe(100);
  });

  it('creates a tenant assigned to the room', async () => {
    const res = await request(app.getHttpServer())
      .post('/tenants')
      .set(auth())
      .send({
        fullName: 'E2E Tenant',
        idCardNumber: E2E_ID_CARD,
        dateOfBirth: '1995-05-20',
        hometown: 'Nam Định',
        roomId,
      })
      .expect(201);
    tenantId = (res.body as { id: number }).id;
  });

  it('creates an ACTIVE contract and occupies the room with synced price', async () => {
    const res = await request(app.getHttpServer())
      .post('/contracts')
      .set(auth())
      .send({
        roomId,
        price: 3200000,
        deposit: 3000000,
        startDate: '2026-07-01',
        endDate: '2027-07-01',
      })
      .expect(201);
    contractId = (res.body as { id: number }).id;

    const room = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set(auth())
      .expect(200);
    expect((room.body as { status: string }).status).toBe('OCCUPIED');
    expect((room.body as { price: number }).price).toBe(3200000);
  });

  it('bulk-updates meter readings and rejects lower values', async () => {
    await request(app.getHttpServer())
      .patch('/rooms/meter-readings')
      .set(auth())
      .send({
        items: [{ roomId, electricityReading: 50, waterReading: 5 }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/rooms/meter-readings')
      .set(auth())
      .send({
        items: [{ roomId, electricityReading: 250, waterReading: 22 }],
      })
      .expect(200);
  });

  it('creates a manual invoice and rejects a duplicate for the same month', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set(auth())
      .send({ roomId, month: 7, year: 2026 })
      .expect(201);
    const body = res.body as {
      id: number;
      electricityPrev: number;
      totalAmount: number;
    };
    invoiceId = body.id;
    expect(body.electricityPrev).toBe(100);
    expect(body.totalAmount).toBeGreaterThan(3200000);

    await request(app.getHttpServer())
      .post('/invoices')
      .set(auth())
      .send({ roomId, month: 7, year: 2026 })
      .expect(409);
  });

  it('generate skips rooms that already have an invoice', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices/generate')
      .set(auth())
      .send({ month: 7, year: 2026 })
      .expect(200);
    expect((res.body as { skipped: number }).skipped).toBeGreaterThanOrEqual(1);
  });

  it('marks the invoice paid by bank transfer', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/invoices/${invoiceId}/pay`)
      .set(auth())
      .send({ paymentMethod: 'TRANSFER' })
      .expect(200);
    const body = res.body as { status: string; paymentMethod: string };
    expect(body.status).toBe('PAID');
    expect(body.paymentMethod).toBe('TRANSFER');
  });

  it('room detail lists tenants, contracts and invoices', async () => {
    const res = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set(auth())
      .expect(200);
    const body = res.body as {
      tenants: { id: number }[];
      contracts: { id: number }[];
      invoices: { id: number }[];
    };
    expect(body.tenants.some((t) => t.id === tenantId)).toBe(true);
    expect(body.contracts.some((c) => c.id === contractId)).toBe(true);
    expect(body.invoices.some((i) => i.id === invoiceId)).toBe(true);
  });

  it('terminating the contract releases the room', async () => {
    await request(app.getHttpServer())
      .patch(`/contracts/${contractId}`)
      .set(auth())
      .send({ status: 'TERMINATED' })
      .expect(200);
    const room = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set(auth())
      .expect(200);
    expect((room.body as { status: string }).status).toBe('AVAILABLE');
  });
});
```

- [ ] **Step 2: Chạy e2e (cần MySQL + DB đã seed)**

Run (trong `apps/api`): `pnpm test:e2e`
Expected: PASS toàn bộ (spec cũ + spec mới).

- [ ] **Step 3: Commit (trong `apps/api`)**

```bash
git add test/rental.e2e-spec.ts
git commit -m "test(api): e2e rental lifecycle (room, tenant, contract, invoice)"
```

---
## Frontend (apps/web) — lưu ý chung

- Không có test infra ở web → mỗi task verify bằng `pnpm lint && pnpm build` + bước verify thủ công (chạy `pnpm dev` với API đang chạy).
- Commit frontend ở **repo root** (không phải trong `apps/api`).
- Trước khi code UI, thợ thi công NÊN invoke skill `ui-ux-pro-max` (theo CLAUDE.md của repo).
- Mọi trang mới đều nằm trong `app/(admin)/` — layout đã tự check `getCurrentUser()`; page chỉ cần lấy token và fetch.

### Task 8: Web — helpers chung + navigation + trang cài đặt phí

**Files:**
- Create: `apps/web/lib/format.ts`
- Modify: `apps/web/lib/navigation.ts`
- Create: `apps/web/features/settings/types.ts`
- Create: `apps/web/features/settings/actions.ts`
- Create: `apps/web/features/settings/components/fee-settings-form.tsx`
- Modify: `apps/web/app/(admin)/settings/page.tsx` (render thêm fee settings cho ADMIN)

**Interfaces:**
- Produces:
  - `formatCurrency(amount: number): string` — `"3.200.000 ₫"` (vi-VN); `formatDate(iso: string): string` — `dd/mm/yyyy`; `formatMonth(month: number, year: number): string` — `"Tháng 7/2026"`. Các task 9–13 dùng các hàm này.
  - `FeeSetting` interface (khớp API `GET /settings`).
  - Nav mới: nhóm "Vận hành" gồm Phòng trọ `/rooms`, Người thuê `/tenants`, Hợp đồng `/contracts`, Hoá đơn `/invoices`.

- [ ] **Step 1: Tạo `apps/web/lib/format.ts`**

```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function formatMonth(month: number, year: number): string {
  return `Tháng ${month}/${year}`;
}
```

- [ ] **Step 2: Sửa `apps/web/lib/navigation.ts`** — thêm icons và nhóm "Vận hành" vào `ADMIN_NAV`, giữa nhóm "Tổng quan" và "Quản lý":

```typescript
import {
  Building2,
  DoorOpen,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
```

Thêm nhóm mới vào `ADMIN_NAV` (giữ nguyên các nhóm hiện có):

```typescript
  {
    label: "Vận hành",
    items: [
      { title: "Phòng trọ", href: "/rooms", icon: DoorOpen },
      { title: "Người thuê", href: "/tenants", icon: Users },
      { title: "Hợp đồng", href: "/contracts", icon: FileText },
      { title: "Hoá đơn", href: "/invoices", icon: Receipt },
    ],
  },
```

Lưu ý: icon `Users` đang được nhóm "Quản lý" dùng cho "Cư dân" (placeholder) — đổi "Cư dân" sang icon khác hoặc (khuyến nghị) **xoá 3 mục placeholder "Toà nhà", "Cư dân", "Bảo trì"** khỏi nav và xoá các page placeholder `app/(admin)/buildings|residents|maintenance` vì đã được thay bằng các trang thật. Nếu xoá, bỏ import icon thừa.

- [ ] **Step 3: Types + actions cho settings**

`apps/web/features/settings/types.ts`:

```typescript
export interface FeeSetting {
  id: number;
  electricityUnitPrice: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFeePerPerson: number;
  cleaningFeePerPerson: number;
  motorbikeFeePerExtra: number;
  freeMotorbikeCount: number;
  otherFee: number;
  updatedAt: string;
}
```

`apps/web/features/settings/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { FeeSetting } from "./types";

export interface FeeSettingFormState {
  error: string | null;
  success?: boolean;
}

const FEE_FIELDS = [
  "electricityUnitPrice",
  "waterUnitPrice",
  "internetFee",
  "elevatorFeePerPerson",
  "cleaningFeePerPerson",
  "motorbikeFeePerExtra",
  "freeMotorbikeCount",
  "otherFee",
] as const;

export async function updateFeeSettings(
  _prev: FeeSettingFormState,
  formData: FormData,
): Promise<FeeSettingFormState> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };

  const body: Record<string, number> = {};
  for (const field of FEE_FIELDS) {
    body[field] = Number(formData.get(field) ?? 0);
  }

  const res = await apiFetch<FeeSetting>("/settings", {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  return { error: null, success: true };
}
```

- [ ] **Step 4: Component form — `apps/web/features/settings/components/fee-settings-form.tsx`**

```tsx
"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  updateFeeSettings,
  type FeeSettingFormState,
} from "@/features/settings/actions";
import type { FeeSetting } from "@/features/settings/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FeeSettingFormState = { error: null };

const FIELDS: { name: keyof FeeSetting; label: string; hint?: string }[] = [
  { name: "electricityUnitPrice", label: "Đơn giá điện (đ/kWh)" },
  { name: "waterUnitPrice", label: "Đơn giá nước (đ/m³)" },
  { name: "internetFee", label: "Phí internet (đ/phòng/tháng)" },
  { name: "elevatorFeePerPerson", label: "Phí thang máy (đ/người/tháng)" },
  { name: "cleaningFeePerPerson", label: "Phí vệ sinh (đ/người/tháng)" },
  {
    name: "motorbikeFeePerExtra",
    label: "Phí xe máy vượt định mức (đ/xe/tháng)",
  },
  {
    name: "freeMotorbikeCount",
    label: "Số xe máy miễn phí (xe/phòng)",
    hint: "Mặc định 2 xe đầu miễn phí",
  },
  { name: "otherFee", label: "Phí khác (đ/phòng/tháng)" },
];

export function FeeSettingsForm({ setting }: { setting: FeeSetting }) {
  const [state, formAction, pending] = useActionState(
    updateFeeSettings,
    initialState,
  );

  React.useEffect(() => {
    if (state.success) toast.success("Đã lưu cài đặt phí");
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cài đặt phí</CardTitle>
        <CardDescription>
          Đơn giá dùng để tính hoá đơn hàng tháng. Hoá đơn đã tạo không bị ảnh
          hưởng.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.name} className="grid gap-2">
              <Label htmlFor={`fee-${field.name}`}>{field.label}</Label>
              <Input
                id={`fee-${field.name}`}
                name={field.name}
                type="number"
                min={0}
                step={1}
                defaultValue={setting[field.name] as number}
                required
              />
              {field.hint ? (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          ))}
          {state.error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {state.error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Lưu cài đặt
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
```

- [ ] **Step 5: Render trong trang settings** — sửa `apps/web/app/(admin)/settings/page.tsx`: giữ nguyên nội dung hiện có (profile/appearance), thêm phần fee settings chỉ hiển thị cho ADMIN. Thêm vào đầu component (page là server component):

```tsx
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { FeeSettingsForm } from "@/features/settings/components/fee-settings-form";
import type { FeeSetting } from "@/features/settings/types";
import { apiFetch } from "@/lib/api";
```

Trong body của page (sau các section hiện có):

```tsx
  const user = await getCurrentUser();
  const token = await getSessionToken();
  let feeSetting: FeeSetting | null = null;
  if (user?.role === "ADMIN" && token) {
    const res = await apiFetch<FeeSetting>("/settings", { token });
    feeSetting = res.data;
  }
```

```tsx
  {feeSetting ? <FeeSettingsForm setting={feeSetting} /> : null}
```

(Nếu page hiện tại chưa phải server component/async, chuyển nó thành `async function` và giữ các component con client như cũ.)

- [ ] **Step 6: Verify + commit (repo root)**

Run (trong `apps/web`): `pnpm lint && pnpm build` — Expected: pass.
Manual: đăng nhập admin → Cài đặt → thấy card "Cài đặt phí", sửa giá trị, bấm Lưu → toast "Đã lưu cài đặt phí".

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/lib/format.ts apps/web/lib/navigation.ts apps/web/features/settings apps/web/app
git commit -m "feat(web): fee settings form, rental navigation group, format helpers"
```

---
### Task 9: Web — Người thuê (tenants) CRUD

**Files:**
- Create: `apps/web/features/tenants/types.ts`
- Create: `apps/web/features/tenants/actions.ts`
- Create: `apps/web/features/tenants/components/tenants-table.tsx`
- Create: `apps/web/features/tenants/components/tenant-form-dialog.tsx`
- Create: `apps/web/features/tenants/components/delete-tenant-dialog.tsx`
- Create: `apps/web/app/(admin)/tenants/page.tsx`

**Interfaces:**
- Consumes: API `/tenants` (Task 3), `/rooms` (Task 4 — cho dropdown chọn phòng), `formatDate` (Task 8).
- Produces: `Tenant` interface + `RoomOption { id, name }` — Task 11 tái dùng `TenantFormDialog` qua prop `defaultRoomId`.

- [ ] **Step 1: Types — `apps/web/features/tenants/types.ts`**

```typescript
export interface Tenant {
  id: number;
  fullName: string;
  idCardNumber: string;
  dateOfBirth: string;
  hometown: string;
  roomId: number | null;
  room: { id: number; name: string } | null;
  createdAt: string;
}

export interface RoomOption {
  id: number;
  name: string;
}
```

- [ ] **Step 2: Actions — `apps/web/features/tenants/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { Tenant } from "./types";

export interface TenantFormState {
  error: string | null;
  success?: boolean;
}

function revalidateTenantPages() {
  revalidatePath("/tenants");
  revalidatePath("/rooms");
}

async function authedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; error: string | null }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<T>(path, { ...init, token });
  return { ok: res.ok, error: res.error };
}

function tenantBody(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  return {
    fullName: String(formData.get("fullName") ?? ""),
    idCardNumber: String(formData.get("idCardNumber") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    hometown: String(formData.get("hometown") ?? ""),
    ...(roomId ? { roomId: Number(roomId) } : {}),
  };
}

export async function createTenant(
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const res = await authedFetch<Tenant>("/tenants", {
    method: "POST",
    body: JSON.stringify(tenantBody(formData)),
  });
  if (!res.ok) return { error: res.error };
  revalidateTenantPages();
  return { error: null, success: true };
}

export async function updateTenant(
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const id = Number(formData.get("id"));
  const roomId = String(formData.get("roomId") ?? "");
  const body = {
    ...tenantBody(formData),
    // dropdown gửi "" khi bỏ chọn phòng -> null để rời phòng
    roomId: roomId ? Number(roomId) : null,
  };
  const res = await authedFetch<Tenant>(`/tenants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: res.error };
  revalidateTenantPages();
  return { error: null, success: true };
}

export async function deleteTenant(id: number): Promise<TenantFormState> {
  const res = await authedFetch<{ message: string }>(`/tenants/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidateTenantPages();
  return { error: null, success: true };
}
```

- [ ] **Step 3: Form dialog — `apps/web/features/tenants/components/tenant-form-dialog.tsx`**

Theo đúng pattern `user-form-dialog.tsx` (useActionState + guard `lastSuccess` chống stale-success — copy y nguyên 3 khối `React.useEffect` từ `user-form-dialog.tsx`):

```tsx
"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createTenant,
  updateTenant,
  type TenantFormState,
} from "@/features/tenants/actions";
import type { RoomOption, Tenant } from "@/features/tenants/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: TenantFormState = { error: null };
const NO_ROOM = "none";

interface TenantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: RoomOption[];
  /** When set, the dialog edits this tenant; otherwise it creates a new one. */
  tenant?: Tenant;
  /** Preselect a room (used from the room-detail page). */
  defaultRoomId?: number;
}

export function TenantFormDialog({
  open,
  onOpenChange,
  rooms,
  tenant,
  defaultRoomId,
}: TenantFormDialogProps) {
  const isEdit = !!tenant;
  const action = isEdit ? updateTenant : createTenant;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [roomId, setRoomId] = React.useState<string>(
    tenant?.roomId?.toString() ?? defaultRoomId?.toString() ?? NO_ROOM,
  );
  const lastSuccess = React.useRef(false);

  React.useEffect(() => {
    if (open) lastSuccess.current = state.success === true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot stale success on open only

  React.useEffect(() => {
    if (pending) lastSuccess.current = false;
  }, [pending]);

  React.useEffect(() => {
    if (state.success && !lastSuccess.current) {
      lastSuccess.current = true;
      toast.success(isEdit ? "Đã cập nhật người thuê" : "Đã thêm người thuê");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa người thuê" : "Thêm người thuê"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin người thuê."
              : "Nhập thông tin người thuê mới."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? <input type="hidden" name="id" value={tenant.id} /> : null}
          <input
            type="hidden"
            name="roomId"
            value={roomId === NO_ROOM ? "" : roomId}
          />
          <div className="grid gap-2">
            <Label htmlFor="tenant-fullName">
              Họ tên <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-fullName"
              name="fullName"
              defaultValue={tenant?.fullName}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-idCardNumber">
              Số CCCD <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-idCardNumber"
              name="idCardNumber"
              inputMode="numeric"
              pattern="\d{9,12}"
              title="Gồm 9-12 chữ số"
              defaultValue={tenant?.idCardNumber}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-dateOfBirth">
              Ngày sinh <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={tenant?.dateOfBirth?.slice(0, 10)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-hometown">
              Quê quán <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-hometown"
              name="hometown"
              defaultValue={tenant?.hometown}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Phòng</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue placeholder="Chưa xếp phòng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>Chưa xếp phòng</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id.toString()}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Thêm người thuê"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Delete dialog — `apps/web/features/tenants/components/delete-tenant-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteTenant } from "@/features/tenants/actions";
import type { Tenant } from "@/features/tenants/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteTenantDialogProps {
  tenant: Tenant | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTenantDialog({
  tenant,
  onOpenChange,
}: DeleteTenantDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!tenant) return;
    startTransition(async () => {
      const result = await deleteTenant(tenant.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá người thuê");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!tenant} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá người thuê?</AlertDialogTitle>
          <AlertDialogDescription>
            Người thuê <span className="font-medium">{tenant?.fullName}</span>{" "}
            sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá người thuê
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Table — `apps/web/features/tenants/components/tenants-table.tsx`**

```tsx
"use client";

import * as React from "react";
import { MoreHorizontal, Plus, Users } from "lucide-react";

import type { RoomOption, Tenant } from "@/features/tenants/types";
import { formatDate } from "@/lib/format";
import { DeleteTenantDialog } from "./delete-tenant-dialog";
import { TenantFormDialog } from "./tenant-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TenantsTable({
  tenants,
  rooms,
}: {
  tenants: Tenant[];
  rooms: RoomOption[];
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingTenant, setEditingTenant] = React.useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = React.useState<Tenant | null>(
    null,
  );

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm người thuê
        </Button>
      </div>

      {tenants.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có người thuê nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm người thuê đầu tiên để bắt đầu.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Thêm người thuê
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ tên</TableHead>
                <TableHead>Số CCCD</TableHead>
                <TableHead>Ngày sinh</TableHead>
                <TableHead>Quê quán</TableHead>
                <TableHead>Phòng</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">
                    {tenant.fullName}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {tenant.idCardNumber}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(tenant.dateOfBirth)}
                  </TableCell>
                  <TableCell>{tenant.hometown}</TableCell>
                  <TableCell>
                    {tenant.room ? (
                      <Badge variant="outline">{tenant.room.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Chưa xếp phòng
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Thao tác với ${tenant.fullName}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setEditingTenant(tenant)}
                        >
                          Sửa
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeletingTenant(tenant)}
                        >
                          Xoá
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TenantFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        rooms={rooms}
      />
      <TenantFormDialog
        key={editingTenant?.id ?? "edit-none"}
        open={!!editingTenant}
        onOpenChange={(open) => !open && setEditingTenant(null)}
        rooms={rooms}
        tenant={editingTenant ?? undefined}
      />
      <DeleteTenantDialog
        tenant={deletingTenant}
        onOpenChange={(open) => !open && setDeletingTenant(null)}
      />
    </>
  );
}
```

- [ ] **Step 6: Page — `apps/web/app/(admin)/tenants/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { TenantsTable } from "@/features/tenants/components/tenants-table";
import type { RoomOption, Tenant } from "@/features/tenants/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Người thuê" };

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const [tenantsRes, roomsRes] = await Promise.all([
    apiFetch<Tenant[]>("/tenants", { token: token ?? undefined }),
    apiFetch<RoomOption[]>("/rooms", { token: token ?? undefined }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Người thuê"
        description="Quản lý người thuê và phòng đang ở"
      />
      <TenantsTable
        tenants={tenantsRes.data ?? []}
        rooms={(roomsRes.data ?? []).map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
```

- [ ] **Step 7: Verify + commit (repo root)**

Run (trong `apps/web`): `pnpm lint && pnpm build` — Expected: pass.
Manual: `/tenants` — thêm/sửa/xoá người thuê, gán phòng, thấy toast tiếng Việt.

```bash
git add apps/web/features/tenants apps/web/app
git commit -m "feat(web): tenants CRUD page"
```

---
### Task 10: Web — Phòng trọ (rooms) list + form + cập nhật chỉ số hàng loạt

**Files:**
- Create: `apps/web/features/rooms/types.ts`
- Create: `apps/web/features/rooms/actions.ts`
- Create: `apps/web/features/rooms/components/rooms-table.tsx`
- Create: `apps/web/features/rooms/components/room-form-dialog.tsx`
- Create: `apps/web/features/rooms/components/delete-room-dialog.tsx`
- Create: `apps/web/features/rooms/components/bulk-readings-dialog.tsx`
- Create: `apps/web/app/(admin)/rooms/page.tsx`

**Interfaces:**
- Consumes: API `/rooms` + `PATCH /rooms/meter-readings` (Task 4), `formatCurrency` (Task 8).
- Produces: `Room`, `RoomStatus`, `ROOM_STATUS_LABEL` — Task 11/12/13 dùng lại. `bulkUpdateReadings(items: { roomId; electricityReading; waterReading }[])` server action.

- [ ] **Step 1: Types — `apps/web/features/rooms/types.ts`**

```typescript
export type RoomStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";

export const ROOM_STATUS_LABEL: Record<
  RoomStatus,
  { label: string; variant: "outline" | "default" | "secondary" }
> = {
  AVAILABLE: { label: "Trống", variant: "outline" },
  OCCUPIED: { label: "Đang thuê", variant: "default" },
  MAINTENANCE: { label: "Bảo trì", variant: "secondary" },
};

export interface Room {
  id: number;
  name: string;
  price: number;
  status: RoomStatus;
  occupantCount: number;
  motorbikeCount: number;
  internetEnabled: boolean;
  initialElectricityReading: number;
  initialWaterReading: number;
  electricityReading: number;
  waterReading: number;
  createdAt: string;
  _count?: { tenants: number };
}

export interface MeterReadingItem {
  roomId: number;
  electricityReading: number;
  waterReading: number;
}
```

- [ ] **Step 2: Actions — `apps/web/features/rooms/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { MeterReadingItem, Room } from "./types";

export interface RoomFormState {
  error: string | null;
  success?: boolean;
}

async function authedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; error: string | null }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<T>(path, { ...init, token });
  return { ok: res.ok, error: res.error };
}

export async function createRoom(
  _prev: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const res = await authedFetch<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? ""),
      price: Number(formData.get("price") ?? 0),
      occupantCount: Number(formData.get("occupantCount") ?? 0),
      motorbikeCount: Number(formData.get("motorbikeCount") ?? 0),
      internetEnabled: formData.get("internetEnabled") === "on",
      initialElectricityReading: Number(
        formData.get("initialElectricityReading") ?? 0,
      ),
      initialWaterReading: Number(formData.get("initialWaterReading") ?? 0),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  return { error: null, success: true };
}

export async function updateRoom(
  _prev: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const id = Number(formData.get("id"));
  const res = await authedFetch<Room>(`/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: String(formData.get("name") ?? ""),
      price: Number(formData.get("price") ?? 0),
      status: String(formData.get("status") ?? "AVAILABLE"),
      occupantCount: Number(formData.get("occupantCount") ?? 0),
      motorbikeCount: Number(formData.get("motorbikeCount") ?? 0),
      internetEnabled: formData.get("internetEnabled") === "on",
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${id}`);
  return { error: null, success: true };
}

export async function deleteRoom(id: number): Promise<RoomFormState> {
  const res = await authedFetch<{ message: string }>(`/rooms/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  return { error: null, success: true };
}

export async function bulkUpdateReadings(
  items: MeterReadingItem[],
): Promise<RoomFormState> {
  const res = await authedFetch<{ message: string; updated: number }>(
    "/rooms/meter-readings",
    { method: "PATCH", body: JSON.stringify({ items }) },
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  return { error: null, success: true };
}
```

- [ ] **Step 3: Room form dialog — `apps/web/features/rooms/components/room-form-dialog.tsx`**

Cùng pattern stale-success guard như `tenant-form-dialog.tsx` (Task 9 Step 3 — copy y nguyên 3 khối `React.useEffect`):

```tsx
"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createRoom,
  updateRoom,
  type RoomFormState,
} from "@/features/rooms/actions";
import { ROOM_STATUS_LABEL, type Room, type RoomStatus } from "@/features/rooms/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: RoomFormState = { error: null };

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this room; otherwise it creates a new one. */
  room?: Room;
}

export function RoomFormDialog({ open, onOpenChange, room }: RoomFormDialogProps) {
  const isEdit = !!room;
  const action = isEdit ? updateRoom : createRoom;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [status, setStatus] = React.useState<RoomStatus>(
    room?.status ?? "AVAILABLE",
  );
  const lastSuccess = React.useRef(false);

  React.useEffect(() => {
    if (open) lastSuccess.current = state.success === true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot stale success on open only

  React.useEffect(() => {
    if (pending) lastSuccess.current = false;
  }, [pending]);

  React.useEffect(() => {
    if (state.success && !lastSuccess.current) {
      lastSuccess.current = true;
      toast.success(isEdit ? "Đã cập nhật phòng" : "Đã tạo phòng");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa phòng" : "Thêm phòng"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin phòng. Chỉ số điện nước cập nhật ở nút riêng ngoài danh sách."
              : "Nhập thông tin phòng và chỉ số điện nước ban đầu."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? <input type="hidden" name="id" value={room.id} /> : null}
          {isEdit ? <input type="hidden" name="status" value={status} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="room-name">
                Tên phòng <span className="text-destructive">*</span>
              </Label>
              <Input id="room-name" name="name" defaultValue={room?.name} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-price">
                Giá phòng (đ/tháng) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="room-price"
                name="price"
                type="number"
                min={0}
                step={1000}
                defaultValue={room?.price}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-occupantCount">Số người</Label>
              <Input
                id="room-occupantCount"
                name="occupantCount"
                type="number"
                min={0}
                defaultValue={room?.occupantCount ?? 0}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-motorbikeCount">Số xe máy</Label>
              <Input
                id="room-motorbikeCount"
                name="motorbikeCount"
                type="number"
                min={0}
                defaultValue={room?.motorbikeCount ?? 0}
                required
              />
              <p className="text-xs text-muted-foreground">
                Miễn phí 2 xe, từ xe thứ 3 tính phí theo cài đặt.
              </p>
            </div>
            {isEdit ? (
              <div className="grid gap-2">
                <Label>Trạng thái</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as RoomStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {ROOM_STATUS_LABEL[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="room-initialElectricityReading">
                    Chỉ số điện ban đầu (kWh)
                  </Label>
                  <Input
                    id="room-initialElectricityReading"
                    name="initialElectricityReading"
                    type="number"
                    min={0}
                    defaultValue={0}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="room-initialWaterReading">
                    Chỉ số nước ban đầu (m³)
                  </Label>
                  <Input
                    id="room-initialWaterReading"
                    name="initialWaterReading"
                    type="number"
                    min={0}
                    defaultValue={0}
                    required
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="room-internetEnabled"
              name="internetEnabled"
              defaultChecked={room?.internetEnabled ?? true}
            />
            <Label htmlFor="room-internetEnabled">Sử dụng internet</Label>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Tạo phòng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Lưu ý: shadcn `Checkbox` (radix) submit qua form cần thuộc tính `name` — nếu giá trị không vào FormData, thay bằng `<input type="checkbox">` thường hoặc hidden input đồng bộ state.

- [ ] **Step 4: Delete dialog — `apps/web/features/rooms/components/delete-room-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteRoom } from "@/features/rooms/actions";
import type { Room } from "@/features/rooms/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteRoomDialogProps {
  room: Room | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteRoomDialog({ room, onOpenChange }: DeleteRoomDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!room) return;
    startTransition(async () => {
      const result = await deleteRoom(room.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá phòng");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!room} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá phòng?</AlertDialogTitle>
          <AlertDialogDescription>
            Phòng <span className="font-medium">{room?.name}</span> cùng toàn
            bộ hợp đồng và hoá đơn của phòng sẽ bị xoá vĩnh viễn. Hành động này
            không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá phòng
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Bulk readings dialog — `apps/web/features/rooms/components/bulk-readings-dialog.tsx`**

Yêu cầu spec: "show list danh sách phòng và 2 ô input nhập điện nước, hiển thị chỉ số cũ ở bên trên mỗi input". Chỉ gửi các phòng có thay đổi.

```tsx
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateReadings } from "@/features/rooms/actions";
import type { Room } from "@/features/rooms/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BulkReadingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
}

type Draft = Record<number, { electricity: string; water: string }>;

export function BulkReadingsDialog({
  open,
  onOpenChange,
  rooms,
}: BulkReadingsDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft>({});

  // reset drafts each time the dialog opens with fresh room data
  React.useEffect(() => {
    if (open) setDraft({});
  }, [open]);

  function setValue(
    roomId: number,
    field: "electricity" | "water",
    value: string,
  ) {
    setDraft((prev) => ({
      ...prev,
      [roomId]: {
        electricity: prev[roomId]?.electricity ?? "",
        water: prev[roomId]?.water ?? "",
        [field]: value,
      },
    }));
  }

  function handleSubmit() {
    const items = rooms.flatMap((room) => {
      const d = draft[room.id];
      if (!d || (d.electricity === "" && d.water === "")) return [];
      const electricityReading =
        d.electricity === "" ? room.electricityReading : Number(d.electricity);
      const waterReading =
        d.water === "" ? room.waterReading : Number(d.water);
      return [{ roomId: room.id, electricityReading, waterReading }];
    });

    if (items.length === 0) {
      toast.error("Chưa nhập chỉ số mới cho phòng nào");
      return;
    }
    for (const item of items) {
      const room = rooms.find((r) => r.id === item.roomId);
      if (!room) continue;
      if (
        item.electricityReading < room.electricityReading ||
        item.waterReading < room.waterReading
      ) {
        toast.error(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số cũ`,
        );
        return;
      }
    }

    startTransition(async () => {
      const result = await bulkUpdateReadings(items);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Đã cập nhật chỉ số cho ${items.length} phòng`);
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cập nhật chỉ số điện nước</DialogTitle>
          <DialogDescription>
            Nhập chỉ số mới cho các phòng cần chốt. Phòng bỏ trống sẽ không
            thay đổi.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phòng</TableHead>
                <TableHead>Chỉ số điện (kWh)</TableHead>
                <TableHead>Chỉ số nước (m³)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>
                    <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                      Chỉ số cũ: {room.electricityReading}
                    </p>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={room.electricityReading}
                      placeholder="Chỉ số mới"
                      aria-label={`Chỉ số điện mới phòng ${room.name}`}
                      value={draft[room.id]?.electricity ?? ""}
                      onChange={(e) =>
                        setValue(room.id, "electricity", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                      Chỉ số cũ: {room.waterReading}
                    </p>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={room.waterReading}
                      placeholder="Chỉ số mới"
                      aria-label={`Chỉ số nước mới phòng ${room.name}`}
                      value={draft[room.id]?.water ?? ""}
                      onChange={(e) =>
                        setValue(room.id, "water", e.target.value)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Lưu chỉ số
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Rooms table — `apps/web/features/rooms/components/rooms-table.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpen, Gauge, MoreHorizontal, Plus } from "lucide-react";

import { ROOM_STATUS_LABEL, type Room } from "@/features/rooms/types";
import { formatCurrency } from "@/lib/format";
import { BulkReadingsDialog } from "./bulk-readings-dialog";
import { DeleteRoomDialog } from "./delete-room-dialog";
import { RoomFormDialog } from "./room-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RoomsTable({ rooms }: { rooms: Room[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = React.useState<Room | null>(null);

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setBulkOpen(true)}
          disabled={rooms.length === 0}
        >
          <Gauge className="size-4" />
          Cập nhật chỉ số điện nước
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm phòng
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <DoorOpen className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có phòng nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm phòng đầu tiên để bắt đầu quản lý.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Thêm phòng
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên phòng</TableHead>
                <TableHead>Giá phòng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Số người</TableHead>
                <TableHead>Số xe máy</TableHead>
                <TableHead>Chỉ số điện</TableHead>
                <TableHead>Chỉ số nước</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => {
                const status = ROOM_STATUS_LABEL[room.status];
                return (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/rooms/${room.id}`}
                        className="hover:underline"
                      >
                        {room.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(room.price)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.occupantCount}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.motorbikeCount}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.electricityReading}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.waterReading}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Thao tác với ${room.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/rooms/${room.id}`}>Xem chi tiết</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setEditingRoom(room)}
                          >
                            Sửa
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeletingRoom(room)}
                          >
                            Xoá
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <RoomFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <RoomFormDialog
        key={editingRoom?.id ?? "edit-none"}
        open={!!editingRoom}
        onOpenChange={(open) => !open && setEditingRoom(null)}
        room={editingRoom ?? undefined}
      />
      <DeleteRoomDialog
        room={deletingRoom}
        onOpenChange={(open) => !open && setDeletingRoom(null)}
      />
      <BulkReadingsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rooms={rooms}
      />
    </>
  );
}
```

- [ ] **Step 7: Page — `apps/web/app/(admin)/rooms/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { RoomsTable } from "@/features/rooms/components/rooms-table";
import type { Room } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Phòng trọ" };

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const res = await apiFetch<Room[]>("/rooms", { token: token ?? undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Phòng trọ"
        description="Quản lý phòng, giá thuê và chỉ số điện nước"
      />
      <RoomsTable rooms={res.data ?? []} />
    </div>
  );
}
```

- [ ] **Step 8: Verify + commit (repo root)**

Run (trong `apps/web`): `pnpm lint && pnpm build` — Expected: pass.
Manual: `/rooms` — tạo phòng với chỉ số ban đầu; mở "Cập nhật chỉ số điện nước": thấy chỉ số cũ phía trên mỗi input, nhập chỉ số thấp hơn → báo lỗi, nhập hợp lệ → toast thành công và bảng cập nhật.

```bash
git add apps/web/features/rooms apps/web/app
git commit -m "feat(web): rooms list with CRUD and bulk meter-reading update"
```

---
### Task 11: Web — Invoices feature core + trang chi tiết phòng

**Files:**
- Create: `apps/web/features/invoices/types.ts`
- Create: `apps/web/features/invoices/actions.ts`
- Create: `apps/web/features/invoices/components/pay-invoice-dialog.tsx`
- Create: `apps/web/features/invoices/components/invoice-list.tsx`
- Create: `apps/web/features/invoices/components/create-invoice-dialog.tsx`
- Modify: `apps/web/features/rooms/types.ts` (thêm `RoomDetail`)
- Create: `apps/web/features/rooms/components/room-invoices-section.tsx`
- Create: `apps/web/app/(admin)/rooms/[id]/page.tsx`

**Interfaces:**
- Consumes: API `GET /rooms/:id`, `/invoices/*` (Task 4, 6); `Tenant` (Task 9); `formatCurrency`, `formatDate`, `formatMonth` (Task 8); `ROOM_STATUS_LABEL` (Task 10).
- Produces: `Invoice`, `PAYMENT_METHOD_LABEL`; server actions `createInvoice`, `payInvoice`, `unpayInvoice`, `deleteInvoice`, `generateInvoices` (Task 13 dùng lại `InvoiceList` + `generateInvoices`). `InvoiceList` props: `{ invoices: Invoice[]; showRoom?: boolean }`.

- [ ] **Step 1: Types — `apps/web/features/invoices/types.ts`**

```typescript
export type InvoiceStatus = "UNPAID" | "PAID";
export type PaymentMethod = "CASH" | "TRANSFER";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
};

export interface Invoice {
  id: number;
  roomId: number;
  room?: { id: number; name: string };
  month: number;
  year: number;
  roomPrice: number;
  electricityPrev: number;
  electricityCurrent: number;
  electricityUnitPrice: number;
  waterPrev: number;
  waterCurrent: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFee: number;
  cleaningFee: number;
  motorbikeFee: number;
  otherFee: number;
  occupantCount: number;
  motorbikeCount: number;
  totalAmount: number;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Actions — `apps/web/features/invoices/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { Invoice, PaymentMethod } from "./types";

export interface InvoiceActionState {
  error: string | null;
  success?: boolean;
}

async function authedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; error: string | null }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<T>(path, { ...init, token });
  return { ok: res.ok, error: res.error };
}

function revalidateInvoicePages(roomId?: number) {
  revalidatePath("/invoices");
  if (roomId) revalidatePath(`/rooms/${roomId}`);
}

export async function createInvoice(
  roomId: number,
  month: number,
  year: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({ roomId, month, year }),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export async function generateInvoices(
  month: number,
  year: number,
): Promise<InvoiceActionState & { created?: number; skipped?: number }> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<{ created: number; skipped: number }>(
    "/invoices/generate",
    { method: "POST", token, body: JSON.stringify({ month, year }) },
  );
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages();
  return { error: null, success: true, ...res.data };
}

export async function payInvoice(
  id: number,
  paymentMethod: PaymentMethod,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>(`/invoices/${id}/pay`, {
    method: "PATCH",
    body: JSON.stringify({ paymentMethod }),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export async function unpayInvoice(
  id: number,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>(`/invoices/${id}/unpay`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export async function deleteInvoice(
  id: number,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<{ message: string }>(`/invoices/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}
```

- [ ] **Step 3: Pay dialog — `apps/web/features/invoices/components/pay-invoice-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { payInvoice } from "@/features/invoices/actions";
import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
  type PaymentMethod,
} from "@/features/invoices/types";
import { formatCurrency, formatMonth } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface PayInvoiceDialogProps {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}

export function PayInvoiceDialog({
  invoice,
  onOpenChange,
}: PayInvoiceDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");

  function handleConfirm() {
    if (!invoice) return;
    startTransition(async () => {
      const result = await payInvoice(invoice.id, method, invoice.roomId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xác nhận thanh toán");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xác nhận thanh toán</DialogTitle>
          <DialogDescription>
            {invoice
              ? `Hoá đơn ${formatMonth(invoice.month, invoice.year)} — ${formatCurrency(invoice.totalAmount)}`
              : null}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={method}
          onValueChange={(value) => setMethod(value as PaymentMethod)}
          className="grid gap-3"
        >
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <RadioGroupItem id={`pay-${key}`} value={key} />
              <Label htmlFor={`pay-${key}`}>{PAYMENT_METHOD_LABEL[key]}</Label>
            </div>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Xác nhận đã thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Invoice list — `apps/web/features/invoices/components/invoice-list.tsx`**

```tsx
"use client";

import * as React from "react";
import { MoreHorizontal, Receipt } from "lucide-react";
import { toast } from "sonner";

import { deleteInvoice, unpayInvoice } from "@/features/invoices/actions";
import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
} from "@/features/invoices/types";
import { formatCurrency, formatMonth } from "@/lib/format";
import { PayInvoiceDialog } from "./pay-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function InvoiceList({
  invoices,
  showRoom = false,
}: {
  invoices: Invoice[];
  showRoom?: boolean;
}) {
  const [payingInvoice, setPayingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [, startTransition] = React.useTransition();

  function handleUnpay(invoice: Invoice) {
    startTransition(async () => {
      const result = await unpayInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã chuyển về chưa thanh toán");
    });
  }

  function handleDelete(invoice: Invoice) {
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã xoá hoá đơn");
    });
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <Receipt className="size-8 text-muted-foreground" />
        <p className="font-medium">Chưa có hoá đơn nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỳ</TableHead>
              {showRoom ? <TableHead>Phòng</TableHead> : null}
              <TableHead>Tiền phòng</TableHead>
              <TableHead>Điện</TableHead>
              <TableHead>Nước</TableHead>
              <TableHead>Phí khác</TableHead>
              <TableHead>Tổng cộng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const electricityAmount =
                (invoice.electricityCurrent - invoice.electricityPrev) *
                invoice.electricityUnitPrice;
              const waterAmount =
                (invoice.waterCurrent - invoice.waterPrev) *
                invoice.waterUnitPrice;
              const extraFees =
                invoice.internetFee +
                invoice.elevatorFee +
                invoice.cleaningFee +
                invoice.motorbikeFee +
                invoice.otherFee;
              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {formatMonth(invoice.month, invoice.year)}
                  </TableCell>
                  {showRoom ? (
                    <TableCell>{invoice.room?.name ?? "—"}</TableCell>
                  ) : null}
                  <TableCell className="tabular-nums">
                    {formatCurrency(invoice.roomPrice)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(electricityAmount)}
                    <span className="block text-xs text-muted-foreground">
                      {invoice.electricityPrev} → {invoice.electricityCurrent}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(waterAmount)}
                    <span className="block text-xs text-muted-foreground">
                      {invoice.waterPrev} → {invoice.waterCurrent}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(extraFees)}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {formatCurrency(invoice.totalAmount)}
                  </TableCell>
                  <TableCell>
                    {invoice.status === "PAID" ? (
                      <Badge variant="outline">
                        Đã thanh toán
                        {invoice.paymentMethod
                          ? ` · ${PAYMENT_METHOD_LABEL[invoice.paymentMethod]}`
                          : ""}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Chưa thanh toán</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {invoice.status === "UNPAID" ? (
                        <Button
                          size="sm"
                          onClick={() => setPayingInvoice(invoice)}
                        >
                          Xác nhận đã thanh toán
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Thao tác với hoá đơn"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {invoice.status === "PAID" ? (
                            <DropdownMenuItem
                              onSelect={() => handleUnpay(invoice)}
                            >
                              Chuyển về chưa thanh toán
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={invoice.status === "PAID"}
                            onSelect={() => handleDelete(invoice)}
                          >
                            Xoá hoá đơn
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PayInvoiceDialog
        invoice={payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
      />
    </>
  );
}
```

- [ ] **Step 5: Create-invoice dialog — `apps/web/features/invoices/components/create-invoice-dialog.tsx`**

Dùng để tạo thủ công hoá đơn cho 1 phòng (mở từ trang chi tiết phòng).

```tsx
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createInvoice } from "@/features/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: number;
  roomName: string;
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
}: CreateInvoiceDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createInvoice(roomId, month, year);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã tạo hoá đơn");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tạo hoá đơn thủ công</DialogTitle>
          <DialogDescription>
            Tạo hoá đơn cho phòng {roomName}. Mỗi phòng chỉ có 1 hoá đơn mỗi
            tháng.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="invoice-month">Tháng</Label>
              <Input
                id="invoice-month"
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice-year">Năm</Label>
              <Input
                id="invoice-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Tạo hoá đơn
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Thêm `RoomDetail` vào `apps/web/features/rooms/types.ts`** (append cuối file):

```typescript
import type { Invoice } from "@/features/invoices/types";
import type { Tenant } from "@/features/tenants/types";

export interface RoomContract {
  id: number;
  price: number;
  deposit: number;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "EXPIRED" | "TERMINATED";
  note: string | null;
}

export interface RoomDetail extends Room {
  tenants: Tenant[];
  contracts: RoomContract[];
  invoices: Invoice[];
}
```

(Đặt các `import type` lên đầu file cùng các import khác.)

- [ ] **Step 7: Trang chi tiết — `apps/web/app/(admin)/rooms/[id]/page.tsx`**

Trang server component: info phòng + người thuê + hợp đồng + **danh sách hoá đơn ở cuối**. Nút "Tạo hoá đơn" cần client state → tách nút vào 1 client component nhỏ ngay trong `features/invoices/components/create-invoice-dialog.tsx`? Không — tạo wrapper inline: thêm component client `RoomInvoicesSection` trong `apps/web/features/rooms/components/room-invoices-section.tsx`:

```tsx
"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { CreateInvoiceDialog } from "@/features/invoices/components/create-invoice-dialog";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import type { Invoice } from "@/features/invoices/types";
import { Button } from "@/components/ui/button";

export function RoomInvoicesSection({
  roomId,
  roomName,
  invoices,
}: {
  roomId: number;
  roomName: string;
  invoices: Invoice[];
}) {
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hoá đơn</h2>
        <Button variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Tạo hoá đơn
        </Button>
      </div>
      <InvoiceList invoices={invoices} />
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roomId={roomId}
        roomName={roomName}
      />
    </section>
  );
}
```

(Thêm file này vào danh sách Create của task: `apps/web/features/rooms/components/room-invoices-section.tsx`.)

`apps/web/app/(admin)/rooms/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { RoomInvoicesSection } from "@/features/rooms/components/room-invoices-section";
import { ROOM_STATUS_LABEL, type RoomDetail } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Chi tiết phòng" };

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Đang hiệu lực",
  EXPIRED: "Hết hạn",
  TERMINATED: "Đã chấm dứt",
};

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const { id } = await params;
  const token = await getSessionToken();
  const res = await apiFetch<RoomDetail>(`/rooms/${id}`, {
    token: token ?? undefined,
  });
  if (!res.data) notFound();
  const room = res.data;
  const status = ROOM_STATUS_LABEL[room.status];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Phòng ${room.name}`}
        description="Thông tin phòng, người thuê, hợp đồng và hoá đơn"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Thông tin phòng
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Giá phòng</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(room.price)}/tháng
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Số người</p>
            <p className="font-medium tabular-nums">{room.occupantCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Số xe máy</p>
            <p className="font-medium tabular-nums">{room.motorbikeCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Internet</p>
            <p className="font-medium">
              {room.internetEnabled ? "Có sử dụng" : "Không sử dụng"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Chỉ số điện hiện tại</p>
            <p className="font-medium tabular-nums">
              {room.electricityReading} kWh
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Chỉ số nước hiện tại</p>
            <p className="font-medium tabular-nums">{room.waterReading} m³</p>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Người thuê</h2>
        {room.tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có người thuê nào. Gán người thuê tại trang Người thuê.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Số CCCD</TableHead>
                  <TableHead>Ngày sinh</TableHead>
                  <TableHead>Quê quán</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      {tenant.fullName}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {tenant.idCardNumber}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(tenant.dateOfBirth)}
                    </TableCell>
                    <TableCell>{tenant.hometown}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Hợp đồng</h2>
        {room.contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có hợp đồng nào. Tạo hợp đồng tại trang Hợp đồng.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Giá thuê</TableHead>
                  <TableHead>Tiền cọc</TableHead>
                  <TableHead>Từ ngày</TableHead>
                  <TableHead>Đến ngày</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.price)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.deposit)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.startDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          contract.status === "ACTIVE" ? "default" : "outline"
                        }
                      >
                        {CONTRACT_STATUS_LABEL[contract.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <RoomInvoicesSection
        roomId={room.id}
        roomName={room.name}
        invoices={room.invoices}
      />
    </div>
  );
}
```

- [ ] **Step 8: Verify + commit (repo root)**

Run (trong `apps/web`): `pnpm lint && pnpm build` — Expected: pass.
Manual: từ `/rooms` bấm vào tên phòng → thấy info, người thuê, hợp đồng, **hoá đơn ở cuối**; bấm "Tạo hoá đơn" chọn tháng/năm → hoá đơn xuất hiện; bấm "Xác nhận đã thanh toán" → chọn Tiền mặt/Chuyển khoản → badge chuyển "Đã thanh toán · Tiền mặt"; tạo trùng tháng → toast lỗi "Phòng đã có hoá đơn cho tháng này".

```bash
git add apps/web/features/invoices apps/web/features/rooms apps/web/app
git commit -m "feat(web): room detail page with invoice list, manual creation and payment confirmation"
```

---
### Task 12: Web — Hợp đồng (contracts) CRUD

**Files:**
- Create: `apps/web/features/contracts/types.ts`
- Create: `apps/web/features/contracts/actions.ts`
- Create: `apps/web/features/contracts/components/contracts-table.tsx`
- Create: `apps/web/features/contracts/components/contract-form-dialog.tsx`
- Create: `apps/web/features/contracts/components/delete-contract-dialog.tsx`
- Create: `apps/web/app/(admin)/contracts/page.tsx`

**Interfaces:**
- Consumes: API `/contracts` (Task 5), `/rooms` (dropdown chọn phòng — cần cả `price` để prefill giá), `formatCurrency`/`formatDate` (Task 8), `RoomOption` (Task 9).
- Produces: `Contract`, `CONTRACT_STATUS_LABEL`.

- [ ] **Step 1: Types — `apps/web/features/contracts/types.ts`**

```typescript
export type ContractStatus = "ACTIVE" | "EXPIRED" | "TERMINATED";

export const CONTRACT_STATUS_LABEL: Record<
  ContractStatus,
  { label: string; variant: "default" | "outline" | "secondary" }
> = {
  ACTIVE: { label: "Đang hiệu lực", variant: "default" },
  EXPIRED: { label: "Hết hạn", variant: "outline" },
  TERMINATED: { label: "Đã chấm dứt", variant: "secondary" },
};

export interface Contract {
  id: number;
  roomId: number;
  room: { id: number; name: string };
  price: number;
  deposit: number;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  note: string | null;
  createdAt: string;
}

export interface ContractRoomOption {
  id: number;
  name: string;
  price: number;
}
```

- [ ] **Step 2: Actions — `apps/web/features/contracts/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { Contract } from "./types";

export interface ContractFormState {
  error: string | null;
  success?: boolean;
}

function revalidateContractPages() {
  revalidatePath("/contracts");
  revalidatePath("/rooms");
}

async function authedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; error: string | null }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<T>(path, { ...init, token });
  return { ok: res.ok, error: res.error };
}

export async function createContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const note = String(formData.get("note") ?? "").trim();
  const res = await authedFetch<Contract>("/contracts", {
    method: "POST",
    body: JSON.stringify({
      roomId: Number(formData.get("roomId")),
      price: Number(formData.get("price") ?? 0),
      deposit: Number(formData.get("deposit") ?? 0),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      ...(note ? { note } : {}),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidateContractPages();
  return { error: null, success: true };
}

export async function updateContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();
  const res = await authedFetch<Contract>(`/contracts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      price: Number(formData.get("price") ?? 0),
      deposit: Number(formData.get("deposit") ?? 0),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      status: String(formData.get("status") ?? "ACTIVE"),
      note: note || undefined,
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidateContractPages();
  return { error: null, success: true };
}

export async function deleteContract(id: number): Promise<ContractFormState> {
  const res = await authedFetch<{ message: string }>(`/contracts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidateContractPages();
  return { error: null, success: true };
}
```

- [ ] **Step 3: Form dialog — `apps/web/features/contracts/components/contract-form-dialog.tsx`**

Cùng pattern stale-success guard (copy 3 khối `React.useEffect` như Task 9). Chọn phòng sẽ tự điền giá thuê từ giá phòng hiện tại ("giá phòng match sang thông tin phòng"):

```tsx
"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createContract,
  updateContract,
  type ContractFormState,
} from "@/features/contracts/actions";
import {
  CONTRACT_STATUS_LABEL,
  type Contract,
  type ContractRoomOption,
  type ContractStatus,
} from "@/features/contracts/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ContractFormState = { error: null };

interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: ContractRoomOption[];
  /** When set, the dialog edits this contract; otherwise it creates a new one. */
  contract?: Contract;
}

export function ContractFormDialog({
  open,
  onOpenChange,
  rooms,
  contract,
}: ContractFormDialogProps) {
  const isEdit = !!contract;
  const action = isEdit ? updateContract : createContract;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [roomId, setRoomId] = React.useState<string>(
    contract?.roomId.toString() ?? "",
  );
  const [price, setPrice] = React.useState<string>(
    contract?.price.toString() ?? "",
  );
  const [status, setStatus] = React.useState<ContractStatus>(
    contract?.status ?? "ACTIVE",
  );
  const lastSuccess = React.useRef(false);

  React.useEffect(() => {
    if (open) lastSuccess.current = state.success === true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot stale success on open only

  React.useEffect(() => {
    if (pending) lastSuccess.current = false;
  }, [pending]);

  React.useEffect(() => {
    if (state.success && !lastSuccess.current) {
      lastSuccess.current = true;
      toast.success(isEdit ? "Đã cập nhật hợp đồng" : "Đã tạo hợp đồng");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  function handleRoomChange(value: string) {
    setRoomId(value);
    // giá thuê mặc định lấy theo giá phòng hiện tại
    const room = rooms.find((r) => r.id.toString() === value);
    if (room && !isEdit) setPrice(room.price.toString());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa hợp đồng" : "Tạo hợp đồng"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin hợp đồng. Giá thuê sẽ đồng bộ sang giá phòng khi hợp đồng đang hiệu lực."
              : "Chọn phòng — giá thuê tự điền theo giá phòng, có thể sửa lại."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? (
            <input type="hidden" name="id" value={contract.id} />
          ) : (
            <input type="hidden" name="roomId" value={roomId} />
          )}
          {isEdit ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>
                Phòng <span className="text-destructive">*</span>
              </Label>
              {isEdit ? (
                <Input value={contract.room.name} disabled />
              ) : (
                <Select value={roomId} onValueChange={handleRoomChange} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn phòng" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id.toString()}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-price">
                Giá thuê (đ/tháng) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-price"
                name="price"
                type="number"
                min={0}
                step={1000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-deposit">Tiền cọc (đ)</Label>
              <Input
                id="contract-deposit"
                name="deposit"
                type="number"
                min={0}
                step={1000}
                defaultValue={contract?.deposit ?? 0}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-startDate">
                Từ ngày <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-startDate"
                name="startDate"
                type="date"
                defaultValue={contract?.startDate?.slice(0, 10)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-endDate">
                Đến ngày <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-endDate"
                name="endDate"
                type="date"
                defaultValue={contract?.endDate?.slice(0, 10)}
                required
              />
            </div>
            {isEdit ? (
              <div className="grid gap-2">
                <Label>Trạng thái</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as ContractStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CONTRACT_STATUS_LABEL[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="contract-note">Ghi chú</Label>
              <Input
                id="contract-note"
                name="note"
                defaultValue={contract?.note ?? ""}
              />
            </div>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending || (!isEdit && !roomId)}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Tạo hợp đồng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Delete dialog — `apps/web/features/contracts/components/delete-contract-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteContract } from "@/features/contracts/actions";
import type { Contract } from "@/features/contracts/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteContractDialogProps {
  contract: Contract | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteContractDialog({
  contract,
  onOpenChange,
}: DeleteContractDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!contract) return;
    startTransition(async () => {
      const result = await deleteContract(contract.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá hợp đồng");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!contract} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá hợp đồng?</AlertDialogTitle>
          <AlertDialogDescription>
            Hợp đồng của phòng{" "}
            <span className="font-medium">{contract?.room.name}</span> sẽ bị
            xoá vĩnh viễn. Hợp đồng đang hiệu lực không thể xoá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá hợp đồng
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Table — `apps/web/features/contracts/components/contracts-table.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, MoreHorizontal, Plus } from "lucide-react";

import {
  CONTRACT_STATUS_LABEL,
  type Contract,
  type ContractRoomOption,
} from "@/features/contracts/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { ContractFormDialog } from "./contract-form-dialog";
import { DeleteContractDialog } from "./delete-contract-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ContractsTable({
  contracts,
  rooms,
}: {
  contracts: Contract[];
  rooms: ContractRoomOption[];
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingContract, setEditingContract] =
    React.useState<Contract | null>(null);
  const [deletingContract, setDeletingContract] =
    React.useState<Contract | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Tạo hợp đồng
        </Button>
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có hợp đồng nào</p>
            <p className="text-sm text-muted-foreground">
              Tạo hợp đồng đầu tiên để bắt đầu.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Tạo hợp đồng
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phòng</TableHead>
                <TableHead>Giá thuê</TableHead>
                <TableHead>Tiền cọc</TableHead>
                <TableHead>Từ ngày</TableHead>
                <TableHead>Đến ngày</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => {
                const status = CONTRACT_STATUS_LABEL[contract.status];
                return (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/rooms/${contract.roomId}`}
                        className="hover:underline"
                      >
                        {contract.room.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.price)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.deposit)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.startDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Thao tác với hợp đồng phòng ${contract.room.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setEditingContract(contract)}
                          >
                            Sửa
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={contract.status === "ACTIVE"}
                            onSelect={() => setDeletingContract(contract)}
                          >
                            Xoá
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ContractFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        rooms={rooms}
      />
      <ContractFormDialog
        key={editingContract?.id ?? "edit-none"}
        open={!!editingContract}
        onOpenChange={(open) => !open && setEditingContract(null)}
        rooms={rooms}
        contract={editingContract ?? undefined}
      />
      <DeleteContractDialog
        contract={deletingContract}
        onOpenChange={(open) => !open && setDeletingContract(null)}
      />
    </>
  );
}
```

- [ ] **Step 6: Page — `apps/web/app/(admin)/contracts/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { ContractsTable } from "@/features/contracts/components/contracts-table";
import type { Contract, ContractRoomOption } from "@/features/contracts/types";
import type { Room } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const [contractsRes, roomsRes] = await Promise.all([
    apiFetch<Contract[]>("/contracts", { token: token ?? undefined }),
    apiFetch<Room[]>("/rooms", { token: token ?? undefined }),
  ]);

  const rooms: ContractRoomOption[] = (roomsRes.data ?? []).map(
    ({ id, name, price }) => ({ id, name, price }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hợp đồng"
        description="Quản lý hợp đồng thuê phòng và thời hạn"
      />
      <ContractsTable contracts={contractsRes.data ?? []} rooms={rooms} />
    </div>
  );
}
```

- [ ] **Step 7: Verify + commit (repo root)**

Run (trong `apps/web`): `pnpm lint && pnpm build` — Expected: pass.
Manual: `/contracts` — tạo hợp đồng: chọn phòng thấy giá tự điền, tạo xong phòng chuyển "Đang thuê" và giá phòng đổi theo; chấm dứt hợp đồng → phòng về "Trống"; không xoá được hợp đồng ACTIVE.

```bash
git add apps/web/features/contracts apps/web/app
git commit -m "feat(web): contracts CRUD page with room price sync"
```

---
### Task 13: Web — trang Hoá đơn (lọc theo tháng + sinh hàng loạt)

**Files:**
- Create: `apps/web/features/invoices/components/invoices-toolbar.tsx`
- Create: `apps/web/app/(admin)/invoices/page.tsx`

**Interfaces:**
- Consumes: `InvoiceList` (`showRoom`), `generateInvoices` (Task 11); API `GET /invoices?year=&month=`.
- Produces: trang `/invoices` với query param `?month=&year=` (mặc định tháng hiện tại).

- [ ] **Step 1: Toolbar — `apps/web/features/invoices/components/invoices-toolbar.tsx`**

Client component: chọn tháng/năm (đẩy vào URL query để server component fetch lại) + nút "Tạo hoá đơn tháng này" gọi `generateInvoices`.

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import { generateInvoices } from "@/features/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvoicesToolbar({
  month,
  year,
}: {
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function navigate(nextMonth: number, nextYear: number) {
    router.push(`/invoices?month=${nextMonth}&year=${nextYear}`);
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInvoices(month, year);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          `Đã tạo ${result.created ?? 0} hoá đơn, bỏ qua ${result.skipped ?? 0} phòng đã có hoá đơn`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="filter-month">Tháng</Label>
          <Input
            id="filter-month"
            type="number"
            min={1}
            max={12}
            className="w-20"
            value={month}
            onChange={(e) => navigate(Number(e.target.value), year)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-year">Năm</Label>
          <Input
            id="filter-year"
            type="number"
            min={2000}
            max={2100}
            className="w-28"
            value={year}
            onChange={(e) => navigate(month, Number(e.target.value))}
          />
        </div>
      </div>
      <Button onClick={handleGenerate} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Zap className="size-4" />
        )}
        Tạo hoá đơn tháng {month}/{year}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Page — `apps/web/app/(admin)/invoices/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import { InvoicesToolbar } from "@/features/invoices/components/invoices-toolbar";
import type { Invoice } from "@/features/invoices/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Hoá đơn" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month) || now.getMonth() + 1;
  const year = Number(params.year) || now.getFullYear();

  const token = await getSessionToken();
  const res = await apiFetch<Invoice[]>(
    `/invoices?month=${month}&year=${year}`,
    { token: token ?? undefined },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hoá đơn"
        description="Hoá đơn hàng tháng của các phòng — tự động sinh vào ngày cuối tháng"
      />
      <InvoicesToolbar month={month} year={year} />
      <InvoiceList invoices={res.data ?? []} showRoom />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit (repo root)**

Run (trong `apps/web`): `pnpm lint && pnpm build` — Expected: pass.
Manual: `/invoices` — đổi tháng/năm thấy danh sách đổi theo; bấm "Tạo hoá đơn tháng X/Y" → toast báo số hoá đơn tạo/bỏ qua; bấm lại lần nữa → tất cả bị bỏ qua (unique theo tháng); xác nhận thanh toán được từ danh sách.

```bash
git add apps/web/features/invoices apps/web/app
git commit -m "feat(web): monthly invoices page with batch generation"
```

---

## Verification cuối cùng (sau khi xong toàn bộ task)

- [ ] Backend (trong `apps/api`): `pnpm lint && pnpm test && pnpm build`, và `pnpm test:e2e` với MySQL + seed sẵn sàng.
- [ ] Frontend (trong `apps/web`): `pnpm lint && pnpm build`.
- [ ] Chạy full-stack thủ công: `docker compose up -d` → `apps/api: pnpm start:dev` → `apps/web: pnpm dev` → đi qua flow: tạo phòng → thêm người thuê gán phòng → tạo hợp đồng (phòng OCCUPIED, giá sync) → cập nhật chỉ số hàng loạt → tạo hoá đơn tháng → xác nhận thanh toán (tiền mặt/chuyển khoản) → xem lại ở detail phòng.
- [ ] Kiểm tra security checklist (`.claude/rules/security.md`): không endpoint `@Public()` mới, mọi DTO validate, error message không leak, không secret mới (không cần env var mới ngoài các biến sẵn có).

## Ghi chú phạm vi (YAGNI — cố ý KHÔNG làm)

- Không gắn người thuê vào hợp đồng (spec chỉ yêu cầu phòng 1-n người thuê; hợp đồng thuộc phòng).
- Không tự chuyển hợp đồng sang EXPIRED khi quá hạn (đổi thủ công; có thể thêm cron sau).
- Không xuất PDF/in hoá đơn, không gửi email hoá đơn.
- Không phân trang (số phòng trọ thực tế nhỏ); thêm sau nếu cần.
- CRUD tài khoản admin/manager: đã có sẵn ở users module — không làm lại.













