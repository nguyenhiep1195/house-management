# Readings / Contracts / Invoices / Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the meter-reading baseline reset per rental contract (captured at contract creation), add per-room reading editing on the room detail screen, and polish the invoice/dashboard/list UI.

**Architecture:** Backend (NestJS + Prisma) gains two columns on `Contract` and a contract-aware baseline in invoice creation; `generateForMonth` returns the names of skipped rooms. Frontend (Next.js 16 RSC + shadcn/ui) surfaces contract initial readings in the contract form, a single-room reading dialog on room detail, icon action columns, an accent-driven chart palette, and a "rooms already invoiced" toast.

**Tech Stack:** NestJS 11, Prisma 7 (MySQL, client generated to `apps/api/src/generated/`), Jest; Next.js 16.2 (App Router/RSC), React 19, Tailwind v4 (CSS vars in `app/globals.css`), shadcn/ui, lucide-react, sonner, recharts.

## Global Constraints

- User-facing copy is **Vietnamese**; code/comments/identifiers in **English**.
- API: every endpoint authenticated by default; input via class-validator DTOs (`whitelist: true`); DB access only through Prisma. Do not weaken these.
- `apps/api` is regular files in the root repo (no nested `.git`) — run all `git` commands from the repo root `/Users/hiepnn/projects/house-management` with full `apps/api/...` paths.
- The API runs in Docker and MySQL is provided by the root `docker-compose.yml` — Prisma migrations need the DB container up (`docker compose up -d mysql`).
- Backend commands run from `apps/api`; frontend commands run from `apps/web` (each app has its own `package.json`/`pnpm-lock.yaml`; no root workspace).
- End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Web components that are feature-specific live under `features/<domain>/components/`.

---

### Task 1: Add initial-reading columns to `Contract` (Prisma schema + migration)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Contract`, lines 141-156)

**Interfaces:**
- Consumes: nothing.
- Produces: `Contract.initialElectricityReading: Int` and `Contract.initialWaterReading: Int` (default `0`) on the generated Prisma client — Tasks 2 and 3 rely on these.

- [ ] **Step 1: Ensure the MySQL container is running**

Run (from repo root):
```bash
docker compose up -d mysql
```
Expected: container `mysql` is `Up` (or already running).

- [ ] **Step 2: Add the two columns to the `Contract` model**

In `apps/api/prisma/schema.prisma`, inside `model Contract`, add the two fields right after `deposit`:

```prisma
model Contract {
  id                        Int            @id @default(autoincrement())
  roomId                    Int
  room                      Room           @relation(fields: [roomId], references: [id], onDelete: Cascade)
  price                     Int
  deposit                   Int            @default(0)
  initialElectricityReading Int            @default(0)
  initialWaterReading       Int            @default(0)
  startDate                 DateTime
  endDate                   DateTime
  status                    ContractStatus @default(ACTIVE)
  note                      String?
  createdAt                 DateTime       @default(now())
  updatedAt                 DateTime       @updatedAt

  @@index([roomId])
  @@map("contracts")
}
```

(Keep whatever alignment `prisma format` produces; only the two new fields matter.)

- [ ] **Step 3: Create the migration and regenerate the client**

Run (from `apps/api`):
```bash
pnpm prisma migrate dev --name contract_initial_readings
```
Expected: a new folder under `apps/api/prisma/migrations/` and "✔ Generated Prisma Client". The generated types now include the two fields.

- [ ] **Step 4: Verify the schema and client compile**

Run (from `apps/api`):
```bash
pnpm prisma validate && pnpm build
```
Expected: "The schema at prisma/schema.prisma is valid" and a clean `nest build`.

- [ ] **Step 5: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add initial electricity/water readings to Contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Contract DTOs + service store initial readings and seed room readings

**Files:**
- Modify: `apps/api/src/contracts/dto/create-contract.dto.ts`
- Modify: `apps/api/src/contracts/dto/update-contract.dto.ts`
- Modify: `apps/api/src/contracts/contracts.service.ts` (`create`, lines 33-66)
- Test: `apps/api/src/contracts/contracts.service.spec.ts`

**Interfaces:**
- Consumes: `Contract.initialElectricityReading`, `Contract.initialWaterReading` (Task 1).
- Produces: `CreateContractDto` now requires `initialElectricityReading: number` and `initialWaterReading: number`; on create, the room's current `electricityReading`/`waterReading` are set to these values.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/contracts/contracts.service.spec.ts`, update the shared `tx` mock so `room.update` is spied (already present) and add two tests inside the `describe` block:

