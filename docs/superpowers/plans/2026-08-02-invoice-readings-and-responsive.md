# Per-invoice meter readings, back-dated edits, and responsive sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator update a meter reading straight from an invoice row — for any month, not just the latest — see the recomputed total before saving, and spot at a glance which rooms still have no reading; and stop admin screens from overflowing the viewport.

**Architecture:** The backend gains a cascade (`resyncFromPeriod`) that rewalks a room's invoice chain after a reading changes, because `electricityPrev` is a stored snapshot rather than a live lookup. `bulkUpdateReadings` swaps its latest-period-only guard for bounded validation plus a settled-period check. A new read endpoint exposes per-period reading state so the bulk dialog can highlight and prefill. On the web side, one per-row dialog does client-side arithmetic against fields already present on the `Invoice`, and one `min-w-0` fix at the layout removes the root cause of table overflow.

**Tech Stack:** NestJS 11 + Prisma 7 (MySQL) in `apps/api`; Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/ui in `apps/web`. Jest for API tests. pnpm in each app separately.

**Spec:** `docs/superpowers/specs/2026-08-02-invoice-readings-and-responsive-design.md`

## Global Constraints

- All user-facing copy is **Vietnamese**; code, comments and identifiers are English.
- Run every command from inside the app directory (`apps/api` or `apps/web`) — there is no root workspace.
- `apps/api` and `apps/web` each have their own `pnpm-lock.yaml`. Do not add dependencies.
- Prisma: **no migrations in this repo** — schema changes would use `db push`, never `migrate dev`. This plan changes no schema.
- Feature-specific web components live in `features/<domain>/components/`, never `components/`.
- Do not hand-edit `apps/web/components/ui/*` — they are shadcn-generated. Apply layout fixes via `className` at the call site.
- Money and readings are integers throughout. No floats.
- PAID invoices are immutable. Any code path that would alter one must reject before writing anything.
- Backend must never leak stack traces; all rejections use `BadRequestException` / `ConflictException` with a Vietnamese message.
- Commit after each task with the message given in that task's final step.

---

### Task 1: Cascade re-sync in InvoicesService

Replaces `syncMeterReading` with `resyncFromPeriod`, which walks the room's invoice chain from the edited period forward. Without this, editing a back-dated reading double-bills the difference in the following month.

**Files:**
- Modify: `apps/api/src/invoices/invoices.service.ts:404-442` (replace `syncMeterReading`)
- Modify: `apps/api/src/rooms/rooms.service.ts:238-242` (update the call site)
- Test: `apps/api/src/invoices/invoices.service.spec.ts:390-439` (replace the three `syncMeterReading` tests)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `InvoicesService.resyncFromPeriod(roomId: number, year: number, month: number): Promise<void>`. Task 2 calls it. `syncMeterReading` no longer exists.

- [ ] **Step 1: Write the failing tests**

Replace the block at `apps/api/src/invoices/invoices.service.spec.ts:390-439` (the three `syncMeterReading` tests) with:

```ts
  it('resyncFromPeriod is a no-op when the edited period has no invoice', async () => {
    // Only a LATER invoice exists. The prev chain runs through invoices, so a
    // reading in a period with no invoice cannot shift anything downstream.
    prisma.invoice.findMany.mockResolvedValue([
      { id: 6, roomId: 1, year: 2026, month: 8, status: 'UNPAID' },
    ]);
    await service.resyncFromPeriod(1, 2026, 7);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('resyncFromPeriod recomputes the edited invoice from snapshot prices', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: 5,
        roomId: 1,
        year: 2026,
        month: 7,
        status: 'UNPAID',
        roomPrice: 3000000,
        electricityPrev: 100,
        electricityCurrent: 100,
        electricityUnitPrice: 3500,
        waterPrev: 10,
        waterCurrent: 10,
        waterUnitPrice: 15000,
        internetFee: 100000,
        elevatorFee: 60000,
        cleaningFee: 40000,
        motorbikeFee: 100000,
        otherFee: 50000,
        totalAmount: 3350000,
      },
    ]);
    prisma.meterReading.findMany.mockResolvedValue([
      { year: 2026, month: 7, electricityReading: 250, waterReading: 22 },
    ]);
    prisma.invoice.update.mockResolvedValue({});

    await service.resyncFromPeriod(1, 2026, 7);

    const { data } = prisma.invoice.update.mock.calls[0][0];
    // elec (250-100)*3500=525000 ; water (22-10)*15000=180000
    expect(data.electricityCurrent).toBe(250);
    expect(data.waterCurrent).toBe(22);
    expect(data.electricityPrev).toBe(100);
    expect(data.totalAmount).toBe(
      3000000 + 525000 + 180000 + 100000 + 60000 + 40000 + 100000 + 50000,
    );
  });

  it('resyncFromPeriod cascades the new current into the next invoice prev', async () => {
    const base = {
      roomId: 1,
      status: 'UNPAID',
      roomPrice: 1000000,
      electricityUnitPrice: 1000,
      waterUnitPrice: 0,
      internetFee: 0,
      elevatorFee: 0,
      cleaningFee: 0,
      motorbikeFee: 0,
      otherFee: 0,
      waterPrev: 0,
      waterCurrent: 0,
    };
    prisma.invoice.findMany.mockResolvedValue([
      {
        ...base,
        id: 5,
        year: 2026,
        month: 7,
        electricityPrev: 100,
        electricityCurrent: 200,
        totalAmount: 1100000,
      },
      {
        ...base,
        id: 6,
        year: 2026,
        month: 8,
        electricityPrev: 200, // stale snapshot of month 7's old current
        electricityCurrent: 260,
        totalAmount: 1060000,
      },
    ]);
    prisma.meterReading.findMany.mockResolvedValue([
      { year: 2026, month: 7, electricityReading: 250, waterReading: 0 },
      { year: 2026, month: 8, electricityReading: 260, waterReading: 0 },
    ]);
    prisma.invoice.update.mockResolvedValue({});

    await service.resyncFromPeriod(1, 2026, 7);

    expect(prisma.invoice.update).toHaveBeenCalledTimes(2);
    const july = prisma.invoice.update.mock.calls[0][0].data;
    const august = prisma.invoice.update.mock.calls[1][0].data;
    expect(july.electricityCurrent).toBe(250);
    expect(july.totalAmount).toBe(1000000 + 150 * 1000);
    // August must restart from July's NEW current, not the stale 200.
    expect(august.electricityPrev).toBe(250);
    expect(august.totalAmount).toBe(1000000 + 10 * 1000);
  });

  it('resyncFromPeriod refuses when any invoice in the chain is PAID', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: 5, roomId: 1, year: 2026, month: 7, status: 'UNPAID' },
      { id: 6, roomId: 1, year: 2026, month: 8, status: 'PAID' },
    ]);
    await expect(service.resyncFromPeriod(1, 2026, 7)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
```

