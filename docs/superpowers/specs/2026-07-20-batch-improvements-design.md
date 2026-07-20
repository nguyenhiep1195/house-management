# Design: Batch improvements (5 features)

Date: 2026-07-20
Status: Approved

Five independent improvements to the House Management app, delivered as one batch.
Each section is self-contained and can be implemented/verified separately.

## Context

- Web: Next.js 16, Server Components, `apiFetch` server-side client, shadcn/ui, Tailwind v4.
- API: NestJS 11, Prisma, MySQL; API runs inside a Docker container (rebuild image after backend changes).
- Existing facts:
  - `room.price` already syncs from the ACTIVE contract's price (`contracts.service.ts`).
  - Invoices **snapshot** all fee amounts at creation — editing settings never affects existing invoices.
  - `Setting` is a singleton. No settings history, no dashboard/stats endpoint yet.
  - No charting library installed.
  - Font sizes are theme presets in `lib/theme.ts` (sm 14 / md 16 / lg 18px) applied via `data-fontSize`.

---

## Feature 1 — Giá thuê phòng theo hợp đồng

**Goal:** Rent price is owned by the contract, not entered directly on the room.

**Web:**
- Remove the `price` input from `features/rooms/components/room-form-dialog.tsx` (create + edit).
- Rooms table (`rooms-table.tsx`) and room detail page: if the room has an ACTIVE contract, show its
  price (unchanged, since `room.price` mirrors the active contract). If no active contract, show
  **"Chưa có hợp đồng"** with a button/link that opens the contract create form for that room.

**API:**
- Make `price` optional in `CreateRoomDto` (default `0`). No schema change — `room.price` already exists
  and defaults to `0`.

**Out of scope:** contract CRUD itself is unchanged.

---

## Feature 2 — Ẩn "Hoạt động gần đây"

**Goal:** Temporarily hide the Recent Activity section on the dashboard.

- Remove the `<RecentActivities />` render from `app/(admin)/page.tsx`.
- Keep the component file and its data (temporary hide, easy to restore).

---

## Feature 3 — Thống kê + biểu đồ (dashboard)

**Goal:** Replace mock dashboard stats with real data + charts, filterable by month/year.

**API — new `DashboardModule`, `GET /dashboard/stats?year=&month=`** (auth required):
Returns a single aggregated payload:
- `rooms`: `{ total, available, occupied, maintenance }`
- `occupants`: total `Σ room.occupantCount`
- `motorbikes`: total `Σ room.motorbikeCount`
- `period`: `{ year, month }`
- `utilities`: `{ electricityConsumption, waterConsumption }` for the selected period
  (`Σ (electricityCurrent - electricityPrev)` and water equivalent across that month's invoices)
- `invoices`: `{ paid, unpaid, total, revenue }` for the selected period (revenue = Σ totalAmount of PAID)
- `trend`: last 6 months (including selected), each
  `{ year, month, electricityConsumption, waterConsumption, revenue }`

Aggregation uses Prisma `groupBy`/`aggregate` where possible; validated query params via a DTO.

**Web — `app/(admin)/page.tsx` + `features/dashboard`:**
- Add a month/year selector at the top (default = current month), which drives the fetch.
- Stat cards (real data): Số phòng (+ breakdown theo trạng thái), Số người (`occupants`), Số xe
  (`motorbikes`), Điện tiêu thụ (kỳ), Nước tiêu thụ (kỳ), Hoá đơn (PAID/UNPAID) + doanh thu.
- Charts row below (add **recharts + shadcn `chart` component**):
  1. Donut — cơ cấu phòng theo trạng thái.
  2. Donut/bar — trạng thái thanh toán hoá đơn (kỳ đã chọn).
  3. Bar/line — tiêu thụ điện & nước 6 tháng gần nhất.
- Use the `ui-ux-pro-max` skill when building the UI.

**Design decision:** "Số người" = `Σ occupantCount` (operational occupants, parallel to Số xe). Tenant
count is not shown as a separate card to keep the dashboard focused.

---

## Feature 4 — Cỡ chữ "Lớn" +2px

**Goal:** The "Lớn" font preset should be 2px larger.

- In `lib/theme.ts`, change the `lg` preset `px: 18` → `px: 20`. Preview and `data-fontSize` styling
  already read from this value; no other change needed.

---

## Feature 5 — Lịch sử cài đặt phí

**Goal:** Keep a history of fee-setting changes, shown in a tab next to "Cài đặt phí". New fees apply
only to newly-created invoices (already true via snapshotting — no semantic change).

**API — new Prisma model `SettingHistory`:**
- Full snapshot per change: the 8 fee fields (`electricityUnitPrice`, `waterUnitPrice`, `internetFee`,
  `elevatorFeePerPerson`, `cleaningFeePerPerson`, `motorbikeFeePerExtra`, `freeMotorbikeCount`,
  `otherFee`) + `changedAt DateTime @default(now())` + `changedById Int?` + `changedByName String?`.
- On every `PATCH /settings`, insert one history row (snapshot of the new values + who changed it,
  from the authenticated user).
- **New endpoint** `GET /settings/history` (admin) — returns rows newest-first.
- Requires a Prisma migration + Docker image rebuild.

**Web — settings page:**
- Inside the "Cài đặt phí" panel, add sub-tabs: **[Cài đặt phí]** (existing form) and **[Lịch sử]**
  (a table of past fee versions: timestamp, người thay đổi, and the fee values).

**Application semantics:** unchanged — invoices snapshot fees at creation, so paid/existing invoices are
never affected; new fees apply only to invoices generated afterward.

---

## Testing / verification

- API: unit tests for the dashboard aggregation service and settings-history recording
  (`*.spec.ts`), following existing patterns. Rebuild Docker image, then smoke-test endpoints.
- Web: manual verification of each screen (rooms form, dashboard with month selector + charts,
  settings sub-tabs, font "Lớn" preview). `pnpm build` must pass.

## Rollout order (independent, low → high risk)

1. Feature 4 (font) — trivial.
2. Feature 2 (hide recent activity) — trivial.
3. Feature 1 (room price → contract).
4. Feature 5 (settings history) — needs migration.
5. Feature 3 (dashboard stats + charts) — largest.