```typescript
it('stores contract initial readings and seeds room current readings', async () => {
  prisma.room.findUnique.mockResolvedValue(room);
  prisma.contract.findFirst.mockResolvedValue(null);
  tx.contract.create.mockResolvedValue(contract);
  await service.create({
    roomId: 1,
    price: 3200000,
    deposit: 3000000,
    initialElectricityReading: 500,
    initialWaterReading: 50,
    startDate: '2026-07-01',
    endDate: '2027-07-01',
  });
  const createArgs = tx.contract.create.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };
  expect(createArgs.data.initialElectricityReading).toBe(500);
  expect(createArgs.data.initialWaterReading).toBe(50);
  expect(tx.room.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: {
      status: 'OCCUPIED',
      price: 3200000,
      electricityReading: 500,
      waterReading: 50,
    },
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/api`):
```bash
pnpm test contracts.service.spec.ts
```
Expected: FAIL — `data.initialElectricityReading` is `undefined` and `room.update` was called without the reading fields.

- [ ] **Step 3: Update the DTOs**

`apps/api/src/contracts/dto/create-contract.dto.ts` — add two required fields after `deposit`:

```typescript
  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsInt()
  @Min(0)
  initialElectricityReading!: number;

  @IsInt()
  @Min(0)
  initialWaterReading!: number;
```

`apps/api/src/contracts/dto/update-contract.dto.ts` — add two optional fields after `deposit`:

```typescript
  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialElectricityReading?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialWaterReading?: number;
```

- [ ] **Step 4: Update `ContractsService.create`**

In `apps/api/src/contracts/contracts.service.ts`, replace the `$transaction` body (lines 48-65) with:

```typescript
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
```

- [ ] **Step 5: Fix the existing create test to pass the new required fields**

The existing test "creates an ACTIVE contract and syncs room price + status" (lines 90-105) calls `service.create` without the reading fields and asserts the exact `room.update` payload. Update it:

```typescript
  it('creates an ACTIVE contract and syncs room price + status', async () => {
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.contract.findFirst.mockResolvedValue(null);
    tx.contract.create.mockResolvedValue(contract);
    await service.create({
      roomId: 1,
      price: 3200000,
      deposit: 3000000,
      initialElectricityReading: 500,
      initialWaterReading: 50,
      startDate: '2026-07-01',
      endDate: '2027-07-01',
    });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'OCCUPIED',
        price: 3200000,
        electricityReading: 500,
        waterReading: 50,
      },
    });
  });
```

The other `create` tests (non-existent room, bad date range, second ACTIVE) throw before the transaction, so their missing reading fields don't matter at runtime — but TypeScript requires them. Add `initialElectricityReading: 0, initialWaterReading: 0,` to each `service.create({...})` call in those three tests (lines 55-62, 67-74, 80-87).

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `apps/api`):
```bash
pnpm test contracts.service.spec.ts
```
Expected: PASS (all tests green).

- [ ] **Step 7: Lint**

Run (from `apps/api`):
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/contracts
git commit -m "feat(api): capture contract initial readings and seed room readings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Invoice baseline from the governing contract

**Files:**
- Modify: `apps/api/src/invoices/invoices.service.ts` (`create`, readings block lines 79-93)
- Test: `apps/api/src/invoices/invoices.service.spec.ts`

**Interfaces:**
- Consumes: `Contract.initialElectricityReading`, `Contract.initialWaterReading` (Task 1); `PrismaService.contract.findFirst`.
- Produces: invoice `electricityPrev`/`waterPrev` precedence = previous invoice within the contract span → governing contract's initial reading → room's initial reading.

- [ ] **Step 1: Add `contract` to the prisma mock and default it in `beforeEach`**

In `apps/api/src/invoices/invoices.service.spec.ts`, add a `contract` mock to the `prisma` object (after the `room` line, line 24):

```typescript
    room: { findUnique: jest.fn(), findMany: jest.fn() },
    contract: { findFirst: jest.fn() },
    meterReading: { findUnique: jest.fn() },
```

In `beforeEach` (after `settings.get.mockResolvedValue(setting);`, line 58) default it to "no contract" so the existing room-initial-fallback tests keep passing:

```typescript
    settings.get.mockResolvedValue(setting);
    prisma.contract.findFirst.mockResolvedValue(null);
```

- [ ] **Step 2: Write the failing tests**

Add three tests to `apps/api/src/invoices/invoices.service.spec.ts`:

