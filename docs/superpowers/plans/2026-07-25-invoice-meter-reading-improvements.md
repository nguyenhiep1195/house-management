# Invoice & Meter-Reading Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move meter readings to a per-month model with edit history, source invoices from those readings, add full invoice editing, and rebuild the invoice page UI (collapsible rows, icon actions, detail/edit dialogs, list⇄grid, reading entry + missing-reading warnings).

**Architecture:** Backend adds a `MeterReading` (per room+month, source of truth) and immutable `MeterReadingHistory` table (mirrors the existing `SettingHistory` pattern). Reading writes go through the rooms module, sync into that month's invoice, and are blocked when the invoice is PAID. Invoices gain a full-edit endpoint. The Next.js invoice page gains collapsible rows, three icon actions with detail/edit dialogs, a URL-driven list⇄grid toggle, and a month-scoped reading dialog with a pre-generate warning.

**Tech Stack:** NestJS 11, Prisma (`prisma db push`, no migration files), MySQL, Jest (`*.spec.ts`); Next.js 16 App Router, React Server Components + Server Actions, Tailwind v4, shadcn/ui, `sonner` toasts, `lucide-react` icons.

## Global Constraints

- Package manager: **pnpm**, run from inside each app dir (`apps/api`, `apps/web`); no root workspace.
- User-facing copy is **Vietnamese**; code/comments/identifiers **English**.
- API: every endpoint under global `JwtAuthGuard`; admin-only mutations use `@Roles(Role.ADMIN)` (import `Role` from `../generated/enums`). All bodies validated by class-validator DTOs (global `ValidationPipe` `whitelist: true`) — no `any`. Prisma only, no raw SQL. Error messages generic/Vietnamese.
- Prisma client is generated to `src/generated/` (`client`, `enums`); regenerate after schema edits. Schema changes are applied with `pnpm prisma db push` (there are NO migration files — do not create any).
- `apps/api` contains a nested `.git` — run git from the repo root (`/Users/hiepnn/projects/house-management`), not from inside `apps/api`.
- The API is served from a Docker image; after backend changes, unit tests run locally via `pnpm test`, but manual end-to-end verification requires rebuilding the API container (`docker compose up -d --build api` from repo root).
- Money/readings are integers (VND, kWh, m³). Readings are non-negative ints.
- Current branch for this work: `feat/invoice-meter-improvements`.

---

## Phase 1 — Backend

### Task 1: Schema — `MeterReading` + `MeterReadingHistory`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Room model ~line 104; add two models near `Invoice`)

**Interfaces:**
- Produces: Prisma models `MeterReading { id, roomId, room, year, month, electricityReading, waterReading, createdAt, updatedAt }` (unique `[roomId, year, month]`) and `MeterReadingHistory { id, roomId, year, month, electricityReading, waterReading, changedById?, changedByName?, changedAt }`; `Room.meterReadings MeterReading[]`.

- [ ] **Step 1: Add the `meterReadings` relation to `Room`**

In `apps/api/prisma/schema.prisma`, inside `model Room`, add to the relations block (next to `invoices Invoice[]`):

```prisma
  meterReadings MeterReading[]
```

- [ ] **Step 2: Add the two new models**

Add after the `Invoice` model:

```prisma
model MeterReading {
  id                 Int      @id @default(autoincrement())
  roomId             Int
  room               Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  year               Int
  month              Int
  electricityReading Int
  waterReading       Int
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([roomId, year, month])
  @@index([roomId, year, month])
  @@map("meter_readings")
}

// Immutable snapshot written on every create/edit of a MeterReading, for the
// room-detail "Lịch sử chỉnh sửa chỉ số" table. Mirrors SettingHistory.
model MeterReadingHistory {
  id                 Int      @id @default(autoincrement())
  roomId             Int
  year               Int
  month              Int
  electricityReading Int
  waterReading       Int
  changedById        Int?
  changedByName      String?
  changedAt          DateTime @default(now())

  @@index([roomId, changedAt])
  @@map("meter_reading_history")
}
```

- [ ] **Step 3: Push schema + regenerate client**

Ensure MySQL is up (`docker compose up -d mysql` from repo root). Then:

Run: `cd apps/api && pnpm prisma db push && pnpm prisma generate`
Expected: "Your database is now in sync with your Prisma schema" and client regenerated (no errors).

- [ ] **Step 4: Verify the project still compiles**

Run: `cd apps/api && pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): add MeterReading and MeterReadingHistory models"
```

---

### Task 2: Per-month reading upsert + history + validation (rooms service)

Rewrites `bulkUpdateReadings` to write per-month `MeterReading` rows (not the global room fields directly), enforce the "latest month only" rule, validate monotonicity against the previous month, write a history snapshot per item, and mirror the newest month into `Room.electricityReading/waterReading`. Invoice sync is added in Task 4.

**Files:**
- Modify: `apps/api/src/rooms/dto/bulk-update-readings.dto.ts`
- Modify: `apps/api/src/rooms/rooms.service.ts`
- Modify: `apps/api/src/rooms/rooms.controller.ts` (inject `@CurrentUser()` into the reading route)
- Test: `apps/api/src/rooms/rooms.service.spec.ts` (create if absent)

**Interfaces:**
- Consumes: Prisma `MeterReading`, `MeterReadingHistory` (Task 1); `AuthUser` from `../auth/types/auth-user`.
- Produces: `RoomsService.bulkUpdateReadings(dto: BulkUpdateReadingsDto, user?: AuthUser): Promise<{ message: string; updated: number }>`; DTO gains `year: number` (1–12 month, 2000–2100 year) fields: `year`, `month`.

- [ ] **Step 1: Extend the DTO with `year` + `month`**

In `apps/api/src/rooms/dto/bulk-update-readings.dto.ts`, add to `BulkUpdateReadingsDto` (above `items`):

```typescript
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
```

Add `Max` to the imports from `class-validator` (keep `ArrayMinSize, IsArray, IsInt, Min, ValidateNested`).

- [ ] **Step 2: Write failing tests for the new upsert behavior**

Create `apps/api/src/rooms/rooms.service.spec.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { RoomsService } from './rooms.service';

describe('RoomsService.bulkUpdateReadings', () => {
  let service: RoomsService;
  const prisma = {
    room: { findMany: jest.fn(), update: jest.fn() },
    meterReading: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    meterReadingHistory: { create: jest.fn() },
    invoice: { findUnique: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : (ops as any)(prisma),
    ),
  };
  const invoices = { syncMeterReading: jest.fn() };

  const room = {
    id: 1,
    name: 'P101',
    electricityReading: 250,
    waterReading: 22,
    initialElectricityReading: 100,
    initialWaterReading: 10,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('rejects a reading lower than the previous month', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // findFirst is called twice per item: first the newer-month check, then the
    // previous-month lookup. No newer month -> latest ok; prev month reads 250.
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ electricityReading: 250, waterReading: 22 });
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 200, waterReading: 30 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects editing a month that is not the latest recorded month', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // a NEWER month than the target already exists
    prisma.meterReading.findFirst.mockResolvedValue({ year: 2026, month: 8 });
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts the reading, writes history, and mirrors to the room', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null); // target is the latest
    prisma.meterReading.upsert.mockResolvedValue({});
    prisma.meterReadingHistory.create.mockResolvedValue({});
    prisma.room.update.mockResolvedValue({});

    await service.bulkUpdateReadings({
      year: 2026,
      month: 7,
      items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
    });

    expect(prisma.meterReading.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId_year_month: { roomId: 1, year: 2026, month: 7 } },
      }),
    );
    expect(prisma.meterReadingHistory.create).toHaveBeenCalled();
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { electricityReading: 300, waterReading: 30 },
      }),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm test -- rooms.service`
