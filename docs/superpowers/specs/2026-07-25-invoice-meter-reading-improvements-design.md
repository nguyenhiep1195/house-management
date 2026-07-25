# Invoice & Meter-Reading Improvements — Design

Date: 2026-07-25
Status: Approved (pending spec review)

## Goal

Improve the invoice (hoá đơn) feature and rework meter readings from a single
global value per room into per-month records, so that:

1. Invoice creation validates that occupied rooms have their electricity/water
   readings entered for the target month, and warns otherwise.
2. The invoice list rows are collapsible to reveal the full fee breakdown.
3. Row actions use explicit icons (view detail, edit, delete) instead of a
   `...` dropdown.
4. A "Cập nhật chỉ số điện nước" button sits next to "Tạo hoá đơn" and opens the
   same bulk-reading UX as the rooms page, scoped to the page's month/year.
5. The invoice page offers two view modes: list (default) and grid (cards).
6. Meter readings become per-month, editable for the most recent month only,
   with edits syncing back into that month's invoice; the room detail page shows
   a reading-edit history table.

## Context / current state

- Monorepo: `apps/api` (NestJS 11 + Prisma + MySQL), `apps/web` (Next.js 16).
- Schema is managed with `prisma db push` — **there are no migration files**.
  Follow the same workflow (no hand-written migrations).
- `SettingHistory` is an existing precedent for an immutable audit/history table
  rendered in a "Lịch sử" tab — mirror its shape and UX.
- Today `Room.electricityReading` / `Room.waterReading` are single global
  "latest reading" values. `Invoice` already snapshots
  `electricityPrev/Current`, `waterPrev/Current`, unit prices, and every fee at
  creation time (fees are immutable once created).
- Invoice endpoints today: `GET /invoices`, `POST /invoices`,
  `POST /invoices/generate`, `PATCH /invoices/:id/pay`,
  `PATCH /invoices/:id/unpay`, `DELETE /invoices/:id`. **No edit endpoint.**
- Occupancy is the manual `Room.status = OCCUPIED` flag; generation only
  processes occupied rooms.

## Decisions (confirmed with user)

- Invoice edit = **full edit** of all fee fields (not just readings).
- "Xem chi tiết" icon opens a **full read-only detail dialog**; the collapsible
  row is the quick inline breakdown (two distinct affordances).
- Meter readings are stored **per month**; only the room's **most recent**
  recorded month is editable; older months are locked.
- Editing a month's reading **syncs** that month's invoice if one exists.
- **PAID invoices are locked** — no invoice edit and no reading edit that would
  mutate a paid invoice.
- Default invoice view = **list**; grid is opt-in.

## A. Data model

### New: `MeterReading` (per-month source of truth)

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
```

### New: `MeterReadingHistory` (immutable audit, mirrors `SettingHistory`)

```prisma
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

A history row is written on **every** create and every edit of a `MeterReading`.

### Kept fields

- `Room.electricityReading` / `Room.waterReading` are **kept** as a
  denormalized "latest reading" mirror, updated whenever the room's newest
  recorded month is saved. Existing rooms-table and room-form displays are left
  untouched.
- `Room.initialElectricityReading` / `initialWaterReading` remain the baseline
  used as "prev" when no earlier month exists.
- `Room` gains a `meterReadings MeterReading[]` relation.

### Reading semantics for a month `(Y, M)`

- **current** = `MeterReading(room, Y, M).electricityReading` (resp. water).
- **prev** = the reading of the closest earlier recorded month for the room,
  else `Room.initialElectricityReading` (resp. water).

## B. Backend behavior & endpoints

### Meter readings (rooms module)

- `PATCH /rooms/meter-readings` gains **`year` + `month`** in the DTO. For each
  item it upserts `MeterReading(roomId, year, month)` and writes a
  `MeterReadingHistory` snapshot. Validation:
  - New reading must be `>=` the prev month's reading (same rule as today,
    computed against the prev-month record / initial reading).
  - The target month must be the room's **most recent** recorded month, or a
    **new month newer** than any existing record. Editing a month that is not
    the latest is rejected: `"Chỉ được sửa chỉ số của kỳ gần nhất"`.
  - When the saved month is the newest for the room, mirror its values into
    `Room.electricityReading` / `waterReading`.
- **Invoice sync:** after upserting a reading for `(Y, M)`, if an invoice exists
  for that room+month:
  - If the invoice is `PAID` → reject the whole reading update with
    `"Hoá đơn kỳ này đã thanh toán, không thể sửa chỉ số"`.
  - Else recompute `electricityCurrent`, `waterCurrent`, the electricity/water
    amounts, and `totalAmount`, **reusing the invoice's own snapshotted unit
    prices and other fees** (do not re-pull current settings). `electricityPrev`
    / `waterPrev` are left as-is.
- `GET /rooms/:id/meter-readings/history` → `MeterReadingHistory` rows for the
  room, newest first, for the room-detail history table.
- (Optional helper) `GET /rooms/:id/meter-readings` or reuse existing room
  detail payload to expose the latest recorded month if the UI needs it.

### Invoice generation / creation sourced from readings

- `InvoicesService.create` and `generateForMonth` source the **current** reading
  from `MeterReading(Y, M)` instead of `Room.electricityReading`.