```typescript
it('uses the governing contract initial readings when no invoice exists yet', async () => {
  prisma.room.findUnique.mockResolvedValue(room);
  prisma.invoice.findUnique.mockResolvedValue(null);
  prisma.invoice.findFirst.mockResolvedValue(null); // no prior invoice in span
  prisma.contract.findFirst.mockResolvedValue({
    id: 1,
    startDate: new Date('2026-07-01'),
    initialElectricityReading: 500,
    initialWaterReading: 50,
  });
  prisma.meterReading.findUnique.mockResolvedValue({
    electricityReading: 560,
    waterReading: 58,
  });
  prisma.invoice.create.mockImplementation(
    ({ data }: { data: Record<string, number> }) =>
      Promise.resolve({ id: 1, ...data }),
  );

  await service.create({ roomId: 1, month: 7, year: 2026 });
  const { data } = prisma.invoice.create.mock.calls[0][0];
  expect(data.electricityPrev).toBe(500);
  expect(data.waterPrev).toBe(50);
});

it('scopes the previous-invoice lookup to the governing contract span', async () => {
  prisma.room.findUnique.mockResolvedValue(room);
  prisma.invoice.findUnique.mockResolvedValue(null);
  prisma.invoice.findFirst.mockResolvedValue(null);
  prisma.contract.findFirst.mockResolvedValue({
    id: 1,
    startDate: new Date('2026-08-01'),
    initialElectricityReading: 500,
    initialWaterReading: 50,
  });
  prisma.meterReading.findUnique.mockResolvedValue({
    electricityReading: 560,
    waterReading: 58,
  });
  prisma.invoice.create.mockImplementation(
    ({ data }: { data: Record<string, number> }) =>
      Promise.resolve({ id: 1, ...data }),
  );

  await service.create({ roomId: 1, month: 8, year: 2026 });
  const where = prisma.invoice.findFirst.mock.calls[0][0].where;
  expect(where.AND).toEqual([
    { OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lt: 8 } }] },
    { OR: [{ year: { gt: 2026 } }, { year: 2026, month: { gte: 8 } }] },
  ]);
});

it('prefers a previous invoice over the contract initial when one exists in span', async () => {
  prisma.room.findUnique.mockResolvedValue(room);
  prisma.invoice.findUnique.mockResolvedValue(null);
  prisma.contract.findFirst.mockResolvedValue({
    id: 1,
    startDate: new Date('2026-07-01'),
    initialElectricityReading: 500,
    initialWaterReading: 50,
  });
  prisma.invoice.findFirst.mockResolvedValue({
    electricityCurrent: 540,
    waterCurrent: 55,
  });
  prisma.meterReading.findUnique.mockResolvedValue({
    electricityReading: 560,
    waterReading: 58,
  });
  prisma.invoice.create.mockImplementation(
    ({ data }: { data: Record<string, number> }) =>
      Promise.resolve({ id: 1, ...data }),
  );

  await service.create({ roomId: 1, month: 8, year: 2026 });
  const { data } = prisma.invoice.create.mock.calls[0][0];
  expect(data.electricityPrev).toBe(540);
  expect(data.waterPrev).toBe(55);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/api`):
```bash
pnpm test invoices.service.spec.ts -t "governing contract"
```
Expected: FAIL — `data.electricityPrev` is `100` (room initial) because contract logic is not wired yet.

- [ ] **Step 4: Implement the contract-aware baseline**

In `apps/api/src/invoices/invoices.service.ts`, replace the previous-invoice block (lines 79-93) with:

```typescript
    // governing contract for this billing period: the room's latest contract
    // that started on or before the end of the billing month
    const periodEnd = new Date(dto.year, dto.month, 0, 23, 59, 59);
    const contract = await this.prisma.contract.findFirst({
      where: { roomId: dto.roomId, startDate: { lte: periodEnd } },
      orderBy: { startDate: 'desc' },
    });
    const contractStartYear = contract?.startDate.getFullYear();
    const contractStartMonth = contract
      ? contract.startDate.getMonth() + 1
      : undefined;

    // previous billing period: latest invoice strictly before (year, month),
    // and — when a governing contract exists — no earlier than its start month,
    // so a new contract resets the baseline.
    const beforePeriod = {
      OR: [
        { year: { lt: dto.year } },
        { year: dto.year, month: { lt: dto.month } },
      ],
    };
    const withinContract =
      contractStartYear !== undefined && contractStartMonth !== undefined
        ? {
            OR: [
              { year: { gt: contractStartYear } },
              { year: contractStartYear, month: { gte: contractStartMonth } },
            ],
          }
        : undefined;
    const previous = await this.prisma.invoice.findFirst({
      where: {
        roomId: dto.roomId,
        AND: withinContract ? [beforePeriod, withinContract] : [beforePeriod],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const electricityPrev =
      previous?.electricityCurrent ??
      contract?.initialElectricityReading ??
      room.initialElectricityReading;
    const waterPrev =
      previous?.waterCurrent ??
      contract?.initialWaterReading ??
      room.initialWaterReading;
```

