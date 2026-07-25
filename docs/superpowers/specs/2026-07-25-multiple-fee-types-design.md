# Multiple named fee types

## Goal

Today there is a single global fee configuration (`Setting`). Expand it into
multiple **named fee types** ("Loại I", "Loại II", …) managed as tabs on the
Settings screen. Each room is assigned a fee type; invoice generation uses the
room's assigned fee type (falling back to the default, "Loại I").

## Decisions (from brainstorming)

- Fee types can be **added / renamed / deleted freely** on the settings screen.
- Fee type is **assigned per room**. Bulk generate uses each room's assigned
  type; manual single-room create defaults to the room's type but can be
  overridden.
- Deleting a fee type is **blocked** while any room references it.
- Change history is **per fee type**.

## Data model (`apps/api/prisma/schema.prisma`)

Repurpose the existing `Setting` / `SettingHistory` rows in place (kept
`@@map("settings")` / `@@map("setting_history")` so `prisma db push` ALTERs
rather than drops — preserving existing data on the live Docker DB).

```prisma
model FeeSetting {              // was: Setting  (@@map("settings"))
  id                   Int      @id @default(autoincrement())
  name                 String   @unique @default("Loại I") // default fills the existing row on push
  isDefault            Boolean  @default(false)            // exactly one; fallback for invoices/new rooms
  electricityUnitPrice Int      @default(3500)
  waterUnitPrice       Int      @default(15000)
  internetFee          Int      @default(100000)
  elevatorFeePerPerson Int      @default(30000)
  cleaningFeePerPerson Int      @default(20000)
  motorbikeFeePerExtra Int      @default(100000)
  freeMotorbikeCount   Int      @default(2)
  otherFee             Int      @default(0)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  rooms                Room[]
  history              FeeSettingHistory[]
}

model FeeSettingHistory {       // was: SettingHistory (@@map("setting_history"))
  // ...8 fee fields, changedById, changedByName, changedAt...
  feeSettingId Int?
  feeSetting   FeeSetting? @relation(fields: [feeSettingId], references: [id], onDelete: Cascade)
}

model Room {
  // ...existing...
  feeSettingId Int?
  feeSetting   FeeSetting? @relation(fields: [feeSettingId], references: [id], onDelete: Restrict)
}
```

`Room.feeSettingId` is **nullable with a default fallback** (rather than a
required column) so `db push` succeeds against existing rooms and invoice
generation is resilient to unassigned rooms. `onDelete: Restrict` plus an
explicit service-level guard both block deleting a referenced fee type.

**Backfill (`prisma/seed.ts`):** ensure a default fee type exists (mark the
migrated row `isDefault = true`, name "Loại I"); point any `NULL`
`FeeSettingHistory.feeSettingId` and `Room.feeSettingId` at the default.

## Backend API (`apps/api/src/settings`)

Becomes a fee-type collection resource:

- `GET /settings` → `FeeSetting[]` (all types, default first)
- `POST /settings` → create `{ name, ...fees }`
- `PATCH /settings/:id` → update values + name; snapshots history for that type
- `DELETE /settings/:id` → 409 if any room uses it or it's the default/last one
- `GET /settings/:id/history` → that type's history
- `PATCH /settings/:id/default` → make this type the default (unset others)

Invoices (`invoices.service.ts`): `create()` accepts optional `feeSettingId`;
resolves fee type = dto → room's assigned → default. `generateForMonth()` uses
each room's assigned type. Fee values are still snapshotted onto the invoice, so
existing invoices are unaffected.

Rooms (`rooms` DTOs/service): create/update accept `feeSettingId`; create
defaults to the default type when omitted.

## Frontend (`apps/web`)

- **Settings screen:** outer tabs = fee types + a "＋ Thêm loại" affordance,
  with rename/delete/set-default controls; each type shows its fee form and its
  own history. Reuses the existing `FeeSettingsForm` / `FeeHistoryTable`.
- **Room form:** add a "Loại phí" select (defaults to the default type).
- **Manual invoice dialog:** add a "Loại phí" select defaulting to the room's
  assigned type; passed to `createInvoice`.
- **Bulk generate:** unchanged UI — uses each room's assigned type.
- Types/actions updated: `FeeSetting` gains `name`/`isDefault`; `Room` gains
  `feeSettingId`; invoice/room actions thread `feeSettingId`.

## Out of scope

Reassigning many rooms at once; per-invoice fee-type change after creation
(edit dialog still edits snapshot values directly).