Then make sure the mocked prisma in that describe block exposes `invoice.findMany` and `meterReading.findMany`. Find the `const prisma = {` literal at the top of the `InvoicesService` describe block and confirm both keys exist as `jest.fn()`; add whichever is missing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm test src/invoices/invoices.service.spec.ts`
Expected: FAIL — `service.resyncFromPeriod is not a function`.

- [ ] **Step 3: Replace `syncMeterReading` with `resyncFromPeriod`**

In `apps/api/src/invoices/invoices.service.ts`, delete the whole `syncMeterReading` method (lines 404-442) and put this in its place:

```ts
  // Recomputes this room's invoice chain from the given period forward.
  //
  // An invoice's electricityPrev is a stored snapshot of the previous invoice's
  // electricityCurrent, not a live lookup — so editing a back-dated reading has
  // to rewalk every later invoice, or the difference gets billed twice.
  //
  // Only reading-derived fields are touched. Room price, fee settings and
  // occupant counts stay as stored, so manual invoice edits survive. That is
  // the deliberate opposite of refreshForMonth, which rebuilds everything.
  async resyncFromPeriod(
    roomId: number,
    year: number,
    month: number,
  ): Promise<void> {
    const fromPeriod = {
      OR: [{ year: { gt: year } }, { year, month: { gte: month } }],
    };
    const invoices = await this.prisma.invoice.findMany({
      where: { roomId, ...fromPeriod },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    // No invoice for the edited period itself means nothing downstream can
    // shift: the prev chain runs through invoices, not readings.
    const first = invoices[0];
    if (!first || first.year !== year || first.month !== month) return;

    // Defensive: callers check this before writing anything, so reaching here
    // with a settled invoice would mean a new call site skipped the guard.
    if (invoices.some((invoice) => invoice.status === 'PAID')) {
      throw new ConflictException(INVOICE_PAID_LOCKED);
    }

    const readings = await this.prisma.meterReading.findMany({
      where: { roomId, ...fromPeriod },
    });
    const periodKey = (p: { year: number; month: number }) =>
      `${p.year}-${p.month}`;
    const readingByPeriod = new Map(readings.map((r) => [periodKey(r), r]));

    // The baseline entering the edited period is unaffected by the edit.
    let electricityPrev = first.electricityPrev;
    let waterPrev = first.waterPrev;

    for (const invoice of invoices) {
      const reading = readingByPeriod.get(periodKey(invoice));
      const electricityCurrent = reading?.electricityReading ?? electricityPrev;
      const waterCurrent = reading?.waterReading ?? waterPrev;
      const totalAmount =
        invoice.roomPrice +
        (electricityCurrent - electricityPrev) * invoice.electricityUnitPrice +
        (waterCurrent - waterPrev) * invoice.waterUnitPrice +
        invoice.internetFee +
        invoice.elevatorFee +
        invoice.cleaningFee +
        invoice.motorbikeFee +
        invoice.otherFee;

      const changed =
        invoice.electricityPrev !== electricityPrev ||
        invoice.electricityCurrent !== electricityCurrent ||
        invoice.waterPrev !== waterPrev ||
        invoice.waterCurrent !== waterCurrent ||
        invoice.totalAmount !== totalAmount;
      if (changed) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            electricityPrev,
            electricityCurrent,
            waterPrev,
            waterCurrent,
            totalAmount,
          },
        });
      }

      electricityPrev = electricityCurrent;
      waterPrev = waterCurrent;
    }
  }
```

- [ ] **Step 4: Update the call site in RoomsService**

In `apps/api/src/rooms/rooms.service.ts`, replace lines 237-242:

```ts
      // Keep the month's invoice in sync (added in Task 4).
      await this.invoicesService.syncMeterReading(
        item.roomId,
        dto.year,
        dto.month,
      );
```

with:

```ts
      // Rewalk this room's invoice chain from the edited period forward.
      await this.invoicesService.resyncFromPeriod(
        item.roomId,
        dto.year,
        dto.month,
      );
```

Then in `apps/api/src/rooms/rooms.service.spec.ts`, rename the mock in **both** describe blocks (lines 36 and 129):

```ts
  const invoices = { resyncFromPeriod: jest.fn() };
```

- [ ] **Step 5: Run all API tests to verify they pass**

Run: `cd apps/api && pnpm test`
Expected: PASS, all suites.

- [ ] **Step 6: Lint and commit**

```bash
cd apps/api && pnpm lint
cd /Users/hiepnn/projects/house-management
git add apps/api/src/invoices/invoices.service.ts apps/api/src/invoices/invoices.service.spec.ts apps/api/src/rooms/rooms.service.ts apps/api/src/rooms/rooms.service.spec.ts
git commit -m "feat(api): cascade invoice re-sync from an edited reading period"
```

---

### Task 2: Allow back-dated reading edits

Drops the latest-period-only guard, adds an upper bound and a settled-period check, and stops a back-dated edit from stamping its value onto the room's mirror columns.

**Files:**
- Modify: `apps/api/src/rooms/rooms.service.ts:118-246` (`bulkUpdateReadings` + three new private helpers)
- Test: `apps/api/src/rooms/rooms.service.spec.ts:111-236` (the `bulkUpdateReadings` describe block)

**Interfaces:**
- Consumes: `InvoicesService.resyncFromPeriod(roomId, year, month)` from Task 1.
- Produces: three private helpers Task 3 reuses —
  `resolvePrevReading(roomId: number, year: number, month: number, fallback: { initialElectricityReading: number; initialWaterReading: number }): Promise<{ electricity: number; water: number }>`,
  `findNextReading(roomId: number, year: number, month: number): Promise<{ year: number; month: number; electricityReading: number; waterReading: number } | null>`,
  `findSettledInvoiceFrom(roomId: number, year: number, month: number): Promise<{ year: number; month: number } | null>`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/rooms/rooms.service.spec.ts`, inside the `RoomsService.bulkUpdateReadings` describe block: first extend the mocked prisma so `invoice` has `findFirst`, i.e. change `invoice: { findUnique: jest.fn() }` (line 121) to:

```ts
    invoice: { findUnique: jest.fn(), findFirst: jest.fn() },
```

Then **delete** the test `'rejects editing a month that is not the latest recorded month'` (it asserts the rule being removed) and replace the whole set of assertions by rewriting the four remaining tests plus three new ones. The mocks change shape because validation now calls distinct helpers rather than `meterReading.findFirst` twice:

```ts
  it('rejects a reading lower than the previous period', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // prev-period lookup reads 250; next-period lookup finds nothing.
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 250, waterReading: 22 })
      .mockResolvedValueOnce(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 200, waterReading: 30 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a reading higher than the next recorded period', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 100, waterReading: 10 })
      .mockResolvedValueOnce({
        year: 2026,
        month: 8,
        electricityReading: 280,
        waterReading: 25,
      });
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a back-dated edit within bounds and cascades', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 100, waterReading: 10 })
      .mockResolvedValueOnce({
        year: 2026,
        month: 8,
        electricityReading: 280,
        waterReading: 25,
      });
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.upsert.mockResolvedValue({});
    prisma.meterReadingHistory.create.mockResolvedValue({});

    await service.bulkUpdateReadings({
      year: 2026,
      month: 7,
      items: [{ roomId: 1, electricityReading: 260, waterReading: 20 }],
    });

    expect(prisma.meterReading.upsert).toHaveBeenCalled();
    expect(invoices.resyncFromPeriod).toHaveBeenCalledWith(1, 2026, 7);
  });

  it('leaves the room mirror alone for a back-dated edit', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce({ electricityReading: 100, waterReading: 10 })
      .mockResolvedValueOnce({
        year: 2026,
        month: 8,
        electricityReading: 280,
        waterReading: 25,
      });
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.meterReading.upsert.mockResolvedValue({});
    prisma.meterReadingHistory.create.mockResolvedValue({});

    await service.bulkUpdateReadings({
      year: 2026,
      month: 7,
      items: [{ roomId: 1, electricityReading: 260, waterReading: 20 }],
    });

    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it('upserts the reading, writes history, and mirrors the newest period', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    // prev-period: none; next-period: none -> this IS the newest period.
    prisma.meterReading.findFirst.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);
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

  it('rejects with ConflictException and performs NO writes when this period is PAID', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue({ year: 2026, month: 7 });

    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.meterReading.upsert).not.toHaveBeenCalled();
    expect(prisma.meterReadingHistory.create).not.toHaveBeenCalled();
    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it('rejects with ConflictException when a LATER period is PAID', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null);
    // The settled lookup covers this period and everything after it.
    prisma.invoice.findFirst.mockResolvedValue({ year: 2026, month: 8 });

    await expect(
      service.bulkUpdateReadings({
        year: 2026,
        month: 7,
        items: [{ roomId: 1, electricityReading: 300, waterReading: 30 }],
      }),
    ).rejects.toThrow(/8\/2026/);

    expect(prisma.meterReading.upsert).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm test src/rooms/rooms.service.spec.ts`
Expected: FAIL — the upper-bound and later-PAID cases pass no rejection, and the mirror test still sees `room.update`.

- [ ] **Step 3: Add the three private helpers**

In `apps/api/src/rooms/rooms.service.ts`, insert immediately after `assertFeeSettingExists` (line 34):

```ts
  // Baseline a reading is measured against: the latest recorded period strictly
  // before this one, falling back to the room's initial readings. Shared by the
  // write path and the readings endpoint so the number shown to the user and
  // the number enforced on save cannot drift apart.
  private async resolvePrevReading(
    roomId: number,
    year: number,
    month: number,
    fallback: {
      initialElectricityReading: number;
      initialWaterReading: number;
    },
  ): Promise<{ electricity: number; water: number }> {
    const prev = await this.prisma.meterReading.findFirst({
      where: {
        roomId,
        OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return {
      electricity: prev?.electricityReading ?? fallback.initialElectricityReading,
      water: prev?.waterReading ?? fallback.initialWaterReading,
    };
  }

  // The earliest recorded period strictly after this one. Doubles as the
  // upper bound for a back-dated edit and as "is this the newest period".
  private findNextReading(roomId: number, year: number, month: number) {
    return this.prisma.meterReading.findFirst({
      where: {
        roomId,
        OR: [{ year: { gt: year } }, { year, month: { gt: month } }],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

  // The earliest PAID invoice at or after this period. A reading edit shifts
  // every later invoice's baseline, so a settled invoice anywhere downstream
  // blocks the edit outright.
  private findSettledInvoiceFrom(roomId: number, year: number, month: number) {
    return this.prisma.invoice.findFirst({
      where: {
        roomId,
        status: 'PAID',
        OR: [{ year: { gt: year } }, { year, month: { gte: month } }],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }
```

- [ ] **Step 4: Rewrite the validation and write loops**

In `apps/api/src/rooms/rooms.service.ts`, replace everything from `// Validate every item before writing anything.` (line 134) through the closing `}` of the write loop (line 243) with:

```ts
    // Validate every item before writing anything, and remember per item
    // whether it is the room's newest period — only that one may refresh the
    // room's mirror columns.
    const planned: { roomId: number; isNewest: boolean }[] = [];
    for (const item of dto.items) {
      const room = byId.get(item.roomId);
      if (!room) throw new NotFoundException(ROOM_NOT_FOUND);

      // Lower bound: never below the period before this one.
      const prev = await this.resolvePrevReading(
        item.roomId,
        dto.year,
        dto.month,
        room,
      );
      if (
        item.electricityReading < prev.electricity ||
        item.waterReading < prev.water
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số kỳ trước`,
        );
      }

      // Upper bound: a back-dated edit must not push the following period into
      // negative consumption.
      const next = await this.findNextReading(item.roomId, dto.year, dto.month);
      if (
        next &&
        (item.electricityReading > next.electricityReading ||
          item.waterReading > next.waterReading)
      ) {
        throw new BadRequestException(
          `Chỉ số mới của phòng ${room.name} phải nhỏ hơn hoặc bằng chỉ số kỳ ${next.month}/${next.year}`,
        );
      }

      // A settled invoice at or after this period must not be mutated by a
      // reading edit. Rejected up-front so the reading store can never drift
      // ahead of a locked invoice — resyncFromPeriod guards too, but only
      // after the reading/history/room writes would have committed.
      const settled = await this.findSettledInvoiceFrom(
        item.roomId,
        dto.year,
        dto.month,
      );
      if (settled) {
        throw new ConflictException(
          `Không thể sửa chỉ số kỳ ${dto.month}/${dto.year} của phòng ${room.name}: hoá đơn kỳ ${settled.month}/${settled.year} đã thanh toán`,
        );
      }

      planned.push({ roomId: item.roomId, isNewest: next === null });
    }

    // Persist: upsert reading, snapshot history, mirror newest into the room,
    // then rewalk that room's invoice chain from this period forward.
    for (const [index, item] of dto.items.entries()) {
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
      // Room.electricityReading/waterReading mirror the room's CURRENT state.
      // A back-dated edit must not stamp an old number onto them.
      if (planned[index].isNewest) {
        await this.prisma.room.update({
          where: { id: item.roomId },
          data: {
            electricityReading: item.electricityReading,
            waterReading: item.waterReading,
          },
        });
      }
      await this.invoicesService.resyncFromPeriod(
        item.roomId,
        dto.year,
        dto.month,
      );
    }