(The `electricityCurrent`/`waterCurrent`/amount lines that follow at old lines 94-99 stay unchanged.)

- [ ] **Step 5: Run the invoice tests to verify they pass**

Run (from `apps/api`):
```bash
pnpm test invoices.service.spec.ts
```
Expected: PASS — new tests green, and the existing "computes all amounts" / "previous invoice readings" tests still pass (contract mock defaults to `null`, so they fall back to room initial / prior invoice as before).

- [ ] **Step 6: Lint**

Run (from `apps/api`):
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/invoices
git commit -m "feat(api): invoice baseline resets per governing contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `generateForMonth` returns skipped room names

**Files:**
- Modify: `apps/api/src/invoices/invoices.service.ts` (`generateForMonth`, lines 154-185)
- Test: `apps/api/src/invoices/invoices.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `generateForMonth` return type gains `skippedRooms: { roomId: number; roomName: string }[]`.

- [ ] **Step 1: Update the existing `generateForMonth` tests and add a new one**

In `apps/api/src/invoices/invoices.service.spec.ts`, the four existing `generateForMonth` tests assert exact objects that now need `skippedRooms`. Update each `toEqual`:

- "creates invoices only for OCCUPIED rooms without one" →
  `expect(result).toEqual({ created: 0, skipped: 1, skippedRooms: [{ roomId: 1, roomName: 'P101' }], missingReadings: [] });`
- "increments created for an OCCUPIED room with no existing invoice" →
  `expect(result).toEqual({ created: 1, skipped: 0, skippedRooms: [], missingReadings: [] });`
- "counts a concurrent P2002 from create as skipped, not fatal" →
  `expect(result).toEqual({ created: 0, skipped: 1, skippedRooms: [{ roomId: 1, roomName: 'P101' }], missingReadings: [] });`
- "collects rooms with missing readings" →
  `expect(result).toEqual({ created: 0, skipped: 0, skippedRooms: [], missingReadings: [{ roomId: 1, roomName: 'P101' }] });`

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`):
```bash
pnpm test invoices.service.spec.ts -t "generateForMonth"
```
Expected: FAIL — results lack the `skippedRooms` key.

- [ ] **Step 3: Implement `skippedRooms` collection**

In `apps/api/src/invoices/invoices.service.ts`, replace `generateForMonth` (lines 154-185) with:

```typescript
  async generateForMonth(
    month: number,
    year: number,
  ): Promise<{
    created: number;
    skipped: number;
    skippedRooms: { roomId: number; roomName: string }[];
    missingReadings: { roomId: number; roomName: string }[];
  }> {
    const rooms = await this.prisma.room.findMany({
      where: { status: 'OCCUPIED' },
    });
    let created = 0;
    const skippedRooms: { roomId: number; roomName: string }[] = [];
    const missingReadings: { roomId: number; roomName: string }[] = [];
    for (const room of rooms) {
      try {
        await this.create({ roomId: room.id, month, year });
        created += 1;
      } catch (e) {
        if (e instanceof ConflictException) {
          skippedRooms.push({ roomId: room.id, roomName: room.name });
          continue;
        }
        if (e instanceof BadRequestException) {
          missingReadings.push({ roomId: room.id, roomName: room.name });
          continue;
        }
        throw e;
      }
    }
    return { created, skipped: skippedRooms.length, skippedRooms, missingReadings };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/api`):
```bash
pnpm test invoices.service.spec.ts
```
Expected: PASS (all tests green).

- [ ] **Step 5: Lint**

Run (from `apps/api`):
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/api/src/invoices
git commit -m "feat(api): return skipped room names from generateForMonth

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Contract form collects initial readings (web)

**Files:**
- Modify: `apps/web/features/contracts/types.ts` (`Contract` interface, lines 12-23)
- Modify: `apps/web/features/contracts/components/contract-form-dialog.tsx`
- Modify: `apps/web/features/contracts/actions.ts` (`createContract` lines 28-47, `updateContract` lines 49-69)

**Interfaces:**
- Consumes: API `Contract` now returns `initialElectricityReading`/`initialWaterReading` (Tasks 1-2); `POST/PATCH /contracts` accept them.
- Produces: contract create/edit form sends the two reading fields.