Expected: FAIL (current `bulkUpdateReadings` has no `year`/`month`, no upsert/history).

- [ ] **Step 4: Rewrite `bulkUpdateReadings`**

In `apps/api/src/rooms/rooms.service.ts`:

- Add imports at top:

```typescript
import { AuthUser } from '../auth/types/auth-user';
import { InvoicesService } from '../invoices/invoices.service';
```

- Inject `InvoicesService` in the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}
```

- Replace the whole `bulkUpdateReadings` method with:

```typescript
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

    // Validate every item before writing anything.
    for (const item of dto.items) {
      const room = byId.get(item.roomId);
      if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

      // Only the room's most recent recorded month may be edited.
      const newer = await this.prisma.meterReading.findFirst({
        where: {
          roomId: item.roomId,
          OR: [
            { year: { gt: dto.year } },
            { year: dto.year, month: { gt: dto.month } },
          ],
        },
      });
      if (newer) {
        throw new BadRequestException(
          `Chỉ được sửa chỉ số của kỳ gần nhất (phòng ${room.name})`,
        );
      }

      // New reading must be >= the previous month's reading (or the baseline).
      const prev = await this.prisma.meterReading.findFirst({
        where: {
          roomId: item.roomId,
          OR: [
            { year: { lt: dto.year } },
            { year: dto.year, month: { lt: dto.month } },
          ],
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });
      const prevElectricity =
        prev?.electricityReading ?? room.initialElectricityReading;
      const prevWater = prev?.waterReading ?? room.initialWaterReading;
      if (
        item.electricityReading < prevElectricity ||
        item.waterReading < prevWater
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số kỳ trước`,
        );
      }
    }

    // Persist: upsert reading, snapshot history, mirror newest into the room.
    for (const item of dto.items) {
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
      await this.prisma.room.update({
        where: { id: item.roomId },
        data: {
          electricityReading: item.electricityReading,
          waterReading: item.waterReading,
        },
      });
      // Keep the month's invoice in sync (added in Task 4).
      await this.invoicesService.syncMeterReading(
        item.roomId,
        dto.year,
        dto.month,
      );
    }

    return { message: 'Đã cập nhật chỉ số', updated: dto.items.length };
  }
```

> Note: `syncMeterReading` is added in Task 4. Until then the spec mock (`invoices.syncMeterReading`) covers it; the real method lands in Task 4. If implementing strictly in order, add a temporary no-op `syncMeterReading` on `InvoicesService` now and flesh it out in Task 4 — Task 4's steps assume the method exists.

- [ ] **Step 5: Wire the controller to pass the current user**

In `apps/api/src/rooms/rooms.controller.ts`, update the reading route and imports:

```typescript
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
```

```typescript
  @Patch('meter-readings')
  bulkUpdateReadings(
    @Body() dto: BulkUpdateReadingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roomsService.bulkUpdateReadings(dto, user);
  }
```

- [ ] **Step 6: Register `InvoicesModule` in `RoomsModule`**

`InvoicesModule` must export `InvoicesService` (done in Task 4 Step 1). In `apps/api/src/rooms/rooms.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [InvoicesModule],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- rooms.service`
Expected: PASS (3 tests). If `syncMeterReading` is undefined, add the temporary no-op noted in Step 4.

- [ ] **Step 8: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/rooms
git commit -m "feat(api): per-month meter readings with history and latest-month rule"
```

---

### Task 3: Source invoices from `MeterReading` + report missing readings

`InvoicesService.create` now reads the month's *current* reading from `MeterReading(roomId, year, month)` (throwing if absent); `generateForMonth` collects rooms with missing readings and returns them. **Prev derivation is unchanged** (previous invoice's current, else the room baseline) — only the *current* source changes.

**Files:**
- Modify: `apps/api/src/invoices/invoices.service.ts`
- Test: `apps/api/src/invoices/invoices.service.spec.ts`

**Interfaces:**
- Consumes: Prisma `MeterReading` (Task 1).
- Produces: `InvoicesService.generateForMonth(month, year): Promise<{ created: number; skipped: number; missingReadings: { roomId: number; roomName: string }[] }>`; `create` throws `BadRequestException` when the target month has no `MeterReading`.

- [ ] **Step 1: Add failing tests**

In `apps/api/src/invoices/invoices.service.spec.ts`, add `meterReading: { findUnique: jest.fn() }` to the `prisma` mock object, then add:

```typescript
  it('throws when the room has no meter reading for the month', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ roomId: 1, month: 7, year: 2026 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sources electricity/water current from the meter reading', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 400,
      waterReading: 40,
    });
    prisma.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, number> }) =>
        Promise.resolve({ id: 1, ...data }),
    );
    await service.create({ roomId: 1, month: 7, year: 2026 });
    const { data } = prisma.invoice.create.mock.calls[0][0];
    expect(data.electricityCurrent).toBe(400);
    expect(data.waterCurrent).toBe(40);
  });