```

Then delete the now-unused `READING_PAID_LOCKED` constant at line 18-19 (eslint will flag it otherwise).

- [ ] **Step 5: Run all API tests to verify they pass**

Run: `cd apps/api && pnpm test`
Expected: PASS, all suites.

- [ ] **Step 6: Lint and commit**

```bash
cd apps/api && pnpm lint
cd /Users/hiepnn/projects/house-management
git add apps/api/src/rooms/rooms.service.ts apps/api/src/rooms/rooms.service.spec.ts
git commit -m "feat(api): allow back-dated meter reading edits with bounded validation"
```

---

### Task 3: `GET /rooms/meter-readings` endpoint

Exposes per-period reading state so the bulk dialog can highlight missing rooms, prefill recorded ones, and show the correct previous-period baseline.

**Files:**
- Create: `apps/api/src/rooms/types/room-period-reading.ts`
- Create: `apps/api/src/rooms/dto/period-query.dto.ts`
- Modify: `apps/api/src/rooms/rooms.service.ts` (add `findPeriodReadings`)
- Modify: `apps/api/src/rooms/rooms.controller.ts:42` (add the route)
- Test: `apps/api/src/rooms/rooms.service.spec.ts` (new describe block at end of file)

**Interfaces:**
- Consumes: `resolvePrevReading` and `findSettledInvoiceFrom` from Task 2.
- Produces: `RoomsService.findPeriodReadings(year: number, month: number): Promise<RoomPeriodReading[]>` and the `RoomPeriodReading` shape, which Task 5 mirrors in the web app.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/rooms/rooms.service.spec.ts`:

```ts
describe('RoomsService.findPeriodReadings', () => {
  let service: RoomsService;
  const prisma = {
    room: { findMany: jest.fn() },
    meterReading: { findFirst: jest.fn(), findUnique: jest.fn() },
    invoice: { findFirst: jest.fn() },
  };
  const invoices = { resyncFromPeriod: jest.fn() };
  const settings = { getDefault: jest.fn() };

  const room = {
    id: 1,
    name: 'P101',
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
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('falls back to the room initial readings when no earlier period exists', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);

    const rows = await service.findPeriodReadings(2026, 7);

    expect(rows).toEqual([
      {
        roomId: 1,
        roomName: 'P101',
        prevElectricity: 100,
        prevWater: 10,
        electricityReading: null,
        waterReading: null,
        recorded: false,
        editable: true,
        lockReason: null,
      },
    ]);
  });

  it('reports a recorded period with its values and the previous baseline', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue({
      electricityReading: 240,
      waterReading: 20,
    });
    prisma.meterReading.findUnique.mockResolvedValue({
      electricityReading: 305,
      waterReading: 26,
    });
    prisma.invoice.findFirst.mockResolvedValue(null);

    const [row] = await service.findPeriodReadings(2026, 7);

    expect(row.prevElectricity).toBe(240);
    expect(row.electricityReading).toBe(305);
    expect(row.recorded).toBe(true);
  });

  it('marks a room locked when an invoice at or after the period is PAID', async () => {
    prisma.room.findMany.mockResolvedValue([room]);
    prisma.meterReading.findFirst.mockResolvedValue(null);
    prisma.meterReading.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue({ year: 2026, month: 8 });

    const [row] = await service.findPeriodReadings(2026, 7);

    expect(row.editable).toBe(false);
    expect(row.lockReason).toBe('Hoá đơn kỳ 8/2026 đã thanh toán');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test src/rooms/rooms.service.spec.ts -t findPeriodReadings`
Expected: FAIL — `service.findPeriodReadings is not a function`.

- [ ] **Step 3: Create the response type**

Create `apps/api/src/rooms/types/room-period-reading.ts`:

```ts
// Per-room meter reading state for one billing period, as the readings dialog
// needs it: what the baseline is, whether this period has been entered yet, and
// whether it may still be edited.
export interface RoomPeriodReading {
  roomId: number;
  roomName: string;
  prevElectricity: number;
  prevWater: number;
  electricityReading: number | null;
  waterReading: number | null;
  recorded: boolean;
  editable: boolean;
  lockReason: string | null;
}
```

- [ ] **Step 4: Create the query DTO**

Create `apps/api/src/rooms/dto/period-query.dto.ts`:

```ts
import { IsInt, Max, Min } from 'class-validator';

export class PeriodQueryDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
```

The global `ValidationPipe` runs with `transform: true` (`apps/api/src/app.setup.ts:6`), so the string query params coerce to numbers before validation.

- [ ] **Step 5: Add the service method**

In `apps/api/src/rooms/rooms.service.ts`, add the import at the top:

```ts
import { RoomPeriodReading } from './types/room-period-reading';
```

and add this method after `getReadingHistory`:

```ts
  // Reading state for every occupied room in one period. Backs the bulk
  // readings dialog: which rooms are still missing, what each one's baseline
  // is, and which are locked by a settled invoice.
  async findPeriodReadings(
    year: number,
    month: number,
  ): Promise<RoomPeriodReading[]> {
    const rooms = await this.prisma.room.findMany({
      where: { status: 'OCCUPIED' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        initialElectricityReading: true,
        initialWaterReading: true,
      },
    });

    return Promise.all(
      rooms.map(async (room) => {
        const prev = await this.resolvePrevReading(room.id, year, month, room);
        const reading = await this.prisma.meterReading.findUnique({
          where: { roomId_year_month: { roomId: room.id, year, month } },
        });
        const settled = await this.findSettledInvoiceFrom(room.id, year, month);
        return {
          roomId: room.id,
          roomName: room.name,
          prevElectricity: prev.electricity,
          prevWater: prev.water,
          electricityReading: reading?.electricityReading ?? null,
          waterReading: reading?.waterReading ?? null,
          recorded: reading !== null,
          editable: settled === null,
          lockReason: settled
            ? `Hoá đơn kỳ ${settled.month}/${settled.year} đã thanh toán`
            : null,
        };
      }),
    );
  }
```

- [ ] **Step 6: Add the route**

In `apps/api/src/rooms/rooms.controller.ts`, add to the imports:

```ts
import { Query } from '@nestjs/common';
import { PeriodQueryDto } from './dto/period-query.dto';
```

(merge `Query` into the existing `@nestjs/common` import list rather than adding a second import statement)

and add this route immediately after the existing `@Patch('meter-readings')` handler, keeping it above every `:id` route:

```ts
  // MUST stay above ':id' routes — otherwise Nest matches 'meter-readings'
  // as an :id and ParseIntPipe rejects it.
  @Get('meter-readings')
  findPeriodReadings(@Query() query: PeriodQueryDto) {
    return this.roomsService.findPeriodReadings(query.year, query.month);
  }
```

- [ ] **Step 7: Run the tests and build to verify**

Run: `cd apps/api && pnpm test && pnpm build`
Expected: PASS, all suites; build succeeds.

- [ ] **Step 8: Verify the route responds**

Run the API and hit the endpoint (the API runs in Docker — rebuild the image if the container serves a stale build):

```bash
cd apps/api && pnpm start:dev
# in another shell, with a valid token:
curl -s "http://localhost:3001/rooms/meter-readings?year=2026&month=8" -H "Authorization: Bearer $TOKEN" | head -40
```

Expected: a JSON array of `RoomPeriodReading`, not a 400 from `ParseIntPipe` (which would mean the route ordering is wrong).

- [ ] **Step 9: Lint and commit**

```bash
cd apps/api && pnpm lint
cd /Users/hiepnn/projects/house-management
git add apps/api/src/rooms/
git commit -m "feat(api): add GET /rooms/meter-readings for per-period reading state"
```

---

### Task 4: Per-row reading dialog on the invoices screen

A `Gauge` button on every invoice row and card opens a dialog scoped to that room and period, previewing the recomputed total before saving. No new API call — every field it needs is already on the `Invoice`.

**Files:**
- Create: `apps/web/features/invoices/components/invoice-reading-dialog.tsx`
- Modify: `apps/web/features/invoices/components/invoice-list.tsx`
- Modify: `apps/web/features/invoices/components/invoice-grid.tsx`

**Interfaces:**
- Consumes: `bulkUpdateReadings(items, year, month)` from `@/features/rooms/actions`; the back-dated rules from Task 2 (so old months now succeed).
- Produces: `<InvoiceReadingDialog invoice={Invoice | null} onOpenChange={(open: boolean) => void} />`.

- [ ] **Step 1: Create the dialog**

Create `apps/web/features/invoices/components/invoice-reading-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { Invoice } from "@/features/invoices/types";
import { bulkUpdateReadings } from "@/features/rooms/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Updates one room's meter reading for the period of a single invoice, and
 * shows what that does to the total before it is saved.
 *
 * The preview mirrors the server's resyncFromPeriod: consumption times the
 * invoice's own stored unit price, plus the stored fixed fees. Everything it
 * needs is already on the invoice, so the dialog never fetches.
 */
export function InvoiceReadingDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so opening a different invoice remounts with a fresh draft
            instead of carrying the previous room's numbers over. */}
        {invoice ? (
          <ReadingForm
            key={invoice.id}
            invoice={invoice}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReadingForm({
  invoice,
  onDone,
}: {
  invoice: Invoice;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [electricity, setElectricity] = React.useState(
    String(invoice.electricityCurrent),
  );
  const [water, setWater] = React.useState(String(invoice.waterCurrent));

  const nextElectricity =
    electricity === "" ? invoice.electricityPrev : Number(electricity);
  const nextWater = water === "" ? invoice.waterPrev : Number(water);
  const electricityValid =
    Number.isInteger(nextElectricity) &&
    nextElectricity >= invoice.electricityPrev;
  const waterValid =
    Number.isInteger(nextWater) && nextWater >= invoice.waterPrev;

  const electricityUsed = nextElectricity - invoice.electricityPrev;
  const waterUsed = nextWater - invoice.waterPrev;
  const electricityAmount = electricityUsed * invoice.electricityUnitPrice;
  const waterAmount = waterUsed * invoice.waterUnitPrice;
  const nextTotal =
    invoice.roomPrice +
    electricityAmount +
    waterAmount +
    invoice.internetFee +
    invoice.elevatorFee +
    invoice.cleaningFee +
    invoice.motorbikeFee +
    invoice.otherFee;

  function handleSubmit() {
    if (!electricityValid || !waterValid) {
      toast.error("Chỉ số mới phải là số nguyên và không nhỏ hơn chỉ số kỳ trước");
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateReadings(
        [
          {
            roomId: invoice.roomId,
            electricityReading: nextElectricity,
            waterReading: nextWater,
          },
        ],
        invoice.year,
        invoice.month,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Đã cập nhật chỉ số và tính lại hoá đơn");
      onDone();
      router.refresh();
    });
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle className="break-words">
            Chỉ số phòng {invoice.room?.name ?? "—"} ·{" "}
            {formatMonth(invoice.month, invoice.year)}
          </DialogTitle>
          <DialogDescription>
            Lưu chỉ số sẽ tính lại tiền điện nước của hoá đơn kỳ này.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-reading-electricity">
              Chỉ số điện (kWh)
            </Label>
            <p className="text-xs text-muted-foreground tabular-nums">
              Kỳ trước: {invoice.electricityPrev}
            </p>
            <Input
              id="invoice-reading-electricity"
              type="number"
              inputMode="numeric"
              min={invoice.electricityPrev}
              value={electricity}
              onChange={(e) => setElectricity(e.target.value)}
              aria-invalid={!electricityValid}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-reading-water">Chỉ số nước (m³)</Label>
            <p className="text-xs text-muted-foreground tabular-nums">
              Kỳ trước: {invoice.waterPrev}
            </p>
            <Input
              id="invoice-reading-water"
              type="number"
              inputMode="numeric"
              min={invoice.waterPrev}
              value={water}
              onChange={(e) => setWater(e.target.value)}
              aria-invalid={!waterValid}
            />
          </div>

          <dl
            aria-live="polite"
            className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-sm"
          >
            <div className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 text-muted-foreground">
                Điện
                <span className="ml-1 text-xs tabular-nums">
                  {electricityValid ? `${electricityUsed} kWh` : "—"}
                </span>
              </dt>
              <dd className="shrink-0 tabular-nums">
                {electricityValid ? formatCurrency(electricityAmount) : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 text-muted-foreground">
                Nước
                <span className="ml-1 text-xs tabular-nums">
                  {waterValid ? `${waterUsed} m³` : "—"}
                </span>
              </dt>
              <dd className="shrink-0 tabular-nums">
                {waterValid ? formatCurrency(waterAmount) : "—"}
              </dd>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 border-t pt-2 font-semibold">
              <dt>Tổng cộng</dt>
              <dd className="tabular-nums">
                <span className="mr-2 text-xs font-normal text-muted-foreground line-through">
                  {formatCurrency(invoice.totalAmount)}
                </span>
                {electricityValid && waterValid
                  ? formatCurrency(nextTotal)
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onDone}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !electricityValid || !waterValid}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Lưu chỉ số
          </Button>
        </DialogFooter>
    </>
  );
}
```