- [ ] **Step 1: Add the fields to the `Contract` type**

In `apps/web/features/contracts/types.ts`, add to the `Contract` interface (after `deposit: number;`):

```typescript
  deposit: number;
  initialElectricityReading: number;
  initialWaterReading: number;
```

- [ ] **Step 2: Add the two inputs to the contract form**

In `apps/web/features/contracts/components/contract-form-dialog.tsx`, add two grid cells inside the `<div className="grid gap-4 sm:grid-cols-2">` block, right after the deposit cell (after line 168, before the startDate cell):

```tsx
            <div className="grid gap-2">
              <Label htmlFor="contract-initialElectricityReading">
                Chỉ số điện ban đầu (kWh){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-initialElectricityReading"
                name="initialElectricityReading"
                type="number"
                min={0}
                defaultValue={contract?.initialElectricityReading ?? 0}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-initialWaterReading">
                Chỉ số nước ban đầu (m³){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-initialWaterReading"
                name="initialWaterReading"
                type="number"
                min={0}
                defaultValue={contract?.initialWaterReading ?? 0}
                required
              />
            </div>
```

- [ ] **Step 3: Send the fields from the server actions**

In `apps/web/features/contracts/actions.ts`, in `createContract`, add the two fields to the JSON body (inside the object at lines 36-42):

```typescript
      roomId: Number(formData.get("roomId")),
      price: Number(formData.get("price") ?? 0),
      deposit: Number(formData.get("deposit") ?? 0),
      initialElectricityReading: Number(
        formData.get("initialElectricityReading") ?? 0,
      ),
      initialWaterReading: Number(formData.get("initialWaterReading") ?? 0),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      ...(note ? { note } : {}),
```

In `updateContract`, add them to the body (inside the object at lines 57-64):

```typescript
      price: Number(formData.get("price") ?? 0),
      deposit: Number(formData.get("deposit") ?? 0),
      initialElectricityReading: Number(
        formData.get("initialElectricityReading") ?? 0,
      ),
      initialWaterReading: Number(formData.get("initialWaterReading") ?? 0),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      status: String(formData.get("status") ?? "ACTIVE"),
      note: note || undefined,
```

- [ ] **Step 4: Build and lint**

Run (from `apps/web`):
```bash
pnpm lint && pnpm build
```
Expected: no type/lint errors; build succeeds.

- [ ] **Step 5: Manual verification**

Start the web dev server (`pnpm dev` from `apps/web`, with the API running). Open `/contracts` → "Tạo hợp đồng": the form shows "Chỉ số điện ban đầu (kWh)" and "Chỉ số nước ban đầu (m³)" as required inputs. Create a contract with initial readings 500 / 50; open the room detail for that room → "Chỉ số điện/nước hiện tại" shows 500 / 50. Edit the contract → the two fields are prefilled.

- [ ] **Step 6: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/contracts
git commit -m "feat(web): contract form captures initial electricity/water readings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Bulk-generate toast lists rooms already invoiced (web)

**Files:**
- Modify: `apps/web/features/invoices/actions.ts` (`generateInvoices`, lines 42-66)
- Modify: `apps/web/features/invoices/components/invoices-toolbar.tsx` (`handleGenerate`, lines 40-61)

**Interfaces:**
- Consumes: `POST /invoices/generate` now returns `skippedRooms` (Task 4).
- Produces: after bulk generate, a toast lists the names of rooms that already had an invoice.

- [ ] **Step 1: Thread `skippedRooms` through the action**

In `apps/web/features/invoices/actions.ts`, add `skippedRooms` to both the return type and the fetch generic in `generateInvoices`:

```typescript
export async function generateInvoices(
  month: number,
  year: number,
): Promise<
  InvoiceActionState & {
    created?: number;
    skipped?: number;
    skippedRooms?: { roomId: number; roomName: string }[];
    missingReadings?: { roomId: number; roomName: string }[];
  }
> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<{
    created: number;
    skipped: number;
    skippedRooms: { roomId: number; roomName: string }[];
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

- [ ] **Step 2: List skipped room names in the toast**

In `apps/web/features/invoices/components/invoices-toolbar.tsx`, replace the body of `handleGenerate` (lines 41-60) with:

```typescript
    startTransition(async () => {
      const result = await generateInvoices(month, year);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const missing = result.missingReadings ?? [];
      const skipped = result.skippedRooms ?? [];
      toast.success(`Đã tạo ${result.created ?? 0} hoá đơn tháng ${month}/${year}`);
      if (skipped.length > 0) {
        toast.info(
          `${skipped.length} phòng đã có hoá đơn tháng này: ${skipped
            .map((s) => s.roomName)
            .join(", ")}`,
        );
      }
      if (missing.length > 0) {
        toast.warning(
          `Chưa nhập chỉ số cho ${missing.length} phòng: ${missing
            .map((m) => m.roomName)
            .join(", ")}. Vui lòng cập nhật chỉ số điện nước.`,
        );
        openReadings();
      }
      router.refresh();
    });
