# Per-invoice meter readings, back-dated edits, and a responsive sweep

Date: 2026-08-02

## Problem

Four things, from the invoices screen outward:

1. Updating a meter reading requires opening the bulk dialog from the toolbar and
   finding the room in a list. There is no way to act on the invoice row you are
   already looking at.
2. When a reading is saved, the invoice amount is recomputed server-side, but the
   user never sees the new number until the page refreshes — and never sees what it
   *will* be before committing.
3. Tables and toolbars tear through the viewport when the window narrows.
4. `BulkReadingsDialog` cannot tell which rooms are still missing a reading for the
   selected period, so every room looks the same and nothing is prefilled.

A fifth problem surfaces as soon as (1) exists: the backend refuses to edit any
period that is not the room's most recent, so the new button would be dead on any
month but the latest.

## Current behaviour

- `bulkUpdateReadings` (`apps/api/src/rooms/rooms.service.ts:118`) validates every
  item, then per item: upserts `MeterReading`, appends `MeterReadingHistory`,
  mirrors the value into `Room.electricityReading`/`waterReading`, and calls
  `InvoicesService.syncMeterReading`.
- `syncMeterReading` (`apps/api/src/invoices/invoices.service.ts:404`) rewrites that
  one invoice's `electricityCurrent`, `waterCurrent` and `totalAmount`, using the
  invoice's own stored `prev` values and unit prices. It throws on a PAID invoice.
- An invoice's `electricityPrev` is a **stored snapshot** of the previous invoice's
  `electricityCurrent` (`invoices.service.ts:180`), not a live lookup.
- `bulkUpdateReadings` rejects a period if any newer reading exists for the room:
  `"Chỉ được sửa chỉ số của kỳ gần nhất (phòng X)"`.
- `BulkReadingsDialog` renders every occupied room, labels `room.electricityReading`
  as "Chỉ số cũ", and uses it as the input's `min`.
- `Table` (`apps/web/components/ui/table.tsx`) already wraps itself in
  `overflow-x-auto`.

## Why back-dated edits are not just "delete the guard"

The guard is load-bearing for two reasons:

**Double billing.** Month M+1 stores `electricityPrev` as a snapshot of month M's
`electricityCurrent`. Edit month M from 1305 → 1350: `syncMeterReading` updates M,
but M+1 still starts from 1305, so 45 kWh is billed in both months.

**Room mirror corruption.** `bulkUpdateReadings` unconditionally writes the saved
value into `Room.electricityReading`. Editing an old month would stamp a stale
number onto the room as if it were the current reading.

So the guard is replaced by a cascade plus two narrower rules, below.

## Design

### 1. Backend — back-dated reading edits

**Replace the latest-period-only guard.** In `bulkUpdateReadings`, delete the
"newer reading exists" rejection and add, per item:

- **Lower bound** — new reading ≥ the previous recorded period's reading, falling
  back to `Contract.initialElectricityReading` then `Room.initialElectricityReading`
  (unchanged from today, just no longer coupled to "latest").
- **Upper bound** (new) — new reading ≤ the next recorded period's reading, if one
  exists. Message: `"Chỉ số mới của phòng X phải nhỏ hơn hoặc bằng chỉ số kỳ N/YYYY"`.