- If an occupied room has **no** `MeterReading(Y, M)`, `create` throws a
  `BadRequestException("Phòng <name> chưa nhập chỉ số điện nước tháng M/Y")`.
  `generateForMonth` treats such rooms as **skipped-missing** and returns them
  so the UI can list them (see below).
- `generateForMonth` return shape becomes
  `{ created: number; skipped: number; missingReadings: { roomId, roomName }[] }`
  (extends today's `{ created, skipped }`).

### Invoice full edit

- New `PATCH /invoices/:id` with an `UpdateInvoiceDto` allowing:
  `roomPrice`, `electricityPrev`, `electricityCurrent`, `electricityUnitPrice`,
  `waterPrev`, `waterCurrent`, `waterUnitPrice`, `internetFee`, `elevatorFee`,
  `cleaningFee`, `motorbikeFee`, `otherFee`, `occupantCount`, `motorbikeCount`.
  All optional; every field a non-negative int via class-validator.
- Recomputes `totalAmount` from the resulting field set.
- Rejected with a `ConflictException` if the invoice is `PAID`
  (`"Không thể sửa hoá đơn đã thanh toán"`).
- Does **not** write back to `MeterReading` (invoice edit is an override of the
  snapshot; reading edit is the other direction). This is an accepted, minor
  divergence surface — documented, not reconciled, to keep scope bounded.

### Security / conventions

- All new endpoints are under the global `JwtAuthGuard`; admin-only mutations
  keep the existing `@Roles(...)` pattern used by the rooms/invoices modules.
- All bodies validated by class-validator DTOs (`whitelist: true`); no `any`.
- Prisma only; no raw SQL.

## C. Invoice page UI (`apps/web`)

Route stays `/(admin)/invoices`. Server component reads `month`, `year`, and a
new `view` query param.

### List view (enhanced)

- Each row gets a leading chevron toggle; expanding reveals the full breakdown:
  old/new electricity & water readings, unit prices, each fee line
  (internet, elevator, cleaning, motorbike, other), room price, and total.
- Implemented with a controlled expanded-row state in `invoice-list.tsx` (an
  extra `<TableRow>` spanning all columns when expanded).

### Row actions (replace `...`)

- Three icon buttons per row (with `sr-only` labels + tooltips):
  - 👁 `Eye` — **Xem chi tiết** → opens `InvoiceDetailDialog` (read-only full
    breakdown, incl. payment status/method/date).
  - ✏️ `Pencil` — **Sửa** → opens `EditInvoiceDialog`; **hidden/disabled when
    PAID**.
  - 🗑 `Trash2` — **Xoá** → existing delete confirm; disabled when PAID.
- The pay / unpay control remains its own button, unchanged in behavior.

### View toggle (list ⇄ grid)

- A segmented toggle in the toolbar sets `?view=grid` / `?view=list` (URL param
  → server-render friendly, shareable, no client persistence needed).
- **Grid**: one `Card` per invoice — room name, `MM/YYYY` period, status badge,
  a few key fee lines (điện, nước, phí khác), highlighted total, and the same
  three icon actions + pay button.
- List is default when `view` is absent or `list`.

### Creation flow + reading button

- Toolbar shows, next to **"Tạo hoá đơn tháng M/Y"**, a
  **"Cập nhật chỉ số điện nước"** button (Gauge icon) opening a per-month bulk
  reading dialog — same UX as the rooms `BulkReadingsDialog`, but scoped to the
  page's `month`/`year` and to occupied rooms, calling the month-aware
  `PATCH /rooms/meter-readings`.
- On **generate**, use the `missingReadings` result: if non-empty, show a
  warning (toast + inline) listing the rooms that have no reading for M/Y and
  offer to open the reading dialog instead of proceeding silently. Rooms that do
  have readings are still generated.

## D. Room detail page

- Add a **"Lịch sử chỉnh sửa chỉ số"** section/table sourced from
  `GET /rooms/:id/meter-readings/history`: columns = Kỳ (MM/YYYY), Điện, Nước,
  Người sửa, Thời gian — styled like the existing settings history table.

## Out of scope (YAGNI)

- Backfilling `MeterReading` rows from existing invoices (fresh start; existing
  global room readings remain the baseline via `initial*Reading`).
- Editing readings for non-latest months.
- Reconciling an invoice-edit override back into `MeterReading`.
- Per-user permissions beyond the existing admin role gating.

## Testing

- API unit tests (`*.spec.ts`): reading upsert (create + edit-latest + reject
  older-month + reject-when-paid), prev/current derivation, invoice sync
  recompute, generation `missingReadings`, invoice full-edit recompute + PAID
  rejection.
- Web: manual verification of collapse, detail/edit/delete icons, list⇄grid
  toggle, and the missing-readings warning during generation.

## Rollout / ordering

1. **Backend**: schema (`prisma db push`) + meter-reading per-month endpoints +
   history + invoice sourcing/sync + invoice edit endpoint.
2. **Invoice UI**: collapse, icon actions + detail/edit dialogs, list⇄grid,
   reading button + missing-readings warning.
3. **Room detail**: reading-edit history table.