```

- [ ] **Step 3: Build and lint**

Run (from `apps/web`):
```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 4: Manual verification**

On `/invoices`, generate invoices for a month where at least one occupied room already has an invoice. Confirm: a success toast ("Đã tạo N hoá đơn…"), plus an info toast listing the names of the already-invoiced rooms.

- [ ] **Step 5: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/invoices
git commit -m "feat(web): list already-invoiced rooms after bulk generate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Per-room reading editor on room detail (web)

**Files:**
- Create: `apps/web/features/rooms/components/room-reading-editor.tsx`
- Modify: `apps/web/app/(admin)/rooms/[id]/page.tsx` (info card region, around lines 114-124)

**Interfaces:**
- Consumes: `bulkUpdateReadings(items, year, month)` from `@/features/rooms/actions`; `Room` current readings.
- Produces: `RoomReadingEditor` client component (button + dialog) editing one room's reading for a chosen month (default current).

- [ ] **Step 1: Create the `RoomReadingEditor` component**

Create `apps/web/features/rooms/components/room-reading-editor.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateReadings } from "@/features/rooms/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RoomReadingEditorProps {
  roomId: number;
  roomName: string;
  electricityReading: number;
  waterReading: number;
}

export function RoomReadingEditor({
  roomId,
  roomName,
  electricityReading,
  waterReading,
}: RoomReadingEditorProps) {
  const router = useRouter();
  const now = new Date();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [electricity, setElectricity] = React.useState("");
  const [water, setWater] = React.useState("");

  function handleSubmit() {
    const nextElectricity =
      electricity === "" ? electricityReading : Number(electricity);
    const nextWater = water === "" ? waterReading : Number(water);
    if (nextElectricity < electricityReading || nextWater < waterReading) {
      toast.error("Chỉ số mới phải lớn hơn hoặc bằng chỉ số hiện tại");
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateReadings(
        [
          {
            roomId,
            electricityReading: nextElectricity,
            waterReading: nextWater,
          },
        ],
        year,
        month,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Đã cập nhật chỉ số");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gauge className="size-4" />
          Cập nhật chỉ số
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cập nhật chỉ số phòng {roomName}</DialogTitle>
          <DialogDescription>
            Chỉ số được ghi vào kỳ đã chọn (mặc định tháng hiện tại).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="reading-month">Tháng</Label>
              <Input
                id="reading-month"
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reading-year">Năm</Label>
              <Input
                id="reading-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reading-electricity">Chỉ số điện (kWh)</Label>
            <p className="text-xs text-muted-foreground tabular-nums">
              Chỉ số cũ: {electricityReading}
            </p>
            <Input
              id="reading-electricity"
              type="number"
              inputMode="numeric"
              min={electricityReading}
              placeholder="Chỉ số mới"
              value={electricity}
              onChange={(e) => setElectricity(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reading-water">Chỉ số nước (m³)</Label>
            <p className="text-xs text-muted-foreground tabular-nums">
              Chỉ số cũ: {waterReading}
            </p>
            <Input
              id="reading-water"
              type="number"
              inputMode="numeric"
              min={waterReading}
              placeholder="Chỉ số mới"
              value={water}
              onChange={(e) => setWater(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
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

- [ ] **Step 2: Mount it in the room detail info card**

In `apps/web/app/(admin)/rooms/[id]/page.tsx`, add the import (with the other `@/features/rooms/...` imports, near line 22):

```tsx
import { RoomReadingEditor } from "@/features/rooms/components/room-reading-editor";
```

Then make the "Thông tin phòng" `CardTitle` a flex row that pushes the editor to the right. Replace the `<CardHeader>…</CardHeader>` block (lines 70-75) with:

```tsx
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            Thông tin phòng
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
          <RoomReadingEditor
            roomId={room.id}
            roomName={room.name}
            electricityReading={room.electricityReading}
            waterReading={room.waterReading}
          />
        </CardHeader>