Re-indent the JSX body (`DialogHeader` through `DialogFooter`) by two levels when pasting — it moved out of `DialogContent` into the `ReadingForm` fragment. `pnpm lint` will not catch indentation, so just keep it tidy.

- [ ] **Step 2: Wire the button into the list view**

In `apps/web/features/invoices/components/invoice-list.tsx`:

Add `Gauge` to the lucide import (line 4-11 import list) and add the dialog import next to the others:

```tsx
import { InvoiceReadingDialog } from "./invoice-reading-dialog";
```

Add state next to the other dialog state (after `deletingInvoice`, line 55):

```tsx
  const [readingInvoice, setReadingInvoice] = React.useState<Invoice | null>(
    null,
  );
```

Insert this button in the row action group, immediately before the "Xem chi tiết" button (line 186):

```tsx
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cập nhật chỉ số điện nước"
                          title={
                            invoice.status === "PAID"
                              ? "Hoá đơn đã thanh toán — không sửa được chỉ số"
                              : "Cập nhật chỉ số điện nước"
                          }
                          disabled={invoice.status === "PAID"}
                          onClick={() => setReadingInvoice(invoice)}
                        >
                          <Gauge className="size-4" />
                        </Button>
```

And render the dialog alongside the others at the bottom (after `DeleteInvoiceDialog`, line 277):

```tsx
      <InvoiceReadingDialog
        invoice={readingInvoice}
        onOpenChange={(open) => !open && setReadingInvoice(null)}
      />
```

- [ ] **Step 3: Wire the button into the grid view**

In `apps/web/features/invoices/components/invoice-grid.tsx`, make the same four edits: add `Gauge` to the lucide import (line 4), add the `InvoiceReadingDialog` import, add the `readingInvoice` state after `deletingInvoice` (line 32), insert the identical button in the card action row immediately before the "Xem chi tiết" button (line 133), and render `<InvoiceReadingDialog .../>` after `DeleteInvoiceDialog` (line 183).

- [ ] **Step 4: Verify build and lint**

Run: `cd apps/web && pnpm lint && pnpm build`
Expected: both clean.

- [ ] **Step 5: Verify by hand**

Start the app, open `/invoices` for a month with an UNPAID invoice, press the gauge icon on a row. Confirm: previous-period values shown, typing updates the preview live, old total struck through next to the new one, saving shows the success toast, and the row's electricity/water/total match what the preview promised. Then confirm the gauge is disabled on a PAID invoice, and that navigating to an **earlier** month and saving there also works (this is what Task 2 unlocked).

- [ ] **Step 6: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/invoices/components/
git commit -m "feat(web): update meter readings per invoice row with a live total preview"
```

---

### Task 5: Highlight and prefill in the bulk readings dialog

The dialog learns which rooms are missing a reading for the selected period, sorts them first, flags them with text plus colour, prefills the ones already entered, and shows the correct previous-period baseline.

**Files:**
- Modify: `apps/web/features/rooms/types.ts` (add `RoomPeriodReading`)
- Modify: `apps/web/app/(admin)/invoices/page.tsx` (fetch the readings)
- Modify: `apps/web/features/invoices/components/invoices-toolbar.tsx` (pass through)
- Modify: `apps/web/features/rooms/components/bulk-readings-dialog.tsx` (rewrite the table)
- Modify: `apps/web/features/rooms/components/room-reading-editor.tsx` (drop the mirror-based `min`)

**Interfaces:**
- Consumes: `GET /rooms/meter-readings?year&month` from Task 3.
- Produces: `<BulkReadingsDialog open onOpenChange readings={RoomPeriodReading[]} year month />` — note the `rooms` prop is **replaced** by `readings`.

- [ ] **Step 1: Add the web-side type**

Append to `apps/web/features/rooms/types.ts`:

```ts
// Mirrors the API's RoomPeriodReading (GET /rooms/meter-readings).
export interface RoomPeriodReading {
  roomId: number;
  roomName: string;
  prevElectricity: number;
  prevWater: number;
  electricityReading: number | null;
  waterReading: number | null;
  recorded: boolean;
  editable: boolean;
  lockReason: string | null;
}
```

- [ ] **Step 2: Fetch the readings on the invoices page**

In `apps/web/app/(admin)/invoices/page.tsx`, extend the `Room` type import to include the new type:

```tsx
import type { Room, RoomPeriodReading } from "@/features/rooms/types";
```

Add the fetch after the `rooms` fetch (line 40):

```tsx
  const readingsRes = await apiFetch<RoomPeriodReading[]>(
    `/rooms/meter-readings?year=${year}&month=${month}`,
    { token: token ?? undefined },
  );
  const readings = readingsRes.data ?? [];
```

And pass it to the toolbar:

```tsx
      <InvoicesToolbar
        month={month}
        year={year}
        rooms={rooms}
        readings={readings}
        invoices={invoices}
      />