- **Settled-period check** (new, replaces `READING_PAID_LOCKED`'s narrow form) — if
  the edited period's invoice **or any later invoice for that room** is PAID, reject
  the whole request before any write:
  `"Không thể sửa chỉ số kỳ M/YYYY của phòng X: hoá đơn kỳ N/YYYY đã thanh toán"`.

All validation stays in the existing pre-write loop, so a rejected item never leaves
partial state — that is why the check is up-front rather than inside
`syncMeterReading`.

**Room mirror only when newest.** Write `Room.electricityReading`/`waterReading`
only when the edited period is the room's most recent recorded period. Otherwise
leave the mirror alone.

**Cascade re-sync.** `syncMeterReading(roomId, year, month)` becomes
`resyncFromPeriod(roomId, year, month)`:

1. Load the room's invoices from `(year, month)` forward, ordered by year then month.
   If no invoice exists **for the edited period itself**, return without writing —
   the `prev` chain runs through invoices, not readings, so a reading in a period
   with no invoice cannot affect any later invoice. This preserves today's
   `syncMeterReading` early-return.
2. For the edited period's invoice: keep its stored `prev` — the baseline before the
   edited period is unaffected — and set `current` from the new reading.
3. For each subsequent invoice, in order: `prev` = predecessor's freshly written
   `current`; `current` = that period's `MeterReading` if one exists, else `prev`.
4. Recompute `electricityAmount`, `waterAmount` and `totalAmount` for each from the
   invoice's **own stored** unit prices and fixed fees.
5. Write only invoices whose values actually changed.

Step 4 deliberately does **not** call `computeInvoiceData`. That function rebuilds
room price, fee settings and occupant counts from today's data and would silently
overwrite manual invoice edits — the caveat `refreshForMonth` already documents.
A reading edit must change readings and nothing else.

The settled-period check in `bulkUpdateReadings` runs before any write, so the
cascade never encounters a PAID invoice; `resyncFromPeriod` keeps a defensive throw
so it cannot be misused from another call site.

### 2. Backend — `GET /rooms/meter-readings?year=&month=`

Declared **before** the `:id` routes in `RoomsController`, alongside the existing
`@Patch('meter-readings')`, or Nest resolves `meter-readings` as an `:id`.

Query validated by a `PeriodQueryDto` (`@IsInt` + `@Min/@Max`, same bounds as
`GenerateInvoicesDto`); the global pipe runs with `transform: true`, so the string
query params coerce.

Returns one entry per OCCUPIED room:

```ts
interface RoomPeriodReading {
  roomId: number;
  roomName: string;
  prevElectricity: number;      // kỳ liền trước, hoặc chỉ số khởi tạo
  prevWater: number;
  electricityReading: number | null;  // null = kỳ này chưa nhập
  waterReading: number | null;
  recorded: boolean;
  editable: boolean;            // false khi kỳ này hoặc kỳ sau đã PAID
  lockReason: string | null;    // nêu đích danh kỳ đang khoá
}
```

`prevElectricity`/`prevWater` must resolve through the **same** helper the write path
validates against — extract the existing lookup in `bulkUpdateReadings` into one
private method so the number displayed and the number validated cannot drift.

### 3. Web — per-row reading dialog

New `apps/web/features/invoices/components/invoice-reading-dialog.tsx`.

**Trigger.** A `Gauge` ghost icon button in each row's action group in
`InvoiceList`, and in each card's action row in `InvoiceGrid`, placed before the eye
icon. Disabled with a `title` when `invoice.status === "PAID"`.

**No fetch.** Everything the dialog needs is already on the `Invoice`:
`electricityPrev`, `electricityCurrent`, `electricityUnitPrice`, the water
equivalents, the fixed fees and `totalAmount`. The live preview is client-side
arithmetic mirroring `resyncFromPeriod`:

```
┌ Chỉ số phòng P201 · kỳ 8/2026 ────────────────┐
│ Điện (kWh)   kỳ trước 1240   → [ 1305 ]       │
│ Nước (m³)    kỳ trước   87   → [   92 ]       │
├───────────────────────────────────────────────┤
│ Điện   65 kWh × 3.500  =  227.500 ₫           │
│ Nước    5 m³  × 15.000 =   75.000 ₫           │
│ Tổng cộng   2.800.000 ₫ → 3.102.500 ₫         │
└───────────────────────────────────────────────┘
```

The preview updates as you type and shows old → new total so the price change is
visible before saving.

**Save.** Reuses the existing `bulkUpdateReadings` server action with a single item
and the invoice's own `year`/`month`, then toast + `router.refresh()`.

**Validation.** Client-side `current ≥ prev` and integer ≥ 0 for immediate feedback;
the API remains the boundary. A server rejection (settled later period, upper bound)
surfaces as an error toast with the server's Vietnamese message.

### 4. Web — bulk dialog highlight and prefill

`app/(admin)/invoices/page.tsx` fetches `RoomPeriodReading[]` server-side alongside
rooms and invoices and passes it through `InvoicesToolbar` into
`BulkReadingsDialog`, so the dialog opens with data in hand — no client fetch, no
loading state.

- Rooms **missing a reading sort first**; header reads
  `"3/8 phòng chưa có chỉ số kỳ 8/2026"`.
- Highlight is never colour-only: an amber row tint **plus** a `Chưa nhập` badge next
  to the room name, linked to that row's inputs via `aria-describedby`.
- Recorded rooms show a muted `Đã nhập` and have their value prefilled.
- `"Chỉ số cũ"` becomes `prevElectricity`/`prevWater` — the **previous period's**
  reading. Today it shows the room mirror, which is wrong whenever you reopen a
  period you already entered, and that wrong number is also the input's `min`.
- Rooms with `editable: false` render disabled with `lockReason` as the explanation.

`RoomReadingEditor` (room detail page) lets the user pick any month/year and
validates against the room mirror. Its client-side `min` is corrected the same way
so it stops contradicting the server for back-dated periods.

### 5. Web — responsive

**Root cause.** `SidebarInset` (`components/ui/sidebar.tsx:304`) is a flex child with
the default `min-width: auto`. A wide table grows the whole main column instead of
scrolling inside its own `overflow-x-auto` box, which `Table` already provides. One
fix in `app/(admin)/layout.tsx` — `min-w-0` on `SidebarInset` and on the inner
`main`, applied via `className` rather than editing `components/ui/` — removes most
overflow across every admin screen at once.

Then per screen, in priority order **hoá đơn → chi tiết phòng → hợp đồng / khách
thuê → phòng, người dùng, cài đặt, dashboard**:

- `min-w-0` on flex columns wrapping tables.
- Toolbars: `flex-wrap` plus `min-w-0` on the growing side. The invoices toolbar
  holds a month picker and three buttons in one row; it wraps, but its children
  cannot shrink.
- Dialogs: `w-[calc(100vw-2rem)] sm:max-w-*`, with the body scrolling rather than the
  whole dialog.
- `truncate` / `break-words` on room names, tenant names and notes.

## Testing

**API** — new cases in `rooms.service.spec.ts`:

- back-dated edit succeeds and cascades: later UNPAID invoice's `prev` follows the
  edited period's new `current`, and its total is recomputed
- back-dated edit rejected when a later invoice is PAID, and **nothing** is written
- upper-bound rejection when the new value exceeds the next recorded period
- room mirror unchanged for a back-dated edit, updated for the newest period
- `GET /rooms/meter-readings`: `recorded`, `prev*` fallback chain
  (previous reading → contract initial → room initial), `editable`/`lockReason`

Existing `rooms.service.spec.ts` and `invoices.service.spec.ts` must stay green; the
spec asserting the old latest-period-only rejection is replaced, not deleted, by the
settled-period case.

**Web** — no test runner in `apps/web`, so verification is:

- `pnpm build` and `pnpm lint` clean
- each admin route driven at 320 / 375 / 768 / 1024 / 1440 px, asserting
  `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- manual pass: per-row dialog preview matches the saved total; bulk dialog highlights
  and prefills correctly for a period with a mix of recorded and missing rooms

## Out of scope

- Editing unit prices or room price from the reading dialogs — that is what the
  existing `EditInvoiceDialog` is for.
- Recomputing PAID invoices. Settled bills stay immutable; the user unpays first.
- Any redesign beyond overflow containment.