```

- [ ] **Step 3: Build and lint**

Run (from `apps/web`):
```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open a room detail page → click "Cập nhật chỉ số". The dialog defaults to the current month/year and shows the old readings. Enter a higher electricity value, save → success toast, the "Chỉ số điện hiện tại" updates, and a row appears in "Lịch sử chỉnh sửa chỉ số" (with your name and timestamp). Entering a value below the old reading shows the validation error toast. Verify the reading history table review: columns Kỳ / Chỉ số điện / Chỉ số nước / Người sửa / Thời gian render correctly.

- [ ] **Step 5: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/rooms/components/room-reading-editor.tsx "apps/web/app/(admin)/rooms/[id]/page.tsx"
git commit -m "feat(web): per-room reading editor on room detail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Replace `...` dropdowns with icon actions in list tables (web)

**Files:**
- Modify: `apps/web/features/rooms/components/rooms-table.tsx` (actions cell lines 129-158; imports lines 5, 14-20)
- Modify: `apps/web/features/contracts/components/contracts-table.tsx` (actions cell lines 126-153; imports lines 5, 17-23)
- Modify: `apps/web/features/tenants/components/tenants-table.tsx` (actions cell lines 99-125; imports lines 4, 12-18)
- Modify: `apps/web/features/users/components/users-table.tsx` (actions cell lines 100-127; imports lines 4, 13-19)

**Interfaces:**
- Consumes: existing per-row state setters (`setEditingX`, `setDeletingX`, `handleToggleActive`).
- Produces: icon action columns matching the invoice-list pattern (`Eye`/`Pencil`/`Lock`/`Unlock`/`Trash2`, `variant="ghost" size="icon"`, `title` + `aria-label`); no more `DropdownMenu`/`MoreHorizontal`.

- [ ] **Step 1: Rooms table**

In `apps/web/features/rooms/components/rooms-table.tsx`:

Change the lucide import (line 5) to drop `MoreHorizontal` and add `Eye`, `Pencil`, `Trash2`:
```tsx
import { DoorOpen, Eye, Gauge, Pencil, Plus, Trash2 } from "lucide-react";
```
Delete the `DropdownMenu` import block (lines 14-20).