```

- [ ] **Step 3: Thread it through the toolbar**

In `apps/web/features/invoices/components/invoices-toolbar.tsx`:

Change the type import (line 11) to:

```tsx
import type { Room, RoomPeriodReading } from "@/features/rooms/types";
```

Add `readings` to the props type and destructuring:

```tsx
export function InvoicesToolbar({
  month,
  year,
  rooms,
  readings,
  invoices,
}: {
  month: number;
  year: number;
  rooms: Room[];
  readings: RoomPeriodReading[];
  invoices: Invoice[];
}) {
```

Replace the `readingsRooms` derivation (lines 45-48) with:

```tsx
  const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED");
  // The readings endpoint already returns occupied rooms only; narrow further
  // when a generate run named specific rooms.
  const dialogReadings = readingsRoomIds
    ? readings.filter((r) => readingsRoomIds.includes(r.roomId))
    : readings;
```

Change the standalone button's disabled check (line 126) to `disabled={readings.length === 0}`, and the dialog render (lines 168-175) to:

```tsx
      <BulkReadingsDialog
        key={readingsKey}
        open={readingsOpen}
        onOpenChange={setReadingsOpen}
        readings={dialogReadings}
        year={year}
        month={month}
      />
```

- [ ] **Step 4: Rewrite the bulk dialog**

Replace the whole of `apps/web/features/rooms/components/bulk-readings-dialog.tsx` with:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateReadings } from "@/features/rooms/actions";
import type { RoomPeriodReading } from "@/features/rooms/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  readings: RoomPeriodReading[];
  year: number;
  month: number;
}

type Draft = Record<number, { electricity: string; water: string }>;

function initialDraft(readings: RoomPeriodReading[]): Draft {
  const draft: Draft = {};
  for (const row of readings) {
    draft[row.roomId] = {
      electricity: row.electricityReading?.toString() ?? "",
      water: row.waterReading?.toString() ?? "",
    };
  }
  return draft;
}

export function BulkReadingsDialog({
  open,
  onOpenChange,
  readings,
  year,
  month,
}: BulkReadingsDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft>(() =>
    initialDraft(readings),
  );

  // Rooms still missing a reading come first — they are what the operator
  // opened this dialog to deal with.
  const ordered = React.useMemo(
    () =>
      [...readings].sort((a, b) => {
        if (a.recorded !== b.recorded) return a.recorded ? 1 : -1;
        return a.roomName.localeCompare(b.roomName, "vi");
      }),
    [readings],
  );
  const missingCount = readings.filter((r) => !r.recorded).length;

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
    const items = [];
    for (const row of readings) {
      if (!row.editable) continue;
      const d = draft[row.roomId];
      if (!d || (d.electricity === "" && d.water === "")) continue;

      const electricityReading =
        d.electricity === ""
          ? (row.electricityReading ?? row.prevElectricity)
          : Number(d.electricity);
      const waterReading =
        d.water === ""
          ? (row.waterReading ?? row.prevWater)
          : Number(d.water);

      // Unchanged rows would only add history noise.
      if (
        electricityReading === row.electricityReading &&
        waterReading === row.waterReading
      ) {
        continue;
      }
      if (
        electricityReading < row.prevElectricity ||
        waterReading < row.prevWater
      ) {
        toast.error(
          `Chỉ số mới của phòng ${row.roomName} phải lớn hơn hoặc bằng chỉ số kỳ trước`,
        );
        return;
      }
      items.push({ roomId: row.roomId, electricityReading, waterReading });
    }

    if (items.length === 0) {
      toast.error("Chưa nhập chỉ số mới cho phòng nào");
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateReadings(items, year, month);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã cập nhật chỉ số cho ${items.length} phòng`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cập nhật chỉ số điện nước</DialogTitle>
          <DialogDescription>
            {missingCount > 0
              ? `${missingCount}/${readings.length} phòng chưa có chỉ số kỳ ${month}/${year}. Phòng bỏ trống sẽ không thay đổi.`
              : `Tất cả ${readings.length} phòng đã có chỉ số kỳ ${month}/${year}. Sửa lại nếu cần.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phòng</TableHead>
                <TableHead>Chỉ số điện (kWh)</TableHead>
                <TableHead>Chỉ số nước (m³)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((row) => {
                const statusId = `reading-status-${row.roomId}`;
                return (
                  <TableRow
                    key={row.roomId}
                    className={cn(
                      !row.recorded &&
                        row.editable &&
                        "bg-amber-50/70 hover:bg-amber-50/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/20",
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span className="break-words">{row.roomName}</span>
                        {/* The state is spelled out in text, so the amber tint
                            is never the only signal. */}
                        <span id={statusId} className="text-xs font-normal">
                          {!row.editable ? (
                            <Badge variant="outline">{row.lockReason}</Badge>
                          ) : row.recorded ? (
                            <span className="text-muted-foreground">
                              Đã nhập
                            </span>
                          ) : (
                            <Badge variant="destructive">Chưa nhập</Badge>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                        Kỳ trước: {row.prevElectricity}
                      </p>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={row.prevElectricity}
                        placeholder="Chỉ số mới"
                        aria-label={`Chỉ số điện mới phòng ${row.roomName}`}
                        aria-describedby={statusId}
                        disabled={!row.editable}
                        value={draft[row.roomId]?.electricity ?? ""}
                        onChange={(e) =>
                          setValue(row.roomId, "electricity", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                        Kỳ trước: {row.prevWater}
                      </p>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={row.prevWater}
                        placeholder="Chỉ số mới"
                        aria-label={`Chỉ số nước mới phòng ${row.roomName}`}
                        aria-describedby={statusId}
                        disabled={!row.editable}
                        value={draft[row.roomId]?.water ?? ""}
                        onChange={(e) =>
                          setValue(row.roomId, "water", e.target.value)
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
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

Note the `DialogContent` is now `flex max-h-[85vh] flex-col` with the table wrapper scrolling, so the header and footer stay put instead of scrolling away.

- [ ] **Step 5: Fix the room detail reading editor's bound**

`RoomReadingEditor` validates against the room's mirror columns, which is wrong for any period but the newest — the same defect just fixed in the bulk dialog. It lets the user pick an arbitrary month, so leave that alone and just stop the client from pre-rejecting valid back-dated input; the server now enforces the real bounds.

In `apps/web/features/rooms/components/room-reading-editor.tsx`, delete the client-side comparison in `handleSubmit` (lines 48-51):

```tsx
    if (nextElectricity < electricityReading || nextWater < waterReading) {
      toast.error("Chỉ số mới phải lớn hơn hoặc bằng chỉ số hiện tại");
      return;
    }
```

and replace the two `min={electricityReading}` / `min={waterReading}` attributes on the inputs (lines 123 and 138) with `min={0}`. Change both "Chỉ số cũ:" labels to read "Chỉ số hiện tại:" so they stop implying a per-period baseline. Keep the `toast` import — it is still used for the error and success paths.

- [ ] **Step 6: Verify build and lint**

Run: `cd apps/web && pnpm lint && pnpm build`
Expected: both clean.

- [ ] **Step 7: Verify by hand**

Open `/invoices` on a month where some rooms have readings and some do not. Confirm: missing rooms sort to the top with an amber tint and a `Chưa nhập` badge, the header counts them, recorded rooms are prefilled and marked `Đã nhập`, "Kỳ trước" shows the previous period rather than the room's newest value, and a room whose period is locked renders disabled with the reason. Save a mix and confirm the toast count matches the rows you actually changed.

- [ ] **Step 8: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web/features/rooms/types.ts "apps/web/app/(admin)/invoices/page.tsx" apps/web/features/invoices/components/invoices-toolbar.tsx apps/web/features/rooms/components/bulk-readings-dialog.tsx apps/web/features/rooms/components/room-reading-editor.tsx
git commit -m "feat(web): highlight and prefill rooms missing a reading for the period"
```

---

### Task 6: Responsive containment across the admin screens

One layout fix removes the root cause; the rest is measuring what still overflows and containing it.

**Files:**
- Modify: `apps/web/app/(admin)/layout.tsx`
- Modify: whichever page and feature components the measurement in Step 3 flags. Candidates, in priority order: `app/(admin)/invoices/page.tsx`, `features/invoices/components/invoices-toolbar.tsx`, `app/(admin)/rooms/[id]/page.tsx`, `features/contracts/components/contracts-table.tsx`, `features/tenants/components/tenants-table.tsx`, `features/rooms/components/rooms-table.tsx`, `features/users/components/users-table.tsx`, `features/settings/components/*`, `features/dashboard/components/*`.

**Interfaces:**
- Consumes: nothing. Produces: nothing. Pure layout.

- [ ] **Step 1: Fix the root cause in the admin layout**

`SidebarInset` (`components/ui/sidebar.tsx:304`) is a flex child with the default `min-width: auto`, so a wide table grows the whole main column instead of scrolling inside the `overflow-x-auto` box `Table` already gives it. Fix it at the call site — do not edit `components/ui/`.

In `apps/web/app/(admin)/layout.tsx`, change:

```tsx
      <SidebarInset>
        <SiteHeader user={{ name: user.name, username: user.username }} />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
```

to:

```tsx
      <SidebarInset className="min-w-0">
        <SiteHeader user={{ name: user.name, username: user.username }} />
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
          {children}
        </main>
      </SidebarInset>
```

- [ ] **Step 2: Contain the invoices toolbar**

`InvoicesToolbar` puts a month picker and three buttons in one flex row; it wraps, but the children cannot shrink, so long labels push it wide. In `apps/web/features/invoices/components/invoices-toolbar.tsx` change the root (line 117):

```tsx
    <div className="flex flex-wrap items-end justify-between gap-3">
```

to:

```tsx
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
```

and the button group (line 122):

```tsx
      <div className="flex items-end gap-2">
```

to:

```tsx
      <div className="flex min-w-0 flex-wrap items-end gap-2">
```

- [ ] **Step 3: Measure what still overflows**

Start the dev server (`cd apps/web && pnpm dev`), sign in, then for each admin route — `/`, `/rooms`, a `/rooms/<id>`, `/contracts`, `/tenants`, `/invoices`, `/users`, `/settings` — check every breakpoint. In the browser devtools console at each of 320, 375, 768, 1024 and 1440 px wide:

```js
const d = document.documentElement;
console.log(location.pathname, innerWidth, d.scrollWidth, d.scrollWidth <= d.clientWidth ? "OK" : "OVERFLOW");
```

To find the culprit on an OVERFLOW result:

```js
[...document.querySelectorAll("*")]
  .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
  .slice(0, 10)
  .forEach((el) => console.log(el.className || el.tagName, Math.round(el.getBoundingClientRect().right)));
```

Write down each offender before fixing anything — the same className pattern usually repeats across screens.

- [ ] **Step 4: Apply the containment patterns**

For each offender from Step 3, apply the matching fix and nothing more:

- A flex or grid **column that wraps a table** → add `min-w-0` to it. `Table` already scrolls internally once its parent stops growing.
- A **toolbar / action row** whose children push it wide → `flex-wrap` on the row plus `min-w-0` on the side that should give way.
- **Long text** (room names, tenant names, hometown, notes, fee type names) → `break-words` in cards and headings, `truncate` inside fixed-width table cells.
- A **dialog** that overrides the default width → keep `sm:max-w-*` but make it `flex max-h-[85vh] flex-col` with the body in a `min-w-0 flex-1 overflow-y-auto` wrapper, so header and footer stay fixed. (`DialogContent` already ships `max-w-[calc(100%-2rem)]`, so plain dialogs need nothing.)
- A **card grid** → already responsive via `sm:grid-cols-*`; only add `min-w-0` to a card whose content overflows it.

Re-run the Step 3 check after each screen.

- [ ] **Step 5: Confirm every route is clean**

Repeat the Step 3 measurement across all eight routes at all five widths. Expected: `OK` for every combination. Record the result — this is the evidence the task is done.

- [ ] **Step 6: Verify build and lint**

Run: `cd apps/web && pnpm lint && pnpm build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/hiepnn/projects/house-management
git add apps/web
git commit -m "fix(web): contain horizontal overflow across the admin screens"
```

---

## Final verification

- [ ] `cd apps/api && pnpm test` — all suites pass
- [ ] `cd apps/api && pnpm build && pnpm lint` — clean
- [ ] `cd apps/web && pnpm build && pnpm lint` — clean
- [ ] Rebuild the API Docker image if the app is served from the container — a stale image serves the old routes and `GET /rooms/meter-readings` will 404
- [ ] End-to-end: on `/invoices`, update a reading from a row for the **current** month, confirm the total changes as previewed; repeat for a **previous** month and confirm the following month's invoice `prev` follows along and is not double-billed
- [ ] Confirm a reading edit is refused, with the period named, when a later invoice is PAID