```

Also update the existing `'computes all amounts from settings and meter deltas'` test to stub the reading (it previously relied on `room.electricityReading`): add before the `service.create` call:

```typescript
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm test -- invoices.service`
Expected: FAIL (create still reads `room.electricityReading`).

- [ ] **Step 3: Update `create` to source current from the reading**

In `apps/api/src/invoices/invoices.service.ts`, inside `create`, after the `existing` duplicate check and before computing amounts, add:

```typescript
    const reading = await this.prisma.meterReading.findUnique({
      where: {
        roomId_year_month: {
          roomId: dto.roomId,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (!reading) {
      throw new BadRequestException(
        `Phòng ${room.name} chưa nhập chỉ số điện nước tháng ${dto.month}/${dto.year}`,
      );
    }
```

Then change these two lines:

```typescript
    const electricityCurrent = room.electricityReading;
    const waterCurrent = room.waterReading;
```

to:

```typescript
    const electricityCurrent = reading.electricityReading;
    const waterCurrent = reading.waterReading;
```

- [ ] **Step 4: Update `generateForMonth` to collect missing readings**

Replace the `generateForMonth` body with:

```typescript
  async generateForMonth(
    month: number,
    year: number,
  ): Promise<{
    created: number;
    skipped: number;
    missingReadings: { roomId: number; roomName: string }[];
  }> {
    const rooms = await this.prisma.room.findMany({
      where: { status: 'OCCUPIED' },
    });
    let created = 0;
    let skipped = 0;
    const missingReadings: { roomId: number; roomName: string }[] = [];
    for (const room of rooms) {
      try {
        await this.create({ roomId: room.id, month, year });
        created += 1;
      } catch (e) {
        if (e instanceof ConflictException) {
          skipped += 1;
          continue;
        }
        if (e instanceof BadRequestException) {
          missingReadings.push({ roomId: room.id, roomName: room.name });
          continue;
        }
        throw e;
      }
    }
    return { created, skipped, missingReadings };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- invoices.service`
Expected: PASS (including the updated existing tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/invoices
git commit -m "feat(api): source invoices from meter readings, report missing readings"
```

---

### Task 4: Reading → invoice sync (blocked when PAID)

Adds `InvoicesService.syncMeterReading` (called by Task 2), exports `InvoicesService` from its module, and rejects reading edits that would mutate a PAID invoice.

**Files:**
- Modify: `apps/api/src/invoices/invoices.service.ts`
- Modify: `apps/api/src/invoices/invoices.module.ts`
- Test: `apps/api/src/invoices/invoices.service.spec.ts`

**Interfaces:**
- Produces: `InvoicesService.syncMeterReading(roomId: number, year: number, month: number): Promise<void>` — recomputes the month's invoice current readings, electricity/water amounts, and total from the invoice's own snapshotted unit prices/fees; no-op if no invoice; throws `ConflictException` if the invoice is PAID.
- Consumes (Task 2): `RoomsService` calls `syncMeterReading`.

- [ ] **Step 1: Export `InvoicesService` from `InvoicesModule`**

In `apps/api/src/invoices/invoices.module.ts`, add `exports`:

```typescript
@Module({
  imports: [SettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesCron],
  exports: [InvoicesService],
})
export class InvoicesModule {}
```

- [ ] **Step 2: Add failing tests**

In `apps/api/src/invoices/invoices.service.spec.ts`, add `update` is already mocked. Add:

```typescript
  it('syncMeterReading is a no-op when no invoice exists', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 400,
      waterReading: 40,
    });
    await service.syncMeterReading(1, 2026, 7);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('syncMeterReading recomputes an unpaid invoice from snapshot prices', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 5,
      status: 'UNPAID',
      roomPrice: 3000000,
      electricityPrev: 100,
      electricityUnitPrice: 3500,
      waterPrev: 10,
      waterUnitPrice: 15000,
      internetFee: 100000,
      elevatorFee: 60000,
      cleaningFee: 40000,
      motorbikeFee: 100000,
      otherFee: 50000,
    });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    prisma.invoice.update.mockResolvedValue({});
    await service.syncMeterReading(1, 2026, 7);
    const { data } = prisma.invoice.update.mock.calls[0][0];
    // elec (250-100)*3500=525000 ; water (22-10)*15000=180000
    expect(data.electricityCurrent).toBe(250);
    expect(data.waterCurrent).toBe(22);
    expect(data.totalAmount).toBe(
      3000000 + 525000 + 180000 + 100000 + 60000 + 40000 + 100000 + 50000,
    );
  });

  it('syncMeterReading refuses to touch a PAID invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 5, status: 'PAID' });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 250,
      waterReading: 22,
    });
    await expect(service.syncMeterReading(1, 2026, 7)).rejects.toThrow(
      ConflictException,
    );
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm test -- invoices.service`
Expected: FAIL (`syncMeterReading` not defined).

- [ ] **Step 4: Implement `syncMeterReading`**

In `apps/api/src/invoices/invoices.service.ts`, add a constant near the others:

```typescript
const INVOICE_PAID_LOCKED = 'Hoá đơn kỳ này đã thanh toán, không thể sửa chỉ số';
```

Add the method (e.g. after `generateForMonth`):

```typescript
  async syncMeterReading(
    roomId: number,
    year: number,
    month: number,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { roomId_year_month: { roomId, year, month } },
    });
    if (!invoice) return;
    if (invoice.status === 'PAID') {
      throw new ConflictException(INVOICE_PAID_LOCKED);
    }
    const reading = await this.prisma.meterReading.findUnique({
      where: { roomId_year_month: { roomId, year, month } },
    });
    if (!reading) return;

    const electricityCurrent = reading.electricityReading;
    const waterCurrent = reading.waterReading;
    const electricityAmount =
      (electricityCurrent - invoice.electricityPrev) *
      invoice.electricityUnitPrice;
    const waterAmount =
      (waterCurrent - invoice.waterPrev) * invoice.waterUnitPrice;
    const totalAmount =
      invoice.roomPrice +
      electricityAmount +
      waterAmount +
      invoice.internetFee +
      invoice.elevatorFee +
      invoice.cleaningFee +
      invoice.motorbikeFee +
      invoice.otherFee;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { electricityCurrent, waterCurrent, totalAmount },
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pnpm test -- invoices.service rooms.service`
Expected: PASS. Remove any temporary no-op `syncMeterReading` added during Task 2.

- [ ] **Step 6: Verify app boots (DI wiring)**

Run: `cd apps/api && pnpm build`
Expected: build succeeds (no circular-dependency errors — `RoomsModule` imports `InvoicesModule`, not vice versa).

- [ ] **Step 7: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/invoices
git commit -m "feat(api): sync month invoice on reading edit, lock when paid"
```

---

### Task 5: Invoice full-edit endpoint

**Files:**
- Create: `apps/api/src/invoices/dto/update-invoice.dto.ts`
- Modify: `apps/api/src/invoices/invoices.service.ts`
- Modify: `apps/api/src/invoices/invoices.controller.ts`
- Test: `apps/api/src/invoices/invoices.service.spec.ts`

**Interfaces:**
- Produces: `PATCH /invoices/:id` → `InvoicesService.update(id, dto: UpdateInvoiceDto)`; recomputes `totalAmount`; throws `ConflictException` when PAID, `NotFoundException` when missing.

- [ ] **Step 1: Create the DTO**

`apps/api/src/invoices/dto/update-invoice.dto.ts`:

```typescript
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateInvoiceDto {
  @IsOptional() @IsInt() @Min(0) roomPrice?: number;
  @IsOptional() @IsInt() @Min(0) electricityPrev?: number;
  @IsOptional() @IsInt() @Min(0) electricityCurrent?: number;
  @IsOptional() @IsInt() @Min(0) electricityUnitPrice?: number;
  @IsOptional() @IsInt() @Min(0) waterPrev?: number;
  @IsOptional() @IsInt() @Min(0) waterCurrent?: number;
  @IsOptional() @IsInt() @Min(0) waterUnitPrice?: number;
  @IsOptional() @IsInt() @Min(0) internetFee?: number;
  @IsOptional() @IsInt() @Min(0) elevatorFee?: number;
  @IsOptional() @IsInt() @Min(0) cleaningFee?: number;
  @IsOptional() @IsInt() @Min(0) motorbikeFee?: number;
  @IsOptional() @IsInt() @Min(0) otherFee?: number;
  @IsOptional() @IsInt() @Min(0) occupantCount?: number;
  @IsOptional() @IsInt() @Min(0) motorbikeCount?: number;
}
```

- [ ] **Step 2: Add failing tests**

In `apps/api/src/invoices/invoices.service.spec.ts`:

```typescript
  it('update recomputes total and rejects paid invoices', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({ id: 5, status: 'PAID' });
    await expect(service.update(5, { roomPrice: 1 })).rejects.toThrow(
      ConflictException,
    );

    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 6,
      status: 'UNPAID',
      roomPrice: 3000000,
      electricityPrev: 100,
      electricityCurrent: 250,
      electricityUnitPrice: 3500,
      waterPrev: 10,
      waterCurrent: 22,
      waterUnitPrice: 15000,
      internetFee: 100000,
      elevatorFee: 60000,
      cleaningFee: 40000,
      motorbikeFee: 100000,
      otherFee: 50000,
      occupantCount: 2,
      motorbikeCount: 3,
    });
    prisma.invoice.update.mockResolvedValue({});
    await service.update(6, { roomPrice: 3500000 });
    const { data } = prisma.invoice.update.mock.calls.at(-1)![0];
    expect(data.roomPrice).toBe(3500000);
    expect(data.totalAmount).toBe(
      3500000 + 525000 + 180000 + 100000 + 60000 + 40000 + 100000 + 50000,
    );
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm test -- invoices.service`
Expected: FAIL (`update` not defined).

- [ ] **Step 4: Implement `update`**

Add a constant near the others in `invoices.service.ts`:

```typescript
const EDIT_PAID = 'Không thể sửa hoá đơn đã thanh toán';
```

Import `UpdateInvoiceDto` at the top:

```typescript
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
```

Add the method:

```typescript
  async update(id: number, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (invoice.status === 'PAID') throw new ConflictException(EDIT_PAID);

    const merged = {
      roomPrice: dto.roomPrice ?? invoice.roomPrice,
      electricityPrev: dto.electricityPrev ?? invoice.electricityPrev,
      electricityCurrent: dto.electricityCurrent ?? invoice.electricityCurrent,
      electricityUnitPrice:
        dto.electricityUnitPrice ?? invoice.electricityUnitPrice,
      waterPrev: dto.waterPrev ?? invoice.waterPrev,
      waterCurrent: dto.waterCurrent ?? invoice.waterCurrent,
      waterUnitPrice: dto.waterUnitPrice ?? invoice.waterUnitPrice,
      internetFee: dto.internetFee ?? invoice.internetFee,
      elevatorFee: dto.elevatorFee ?? invoice.elevatorFee,
      cleaningFee: dto.cleaningFee ?? invoice.cleaningFee,
      motorbikeFee: dto.motorbikeFee ?? invoice.motorbikeFee,
      otherFee: dto.otherFee ?? invoice.otherFee,
      occupantCount: dto.occupantCount ?? invoice.occupantCount,
      motorbikeCount: dto.motorbikeCount ?? invoice.motorbikeCount,
    };
    const electricityAmount =
      (merged.electricityCurrent - merged.electricityPrev) *
      merged.electricityUnitPrice;
    const waterAmount =
      (merged.waterCurrent - merged.waterPrev) * merged.waterUnitPrice;
    const totalAmount =
      merged.roomPrice +
      electricityAmount +
      waterAmount +
      merged.internetFee +
      merged.elevatorFee +
      merged.cleaningFee +
      merged.motorbikeFee +
      merged.otherFee;

    return this.prisma.invoice.update({
      where: { id },
      data: { ...merged, totalAmount },
      include: INVOICE_INCLUDE,
    });
  }
```

- [ ] **Step 5: Add the controller route**

In `apps/api/src/invoices/invoices.controller.ts`, import the DTO and add the route (place after `create`, before the `:id/pay` routes is fine):

```typescript
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
```

```typescript
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, dto);
  }
```

- [ ] **Step 6: Run tests + build to verify**

Run: `cd apps/api && pnpm test -- invoices.service && pnpm build`
Expected: PASS + build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/invoices
git commit -m "feat(api): full-edit invoice endpoint with recompute and paid lock"
```

---

### Task 6: Reading-history endpoint

**Files:**
- Modify: `apps/api/src/rooms/rooms.service.ts`
- Modify: `apps/api/src/rooms/rooms.controller.ts`
- Test: `apps/api/src/rooms/rooms.service.spec.ts`

**Interfaces:**
- Produces: `GET /rooms/:id/meter-readings/history` → `RoomsService.getReadingHistory(roomId): Promise<MeterReadingHistory[]>` ordered `changedAt desc`.

- [ ] **Step 1: Add a failing test**

In `apps/api/src/rooms/rooms.service.spec.ts`, add `meterReadingHistory.findMany` to the prisma mock (`meterReadingHistory: { create: jest.fn(), findMany: jest.fn() }`) and a test:

```typescript
  it('getReadingHistory returns history newest first', async () => {
    prisma.meterReadingHistory.findMany.mockResolvedValue([{ id: 1 }]);
    const rows = await service.getReadingHistory(1);
    expect(prisma.meterReadingHistory.findMany).toHaveBeenCalledWith({
      where: { roomId: 1 },
      orderBy: { changedAt: 'desc' },
    });
    expect(rows).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- rooms.service`
Expected: FAIL (`getReadingHistory` not defined).

- [ ] **Step 3: Implement the method**

In `apps/api/src/rooms/rooms.service.ts`:

```typescript
  getReadingHistory(roomId: number) {
    return this.prisma.meterReadingHistory.findMany({
      where: { roomId },
      orderBy: { changedAt: 'desc' },
    });
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/rooms/rooms.controller.ts`, add **before** the `@Get(':id')` route (route ordering matters):

```typescript
  @Get(':id/meter-readings/history')
  getReadingHistory(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.getReadingHistory(id);
  }
```

- [ ] **Step 5: Run test + build**

Run: `cd apps/api && pnpm test -- rooms.service && pnpm build`
Expected: PASS + build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/rooms
git commit -m "feat(api): reading-history endpoint for room detail"
```

---

## Phase 2 — Web: invoice UI

### Task 7: Web actions & types (edit, missing-readings, month-aware readings, history)

**Files:**
- Modify: `apps/web/features/invoices/actions.ts`
- Modify: `apps/web/features/rooms/actions.ts`
- Create: `apps/web/features/rooms/reading-history-types.ts`

**Interfaces:**
- Produces:
  - `updateInvoice(id: number, data: Partial<InvoiceEditable>, roomId?: number): Promise<InvoiceActionState>`
  - `generateInvoices(...)` return gains `missingReadings?: { roomId: number; roomName: string }[]`
  - `bulkUpdateReadings(items, year, month): Promise<RoomFormState>` (signature change: adds `year`, `month`)
  - Type `MeterReadingHistoryRow { id, roomId, year, month, electricityReading, waterReading, changedByName: string | null, changedAt: string }`

- [ ] **Step 1: Extend `generateInvoices` to surface `missingReadings`**

In `apps/web/features/invoices/actions.ts`, change the `generateInvoices` return type and fetch generic:

```typescript
export async function generateInvoices(
  month: number,
  year: number,
): Promise<
  InvoiceActionState & {
    created?: number;
    skipped?: number;
    missingReadings?: { roomId: number; roomName: string }[];
  }
> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<{
    created: number;
    skipped: number;
    missingReadings: { roomId: number; roomName: string }[];
  }>("/invoices/generate", {
    method: "POST",
    token,
    body: JSON.stringify({ month, year }),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages();
  return { error: null, success: true, ...res.data };
}
```

- [ ] **Step 2: Add `updateInvoice` action**

Append to `apps/web/features/invoices/actions.ts`:

```typescript
export interface InvoiceEditable {
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
}

export async function updateInvoice(
  id: number,
  data: Partial<InvoiceEditable>,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>(`/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}
```

- [ ] **Step 3: Make `bulkUpdateReadings` month-aware**

In `apps/web/features/rooms/actions.ts`, replace `bulkUpdateReadings`:

```typescript
export async function bulkUpdateReadings(
  items: MeterReadingItem[],
  year: number,
  month: number,
): Promise<RoomFormState> {
  const res = await authedFetch<{ message: string; updated: number }>(
    "/rooms/meter-readings",
    { method: "PATCH", body: JSON.stringify({ items, year, month }) },
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  revalidatePath("/invoices");
  return { error: null, success: true };
}
```

- [ ] **Step 4: Add reading-history type + fetch action**

Create `apps/web/features/rooms/reading-history-types.ts`:

```typescript
export interface MeterReadingHistoryRow {
  id: number;
  roomId: number;
  year: number;
  month: number;
  electricityReading: number;
  waterReading: number;
  changedByName: string | null;
  changedAt: string;
}
```

The room-detail page fetches history directly via `apiFetch` (Task 12), so no server action is required here.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && pnpm lint`
Expected: no errors from these files (callers updated in later tasks may still reference the old `bulkUpdateReadings` signature — that is fixed in Tasks 11 & the rooms-table update in Step 6 below).

- [ ] **Step 6: Update existing `bulkUpdateReadings` caller signature (rooms bulk dialog)**

`apps/web/features/rooms/components/bulk-readings-dialog.tsx` currently calls `bulkUpdateReadings(items)`. It is reworked in Task 11 to pass `year`/`month`. To keep the tree compiling now, update its single call site to pass the current period:

In `bulk-readings-dialog.tsx`, inside `handleSubmit`, change:

```typescript
      const result = await bulkUpdateReadings(items);
```

to:

```typescript
      const now = new Date();
      const result = await bulkUpdateReadings(
        items,
        now.getFullYear(),
        now.getMonth() + 1,
      );
```

(Task 11 replaces this with explicit `year`/`month` props.)

- [ ] **Step 7: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/invoices/actions.ts apps/web/features/rooms/actions.ts apps/web/features/rooms/reading-history-types.ts apps/web/features/rooms/components/bulk-readings-dialog.tsx
git commit -m "feat(web): invoice edit + missing-readings + month-aware reading actions"
```

---

### Task 8: Invoice detail dialog + collapsible rows + icon actions

Replaces the `...` dropdown in `invoice-list.tsx` with three icon buttons (view / edit / delete), adds an expandable breakdown row, and a read-only detail dialog. Also extracts a shared fee-breakdown helper used by the collapse, the detail dialog (Task 8), the edit dialog (Task 9), and the grid card (Task 10).

**Files:**
- Create: `apps/web/features/invoices/lib/fee-lines.ts`
- Create: `apps/web/features/invoices/components/invoice-detail-dialog.tsx`
- Modify: `apps/web/features/invoices/components/invoice-list.tsx`

**Interfaces:**
- Consumes: `Invoice` type; `formatCurrency`, `formatMonth`, `formatDate`.
- Produces:
  - `computeFeeLines(invoice: Invoice): { electricityAmount: number; waterAmount: number; extraFees: number; lines: { label: string; value: number; hint?: string }[] }`
  - `<InvoiceDetailDialog invoice={Invoice | null} onOpenChange={(open: boolean) => void} />`

- [ ] **Step 1: Create the fee-lines helper**

`apps/web/features/invoices/lib/fee-lines.ts`:

```typescript
import { formatCurrency } from "@/lib/format";
import type { Invoice } from "@/features/invoices/types";

export interface FeeLine {
  label: string;
  value: number;
  hint?: string;
}

export function computeFeeLines(invoice: Invoice): {
  electricityAmount: number;
  waterAmount: number;
  extraFees: number;
  lines: FeeLine[];
} {
  const electricityAmount =
    (invoice.electricityCurrent - invoice.electricityPrev) *
    invoice.electricityUnitPrice;
  const waterAmount =
    (invoice.waterCurrent - invoice.waterPrev) * invoice.waterUnitPrice;
  const extraFees =
    invoice.internetFee +
    invoice.elevatorFee +
    invoice.cleaningFee +
    invoice.motorbikeFee +
    invoice.otherFee;

  const lines: FeeLine[] = [
    { label: "Tiền phòng", value: invoice.roomPrice },
    {
      label: "Tiền điện",
      value: electricityAmount,
      hint: `${invoice.electricityPrev} → ${invoice.electricityCurrent} × ${formatCurrency(invoice.electricityUnitPrice)}`,
    },
    {
      label: "Tiền nước",
      value: waterAmount,
      hint: `${invoice.waterPrev} → ${invoice.waterCurrent} × ${formatCurrency(invoice.waterUnitPrice)}`,
    },
    { label: "Internet", value: invoice.internetFee },
    { label: "Thang máy", value: invoice.elevatorFee },
    { label: "Vệ sinh", value: invoice.cleaningFee },
    { label: "Xe máy", value: invoice.motorbikeFee },
    { label: "Phí khác", value: invoice.otherFee },
  ];

  return { electricityAmount, waterAmount, extraFees, lines };
}
```

- [ ] **Step 2: Create the detail dialog**

`apps/web/features/invoices/components/invoice-detail-dialog.tsx`:

```typescript
"use client";

import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
} from "@/features/invoices/types";
import { computeFeeLines } from "@/features/invoices/lib/fee-lines";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function InvoiceDetailDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={invoice !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {invoice ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Hoá đơn {invoice.room?.name ? `${invoice.room.name} · ` : ""}
                {formatMonth(invoice.month, invoice.year)}
              </DialogTitle>
              <DialogDescription>
                {invoice.status === "PAID" ? (
                  <Badge variant="outline">
                    Đã thanh toán
                    {invoice.paymentMethod
                      ? ` · ${PAYMENT_METHOD_LABEL[invoice.paymentMethod]}`
                      : ""}
                    {invoice.paidAt ? ` · ${formatDate(invoice.paidAt)}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="destructive">Chưa thanh toán</Badge>
                )}
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y text-sm">
              {computeFeeLines(invoice).lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <dt className="text-muted-foreground">
                    {line.label}
                    {line.hint ? (
                      <span className="block text-xs">{line.hint}</span>
                    ) : null}
                  </dt>
                  <dd className="tabular-nums">{formatCurrency(line.value)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-2 font-semibold">
                <dt>Tổng cộng</dt>
                <dd className="tabular-nums">
                  {formatCurrency(invoice.totalAmount)}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Rework `invoice-list.tsx` — collapse + icon actions**

Replace the file `apps/web/features/invoices/components/invoice-list.tsx` with:

```typescript
"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { deleteInvoice, unpayInvoice } from "@/features/invoices/actions";
import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
} from "@/features/invoices/types";
import { computeFeeLines } from "@/features/invoices/lib/fee-lines";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { InvoiceDetailDialog } from "./invoice-detail-dialog";
import { EditInvoiceDialog } from "./edit-invoice-dialog";
import { PayInvoiceDialog } from "./pay-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [detailInvoice, setDetailInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [editingInvoice, setEditingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [, startTransition] = React.useTransition();

  function handleDelete(invoice: Invoice) {
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã xoá hoá đơn");
    });
  }

  function handleUnpay(invoice: Invoice) {
    startTransition(async () => {
      const result = await unpayInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã chuyển về chưa thanh toán");
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

  const colSpan = showRoom ? 9 : 8;

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Kỳ</TableHead>
              {showRoom ? <TableHead>Phòng</TableHead> : null}
              <TableHead>Tiền phòng</TableHead>
              <TableHead>Điện</TableHead>
              <TableHead>Nước</TableHead>
              <TableHead>Phí khác</TableHead>
              <TableHead>Tổng cộng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const { electricityAmount, waterAmount, extraFees, lines } =
                computeFeeLines(invoice);
              const isOpen = expanded === invoice.id;
              return (
                <React.Fragment key={invoice.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={isOpen ? "Thu gọn" : "Xem thêm"}
                        onClick={() =>
                          setExpanded(isOpen ? null : invoice.id)
                        }
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </Button>
                    </TableCell>
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
                            Thanh toán
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnpay(invoice)}
                          >
                            Huỷ TT
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Xem chi tiết"
                          title="Xem chi tiết"
                          onClick={() => setDetailInvoice(invoice)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Sửa hoá đơn"
                          title="Sửa hoá đơn"
                          disabled={invoice.status === "PAID"}
                          onClick={() => setEditingInvoice(invoice)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Xoá hoá đơn"
                          title="Xoá hoá đơn"
                          disabled={invoice.status === "PAID"}
                          onClick={() => handleDelete(invoice)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen ? (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={colSpan - 1}>
                        <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                          {lines.map((line) => (
                            <div
                              key={line.label}
                              className="flex items-center justify-between gap-4 py-0.5 text-sm"
                            >
                              <dt className="text-muted-foreground">
                                {line.label}
                                {line.hint ? (
                                  <span className="ml-1 text-xs">
                                    ({line.hint})
                                  </span>
                                ) : null}
                              </dt>
                              <dd className="tabular-nums">
                                {formatCurrency(line.value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {invoice.status === "PAID" && invoice.paidAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Thanh toán ngày {formatDate(invoice.paidAt)}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PayInvoiceDialog
        invoice={payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
      />
      <InvoiceDetailDialog
        invoice={detailInvoice}
        onOpenChange={(open) => !open && setDetailInvoice(null)}
      />
      <EditInvoiceDialog
        invoice={editingInvoice}
        onOpenChange={(open) => !open && setEditingInvoice(null)}
      />
    </>
  );
}
```

> `EditInvoiceDialog` is created in Task 9. Do Task 9 before running the web build.

- [ ] **Step 4: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/invoices/lib/fee-lines.ts apps/web/features/invoices/components/invoice-detail-dialog.tsx apps/web/features/invoices/components/invoice-list.tsx
git commit -m "feat(web): collapsible invoice rows, icon actions, detail dialog"
```

---

### Task 9: Edit invoice dialog

**Files:**
- Create: `apps/web/features/invoices/components/edit-invoice-dialog.tsx`

**Interfaces:**
- Consumes: `updateInvoice`, `InvoiceEditable` (Task 7); `Invoice` type.
- Produces: `<EditInvoiceDialog invoice={Invoice | null} onOpenChange={(open: boolean) => void} />`.

- [ ] **Step 1: Create the edit dialog**

`apps/web/features/invoices/components/edit-invoice-dialog.tsx`:

```typescript
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  updateInvoice,
  type InvoiceEditable,
} from "@/features/invoices/actions";
import type { Invoice } from "@/features/invoices/types";
import { formatMonth } from "@/lib/format";
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

const FIELDS: { key: keyof InvoiceEditable; label: string }[] = [
  { key: "roomPrice", label: "Tiền phòng" },
  { key: "electricityPrev", label: "Chỉ số điện cũ" },
  { key: "electricityCurrent", label: "Chỉ số điện mới" },
  { key: "electricityUnitPrice", label: "Đơn giá điện" },
  { key: "waterPrev", label: "Chỉ số nước cũ" },
  { key: "waterCurrent", label: "Chỉ số nước mới" },
  { key: "waterUnitPrice", label: "Đơn giá nước" },
  { key: "internetFee", label: "Internet" },
  { key: "elevatorFee", label: "Thang máy" },
  { key: "cleaningFee", label: "Vệ sinh" },
  { key: "motorbikeFee", label: "Xe máy" },
  { key: "otherFee", label: "Phí khác" },
  { key: "occupantCount", label: "Số người" },
  { key: "motorbikeCount", label: "Số xe" },
];

export function EditInvoiceDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (invoice) {
      setDraft(
        Object.fromEntries(
          FIELDS.map((f) => [f.key, String(invoice[f.key] ?? 0)]),
        ),
      );
    }
  }, [invoice]);

  function handleSubmit() {
    if (!invoice) return;
    const data: Partial<InvoiceEditable> = {};
    for (const f of FIELDS) {
      const raw = draft[f.key];
      if (raw === "" || raw === undefined) continue;
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0) {
        toast.error(`Giá trị "${f.label}" không hợp lệ`);
        return;
      }
      data[f.key] = num;
    }
    startTransition(async () => {
      const result = await updateInvoice(invoice.id, data, invoice.roomId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Đã cập nhật hoá đơn");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {invoice ? (
          <>
            <DialogHeader>
              <DialogTitle>Sửa hoá đơn</DialogTitle>
              <DialogDescription>
                {invoice.room?.name ? `${invoice.room.name} · ` : ""}
                {formatMonth(invoice.month, invoice.year)} — tổng tiền sẽ được
                tính lại.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <Label htmlFor={`edit-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`edit-${f.key}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft[f.key] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
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
                Lưu
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build the web app to verify Tasks 8+9 compile**

Run: `cd apps/web && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/invoices/components/edit-invoice-dialog.tsx
git commit -m "feat(web): full-edit invoice dialog"
```

---

### Task 10: List ⇄ grid view toggle

**Files:**
- Create: `apps/web/features/invoices/components/invoice-grid.tsx`
- Create: `apps/web/features/invoices/components/invoice-view-toggle.tsx`
- Modify: `apps/web/app/(admin)/invoices/page.tsx`

**Interfaces:**
- Consumes: `Invoice`, `computeFeeLines`, invoice actions/dialogs.
- Produces: `<InvoiceGrid invoices={Invoice[]} />`; `<InvoiceViewToggle view={"list" | "grid"} month year />`; page reads `view` search param (default `"list"`).

- [ ] **Step 1: Create the grid**

`apps/web/features/invoices/components/invoice-grid.tsx`:

```typescript
"use client";

import * as React from "react";
import { Eye, Pencil, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteInvoice, unpayInvoice } from "@/features/invoices/actions";
import { type Invoice } from "@/features/invoices/types";
import { computeFeeLines } from "@/features/invoices/lib/fee-lines";
import { formatCurrency, formatMonth } from "@/lib/format";
import { InvoiceDetailDialog } from "./invoice-detail-dialog";
import { EditInvoiceDialog } from "./edit-invoice-dialog";
import { PayInvoiceDialog } from "./pay-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InvoiceGrid({ invoices }: { invoices: Invoice[] }) {
  const [payingInvoice, setPayingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [detailInvoice, setDetailInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [editingInvoice, setEditingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [, startTransition] = React.useTransition();

  function handleDelete(invoice: Invoice) {
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã xoá hoá đơn");
    });
  }

  function handleUnpay(invoice: Invoice) {
    startTransition(async () => {
      const result = await unpayInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã chuyển về chưa thanh toán");
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {invoices.map((invoice) => {
          const { electricityAmount, waterAmount, extraFees } =
            computeFeeLines(invoice);
          return (
            <Card key={invoice.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">
                    {invoice.room?.name ?? "—"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatMonth(invoice.month, invoice.year)}
                  </p>
                </div>
                {invoice.status === "PAID" ? (
                  <Badge variant="outline">Đã thanh toán</Badge>
                ) : (
                  <Badge variant="destructive">Chưa thanh toán</Badge>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <dl className="grid gap-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tiền phòng</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(invoice.roomPrice)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Điện</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(electricityAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Nước</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(waterAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phí khác</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(extraFees)}
                    </dd>
                  </div>
                  <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                    <dt>Tổng cộng</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(invoice.totalAmount)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex items-center gap-1">
                  {invoice.status === "UNPAID" ? (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setPayingInvoice(invoice)}
                    >
                      Thanh toán
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleUnpay(invoice)}
                    >
                      Huỷ TT
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Xem chi tiết"
                    title="Xem chi tiết"
                    onClick={() => setDetailInvoice(invoice)}
                  >
                    <Eye className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sửa hoá đơn"
                    title="Sửa hoá đơn"
                    disabled={invoice.status === "PAID"}
                    onClick={() => setEditingInvoice(invoice)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Xoá hoá đơn"
                    title="Xoá hoá đơn"
                    disabled={invoice.status === "PAID"}
                    onClick={() => handleDelete(invoice)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <PayInvoiceDialog
        invoice={payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
      />
      <InvoiceDetailDialog
        invoice={detailInvoice}
        onOpenChange={(open) => !open && setDetailInvoice(null)}
      />
      <EditInvoiceDialog
        invoice={editingInvoice}
        onOpenChange={(open) => !open && setEditingInvoice(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Create the view toggle**

`apps/web/features/invoices/components/invoice-view-toggle.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InvoiceViewToggle({
  view,
  month,
  year,
}: {
  view: "list" | "grid";
  month: number;
  year: number;
}) {
  const router = useRouter();
  function go(next: "list" | "grid") {
    router.push(`/invoices?month=${month}&year=${year}&view=${next}`);
  }
  return (
    <div className="inline-flex rounded-md border">
      <Button
        type="button"
        variant={view === "list" ? "secondary" : "ghost"}
        size="icon"
        aria-label="Dạng danh sách"
        aria-pressed={view === "list"}
        className="rounded-r-none"
        onClick={() => go("list")}
      >
        <List className="size-4" />
      </Button>
      <Button
        type="button"
        variant={view === "grid" ? "secondary" : "ghost"}
        size="icon"
        aria-label="Dạng lưới"
        aria-pressed={view === "grid"}
        className="rounded-l-none"
        onClick={() => go("grid")}
      >
        <LayoutGrid className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Wire the page to read `view` and render toggle + chosen view**

Replace `apps/web/app/(admin)/invoices/page.tsx` with:

```typescript
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { InvoiceGrid } from "@/features/invoices/components/invoice-grid";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import { InvoiceViewToggle } from "@/features/invoices/components/invoice-view-toggle";
import { InvoicesToolbar } from "@/features/invoices/components/invoices-toolbar";
import type { Invoice } from "@/features/invoices/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Hoá đơn" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month) || now.getMonth() + 1;
  const year = Number(params.year) || now.getFullYear();
  const view = params.view === "grid" ? "grid" : "list";

  const token = await getSessionToken();
  const res = await apiFetch<Invoice[]>(
    `/invoices?month=${month}&year=${year}`,
    { token: token ?? undefined },
  );
  const invoices = res.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hoá đơn"
        description="Hoá đơn hàng tháng của các phòng — tự động sinh vào ngày cuối tháng"
      />
      <InvoicesToolbar month={month} year={year} />
      <div className="flex justify-end">
        <InvoiceViewToggle view={view} month={month} year={year} />
      </div>
      {view === "grid" ? (
        <InvoiceGrid invoices={invoices} />
      ) : (
        <InvoiceList invoices={invoices} showRoom />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build to verify**

Run: `cd apps/web && pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/invoices/components/invoice-grid.tsx apps/web/features/invoices/components/invoice-view-toggle.tsx "apps/web/app/(admin)/invoices/page.tsx"
git commit -m "feat(web): list/grid view toggle for invoices"
```

---

### Task 11: Month-scoped reading dialog + pre-generate warning

Makes `BulkReadingsDialog` month/year-aware, adds a "Cập nhật chỉ số điện nước" button next to "Tạo hoá đơn" in the invoices toolbar, and warns (listing rooms) when generation reports `missingReadings`.

**Files:**
- Modify: `apps/web/features/rooms/components/bulk-readings-dialog.tsx`
- Modify: `apps/web/features/rooms/components/rooms-table.tsx`
- Modify: `apps/web/features/invoices/components/invoices-toolbar.tsx`
- Modify: `apps/web/app/(admin)/invoices/page.tsx` (pass rooms to toolbar)

**Interfaces:**
- Consumes: `bulkUpdateReadings(items, year, month)` (Task 7); `generateInvoices` returning `missingReadings` (Task 7); `Room` list from `/rooms`.
- Produces: `<BulkReadingsDialog open onOpenChange rooms year month />` (adds `year`, `month` props); `<InvoicesToolbar month year rooms />` (adds `rooms`).

- [ ] **Step 1: Add `year`/`month` props to `BulkReadingsDialog`**

In `apps/web/features/rooms/components/bulk-readings-dialog.tsx`:

- Extend the props interface:

```typescript
interface BulkReadingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
  year: number;
  month: number;
}
```

- Update the component signature to destructure `year`, `month`.
- In `handleSubmit`, replace the temporary `now`-based call from Task 7 Step 6 with:

```typescript
      const result = await bulkUpdateReadings(items, year, month);
```

- Update the dialog description to name the period:

```tsx
          <DialogDescription>
            Nhập chỉ số mới cho kỳ {month}/{year}. Phòng bỏ trống sẽ không thay
            đổi.
          </DialogDescription>
```

- [ ] **Step 2: Update the rooms-table caller**

In `apps/web/features/rooms/components/rooms-table.tsx`, find the `<BulkReadingsDialog ... />` render and pass the current period:

```tsx
        <BulkReadingsDialog
          key={bulkKey}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          rooms={rooms}
          year={new Date().getFullYear()}
          month={new Date().getMonth() + 1}
        />
```

(If the existing render lacks `key={bulkKey}`, keep whatever props it already had and just add `year`/`month`.)

- [ ] **Step 3: Rework the invoices toolbar**

Replace `apps/web/features/invoices/components/invoices-toolbar.tsx` with:

```typescript
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import { generateInvoices } from "@/features/invoices/actions";
import { BulkReadingsDialog } from "@/features/rooms/components/bulk-readings-dialog";
import type { Room } from "@/features/rooms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvoicesToolbar({
  month,
  year,
  rooms,
}: {
  month: number;
  year: number;
  rooms: Room[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [readingsOpen, setReadingsOpen] = React.useState(false);
  const [readingsKey, setReadingsKey] = React.useState(0);

  const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED");

  function navigate(nextMonth: number, nextYear: number) {
    router.push(`/invoices?month=${nextMonth}&year=${nextYear}`);
  }

  function openReadings() {
    setReadingsKey((k) => k + 1);
    setReadingsOpen(true);
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInvoices(month, year);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const missing = result.missingReadings ?? [];
      if (missing.length > 0) {
        toast.warning(
          `Chưa nhập chỉ số cho ${missing.length} phòng: ${missing
            .map((m) => m.roomName)
            .join(", ")}. Vui lòng cập nhật chỉ số điện nước.`,
        );
      }
      toast.success(
        `Đã tạo ${result.created ?? 0} hoá đơn, bỏ qua ${result.skipped ?? 0} phòng đã có hoá đơn`,
      );
      if (missing.length > 0) openReadings();
      router.refresh();
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
      <div className="flex items-end gap-2">
        <Button
          variant="outline"
          onClick={openReadings}
          disabled={occupiedRooms.length === 0}
        >
          <Gauge className="size-4" />
          Cập nhật chỉ số điện nước
        </Button>
        <Button onClick={handleGenerate} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Zap className="size-4" />
          )}
          Tạo hoá đơn tháng {month}/{year}
        </Button>
      </div>
      <BulkReadingsDialog
        key={readingsKey}
        open={readingsOpen}
        onOpenChange={setReadingsOpen}
        rooms={occupiedRooms}
        year={year}
        month={month}
      />
    </div>
  );
}
```

- [ ] **Step 4: Fetch rooms in the page and pass to the toolbar**

In `apps/web/app/(admin)/invoices/page.tsx`, add a rooms fetch and pass it in. Add the import and type:

```typescript
import type { Room } from "@/features/rooms/types";
```

After the invoices fetch, add:

```typescript
  const roomsRes = await apiFetch<Room[]>("/rooms", {
    token: token ?? undefined,
  });
  const rooms = roomsRes.data ?? [];
```

Change the toolbar render to:

```tsx
      <InvoicesToolbar month={month} year={year} rooms={rooms} />
```

- [ ] **Step 5: Build to verify**

Run: `cd apps/web && pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/rooms/components/bulk-readings-dialog.tsx apps/web/features/rooms/components/rooms-table.tsx apps/web/features/invoices/components/invoices-toolbar.tsx "apps/web/app/(admin)/invoices/page.tsx"
git commit -m "feat(web): month-scoped reading dialog and missing-reading warning on generate"
```

---

## Phase 3 — Web: room detail

### Task 12: Reading-edit history table

**Files:**
- Create: `apps/web/features/rooms/components/reading-history-table.tsx`
- Modify: `apps/web/app/(admin)/rooms/[id]/page.tsx`

**Interfaces:**
- Consumes: `MeterReadingHistoryRow` (Task 7); `GET /rooms/:id/meter-readings/history` (Task 6).
- Produces: `<ReadingHistoryTable rows={MeterReadingHistoryRow[]} />`.

- [ ] **Step 1: Create the history table component**

`apps/web/features/rooms/components/reading-history-table.tsx`:

```typescript
import type { MeterReadingHistoryRow } from "@/features/rooms/reading-history-types";
import { formatDateTime, formatMonth } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ReadingHistoryTable({
  rows,
}: {
  rows: MeterReadingHistoryRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có lịch sử chỉnh sửa chỉ số.
      </p>
    );
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kỳ</TableHead>
            <TableHead>Chỉ số điện (kWh)</TableHead>
            <TableHead>Chỉ số nước (m³)</TableHead>
            <TableHead>Người sửa</TableHead>
            <TableHead>Thời gian</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {formatMonth(row.month, row.year)}
              </TableCell>
              <TableCell className="tabular-nums">
                {row.electricityReading}
              </TableCell>
              <TableCell className="tabular-nums">
                {row.waterReading}
              </TableCell>
              <TableCell>{row.changedByName ?? "—"}</TableCell>
              <TableCell className="tabular-nums">
                {formatDateTime(row.changedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Fetch history and render the section on the room detail page**

In `apps/web/app/(admin)/rooms/[id]/page.tsx`:

- Add imports:

```typescript
import { ReadingHistoryTable } from "@/features/rooms/components/reading-history-table";
import type { MeterReadingHistoryRow } from "@/features/rooms/reading-history-types";
```

- After `const room = res.data;`, fetch the history:

```typescript
  const historyRes = await apiFetch<MeterReadingHistoryRow[]>(
    `/rooms/${id}/meter-readings/history`,
    { token: token ?? undefined },
  );
  const readingHistory = historyRes.data ?? [];
```

- Add a new section just before `<RoomInvoicesSection ... />`:

```tsx
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Lịch sử chỉnh sửa chỉ số</h2>
        <ReadingHistoryTable rows={readingHistory} />
      </section>
```

- [ ] **Step 3: Build to verify**

Run: `cd apps/web && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/rooms/components/reading-history-table.tsx "apps/web/app/(admin)/rooms/[id]/page.tsx"
git commit -m "feat(web): reading-edit history table on room detail"
```

---

## Final verification

- [ ] **Backend:** `cd apps/api && pnpm test && pnpm lint && pnpm build` — all green.
- [ ] **Web:** `cd apps/web && pnpm lint && pnpm build` — all green.
- [ ] **Manual (requires DB + rebuilt API container):** from repo root `docker compose up -d --build api`, then:
  1. Rooms page → "Cập nhật chỉ số điện nước" saves a reading; room detail shows a new history row.
  2. Invoices page → "Cập nhật chỉ số điện nước" (next to generate) saves readings for the page's month/year.
  3. Generate with a room missing readings → warning lists that room and opens the reading dialog; rooms with readings still get invoices.
  4. Invoice row chevron expands the fee breakdown; 👁 opens detail; ✏️ opens edit (recomputes total); 🗑 deletes. ✏️ and 🗑 disabled on PAID invoices.
  5. Edit a reading for a month with an existing UNPAID invoice → invoice total updates; for a PAID invoice → rejected with a clear message.
  6. Toggle list ⇄ grid; grid cards show room, period, status, fee lines, total, actions.
```