Replace the actions `<TableCell>` (lines 129-158) with:
```tsx
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Xem chi tiết ${room.name}`}
                          title="Xem chi tiết"
                          asChild
                        >
                          <Link href={`/rooms/${room.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Sửa ${room.name}`}
                          title="Sửa"
                          onClick={() => setEditingRoom(room)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Xoá ${room.name}`}
                          title="Xoá"
                          onClick={() => setDeletingRoom(room)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
```

- [ ] **Step 2: Contracts table**

In `apps/web/features/contracts/components/contracts-table.tsx`:

Change the lucide import (line 5):
```tsx
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
```
Delete the `DropdownMenu` import block (lines 17-23).

Replace the actions `<TableCell>` (lines 126-153) with:
```tsx
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Sửa hợp đồng phòng ${contract.room.name}`}
                          title="Sửa"
                          onClick={() => setEditingContract(contract)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Xoá hợp đồng phòng ${contract.room.name}`}
                          title="Xoá"
                          disabled={contract.status === "ACTIVE"}
                          onClick={() => setDeletingContract(contract)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
```

- [ ] **Step 3: Tenants table**

In `apps/web/features/tenants/components/tenants-table.tsx`:

Change the lucide import (line 4):
```tsx
import { Pencil, Plus, Trash2, Users } from "lucide-react";
```
Delete the `DropdownMenu` import block (lines 12-18).

Replace the actions `<TableCell>` (lines 99-125) with:
```tsx
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa ${tenant.fullName}`}
                        title="Sửa"
                        onClick={() => setEditingTenant(tenant)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Xoá ${tenant.fullName}`}
                        title="Xoá"
                        onClick={() => setDeletingTenant(tenant)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
```

- [ ] **Step 4: Users table**

In `apps/web/features/users/components/users-table.tsx`:

Change the lucide import (line 4):
```tsx
import { Lock, Pencil, Plus, Trash2, Unlock, UserCog } from "lucide-react";
```
Delete the `DropdownMenu` import block (lines 13-19).

Replace the actions `<TableCell>` (lines 100-127) with:
```tsx
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa ${user.name}`}
                        title="Sửa"
                        onClick={() => setEditingUser(user)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          user.isActive
                            ? `Khoá tài khoản ${user.name}`
                            : `Mở khoá tài khoản ${user.name}`
                        }
                        title={user.isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.isActive ? (
                          <Lock className="size-4" />
                        ) : (
                          <Unlock className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Xoá ${user.name}`}
                        title="Xoá"
                        onClick={() => setDeletingUser(user)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
```

- [ ] **Step 5: Build and lint**

Run (from `apps/web`):
```bash
pnpm lint && pnpm build
```
Expected: no errors, and no "unused import" warnings for `DropdownMenu*` / `MoreHorizontal` (they were removed).

- [ ] **Step 6: Manual verification**

Open `/rooms`, `/contracts`, `/tenants`, and the users management page. Each row's last column now shows icon buttons (no `...`). Hovering shows the Vietnamese tooltip; the contract delete icon is disabled for ACTIVE contracts; the user lock/unlock icon toggles.

- [ ] **Step 7: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/rooms/components/rooms-table.tsx apps/web/features/contracts/components/contracts-table.tsx apps/web/features/tenants/components/tenants-table.tsx apps/web/features/users/components/users-table.tsx
git commit -m "feat(web): icon action columns for list tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Accent-driven dashboard chart palette (web)

**Files:**
- Modify: `apps/web/app/globals.css` (accent blocks, lines 147-205)

**Interfaces:**
- Consumes: existing `data-accent` attribute on `<html>` and the `--chart-1..5` → `--color-chart-*` mapping (lines 21-25).
- Produces: per-accent `--chart-1..5` ramps so dashboard charts follow the selected accent. `neutral` keeps the grayscale ramp (no `[data-accent="neutral"]` block exists, so `:root` grayscale applies).

- [ ] **Step 1: Add a chart ramp to each accent block**

In `apps/web/app/globals.css`, add five `--chart-*` declarations inside each existing `[data-accent="x"]` block (the light-mode block; charts use the same values in both modes, matching the existing grayscale ramp which is identical in `:root` and `.dark`).

`[data-accent="blue"]` (after line 152, before the closing `}`):
```css
  --chart-1: oklch(0.85 0.05 262.881);
  --chart-2: oklch(0.77 0.09 262.881);
  --chart-3: oklch(0.7 0.13 262.881);
  --chart-4: oklch(0.62 0.17 262.881);
  --chart-5: oklch(0.55 0.2 262.881);
```

`[data-accent="green"]`:
```css
  --chart-1: oklch(0.85 0.05 149.214);
  --chart-2: oklch(0.77 0.09 149.214);
  --chart-3: oklch(0.7 0.12 149.214);
  --chart-4: oklch(0.62 0.15 149.214);
  --chart-5: oklch(0.55 0.17 149.214);
```

`[data-accent="violet"]`:
```css
  --chart-1: oklch(0.85 0.05 293.009);
  --chart-2: oklch(0.77 0.1 293.009);
  --chart-3: oklch(0.7 0.15 293.009);
  --chart-4: oklch(0.62 0.2 293.009);
  --chart-5: oklch(0.55 0.24 293.009);
```

`[data-accent="orange"]`:
```css
  --chart-1: oklch(0.85 0.05 41.116);
  --chart-2: oklch(0.77 0.09 41.116);
  --chart-3: oklch(0.7 0.13 41.116);
  --chart-4: oklch(0.62 0.17 41.116);
  --chart-5: oklch(0.55 0.2 41.116);
```

`[data-accent="rose"]`:
```css
  --chart-1: oklch(0.85 0.05 17.585);
  --chart-2: oklch(0.77 0.1 17.585);
  --chart-3: oklch(0.7 0.15 17.585);
  --chart-4: oklch(0.62 0.2 17.585);
  --chart-5: oklch(0.55 0.24 17.585);
```

- [ ] **Step 2: Build**

Run (from `apps/web`):
```bash
pnpm build
```
Expected: build succeeds (CSS is valid).

- [ ] **Step 3: Manual verification**

Open the dashboard (`/`). In Settings → Giao diện, switch "Màu chủ đạo" between neutral / blue / green / violet / orange / rose. The pie, bar, and line charts recolor to the selected accent's shade ramp; neutral shows the grayscale ramp. Check both light and dark mode remain legible.

- [ ] **Step 4: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/app/globals.css
git commit -m "feat(web): dashboard chart palette follows the theme accent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Backend:** from `apps/api`, run `pnpm test && pnpm lint` — all green.
- [ ] **Frontend:** from `apps/web`, run `pnpm lint && pnpm build` — clean.
- [ ] **End-to-end sanity:** create a room, create a contract with initial readings, update the room's reading on room detail, generate monthly invoices twice (second run reports the already-invoiced room), and confirm the first invoice's electricity/water "prev" equals the contract's initial reading.
