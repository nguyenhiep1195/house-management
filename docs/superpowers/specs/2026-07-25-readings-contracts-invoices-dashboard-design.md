# Design: Reading baseline theo hợp đồng, sửa chỉ số theo phòng, và polish UI

Date: 2026-07-25

## Bối cảnh

House Management (monorepo `apps/api` NestJS+Prisma+MySQL, `apps/web` Next.js 16 +
Tailwind v4 + shadcn/ui). Copy hướng người dùng bằng tiếng Việt.

Gói thay đổi này gộp 7 yêu cầu xoay quanh chỉ số điện nước, hợp đồng, hoá đơn,
dashboard và bảng danh sách. Nền tảng hiện có:

- Hoá đơn đã tính `current − prev`, với `prev = hoáĐơnTrước.electricityCurrent`
  và fallback `room.initialElectricityReading` (`invoices.service.ts:79–99`).
- `generateForMonth` đã **bỏ qua** phòng đã có hoá đơn tháng đó (bắt
  `ConflictException`) và trả `{ created, skipped, missingReadings }`
  (`invoices.service.ts:154–185`) — nhưng **chưa trả tên phòng bị bỏ qua**.
- Đã có `MeterReadingHistory` + `GET /rooms/:id/meter-readings/history` và bảng
  "Lịch sử chỉnh sửa chỉ số" trên màn chi tiết phòng.
- Sửa chỉ số hiện chỉ qua dialog **bulk, chọn tháng** (`PATCH /rooms/meter-readings`
  nhận `{ year, month, items[] }`), validate: chỉ sửa kỳ gần nhất, tăng dần, khoá
  khi hoá đơn tháng đó đã PAID.
- Bảng rooms/contracts/tenants/users dùng `DropdownMenu` (`...`); bảng invoices đã
  dùng nút icon.
- Dashboard dùng recharts với `var(--chart-1..5)` (grayscale cố định, không đổi
  theo accent). Theme accent set qua thuộc tính `data-accent` trên `<html>`, biến
  màu trong `globals.css`.

## Quyết định đã chốt

- **Baseline theo hợp đồng, reset mỗi hợp đồng mới.** Room-level initial chỉ còn
  là fallback.
- Sửa chỉ số **vẫn chọn tháng** (mặc định tháng hiện tại).
- Chart màu **dải sắc độ sinh từ accent** đang chọn.
- Chỉ số ban đầu sửa qua **form hợp đồng**; dialog chỉ số ở chi tiết phòng chỉ sửa
  chỉ số theo tháng.

## Phạm vi & thiết kế

### A. Data model — Contract lưu chỉ số ban đầu (#3)

`apps/api/prisma/schema.prisma` — model `Contract` thêm:

```prisma
initialElectricityReading Int @default(0)
initialWaterReading       Int @default(0)
```

Migration Prisma tương ứng (`prisma migrate dev --name contract_initial_readings`).

- `CreateContractDto`: thêm `initialElectricityReading!` và `initialWaterReading!`
  — bắt buộc, `@IsInt()` `@Min(0)`.
- `UpdateContractDto`: 2 trường optional (cho phép sửa lại chỉ số ban đầu).
- `contracts.service.create`: lưu 2 chỉ số ban đầu; trong cùng transaction set
  `room.electricityReading/waterReading = initial*` (chỉ số hiện tại của phòng bám
  theo lúc vào ở). Room-level `initialElectricityReading/initialWaterReading` giữ
  nguyên (fallback cho phòng chưa từng có hợp đồng).

### B. Logic tính hoá đơn theo hợp đồng (#2)

`apps/api/src/invoices/invoices.service.ts` — trong `create()`, thay đoạn tính
`electricityPrev/waterPrev`:

1. **Hợp đồng chi phối** kỳ `(year, month)` = hợp đồng của phòng có `startDate`
   mới nhất mà `startDate <= ` cuối kỳ. (Không có → dùng room-level fallback như cũ.)
2. Tháng bắt đầu hợp đồng `= (startDate.year, startDate.month)`.
3. **Hoá đơn trước gần nhất trong kỳ hợp đồng đó**: hoá đơn của phòng có period
   `< (year, month)` **và** `>= (tháng bắt đầu hợp đồng)`.
4. Kết quả:
   - `electricityPrev = hoáĐơnTrước?.electricityCurrent
     ?? contractChiPhối?.initialElectricityReading
     ?? room.initialElectricityReading`
   - tương tự cho nước.

Hệ quả:
- Hoá đơn đầu tiên của một hợp đồng → trừ theo **chỉ số ban đầu của hợp đồng**.
- Tháng kế tiếp → trừ theo hoá đơn tháng trước.
- Tenant/hợp đồng mới → baseline **reset** về chỉ số ban đầu của hợp đồng mới.

### C. Sửa chỉ số theo từng phòng ở màn chi tiết phòng (#1, #4)

- Thêm nút **"Cập nhật chỉ số"** trong `apps/web/app/(admin)/rooms/[id]/page.tsx`
  → dialog 1 phòng: chọn tháng (mặc định tháng hiện tại), ô điện + nước, hiển thị
  chỉ số cũ. Gọi `PATCH /rooms/meter-readings` với `items` một phần tử. **Không
  đổi backend** — tái dùng validate sẵn có.
- Component mới `single-room-reading-dialog.tsx` (hoặc tái dùng logic của
  `bulk-readings-dialog.tsx`).
- Rà lại bảng "Lịch sử chỉnh sửa chỉ số" (`reading-history-table.tsx`) hiển thị
  đúng Kỳ / Điện / Nước / Người sửa / Thời gian; refresh sau khi sửa.

### D. Bảng danh sách: thay `...` bằng icon (#5)

Đổi cột cuối của **rooms, contracts, tenants, users** từ `DropdownMenu` sang cụm
nút icon ghost theo mẫu `invoice-list.tsx`:

- Rooms: `Eye` (Xem chi tiết → link), `Pencil` (Sửa), `Trash2` (Xoá).
- Contracts: `Pencil` (Sửa), `Trash2` (Xoá — disabled khi `status === "ACTIVE"`).
- Tenants: `Pencil` (Sửa), `Trash2` (Xoá).
- Users: `Pencil` (Sửa), `Lock`/`Unlock` (khoá/mở khoá), `Trash2` (Xoá).

Giữ nguyên `aria-label`, thêm `title`, giữ trạng thái disabled/destructive. Bỏ
import `DropdownMenu*` và `MoreHorizontal` không còn dùng.

### E. Dashboard chart theo accent (#6)

`apps/web/app/globals.css`: với mỗi `[data-accent="..."]` (blue/green/violet/
orange/rose) và biến thể `.dark[data-accent="..."]`, khai báo `--chart-1..5` là
**dải 5 sắc độ cùng tông accent** (giữ hue/chroma, thay đổi lightness từ đậm →
nhạt), chỉnh cho hợp light/dark. `neutral` (mặc định) giữ grayscale hiện tại.

Component chart (`dashboard-charts.tsx`) đã dùng `var(--chart-N)` → **không sửa
code**. Stat cards dùng `text-muted-foreground` (đã theo theme) — giữ nguyên.

### F. Báo phòng đã có hoá đơn sau khi tạo hàng loạt (#7)

- `invoices.service.ts generateForMonth`: thu thập `skippedRooms: { roomId,
  roomName }[]` khi bắt `ConflictException`; trả về `{ created, skipped,
  skippedRooms, missingReadings }`.
- `invoices.cron.ts`: log không đổi ý nghĩa (dùng `skipped`).
- Web `features/invoices/actions.ts`: thêm `skippedRooms` vào kiểu trả về.
- Web `invoices-toolbar.tsx`: sau khi tạo, nếu `skippedRooms.length > 0` hiện toast
  liệt kê tên phòng đã có hoá đơn (kèm vẫn báo số đã tạo + cảnh báo thiếu chỉ số).

## Kiểm thử

API (jest spec):
- `contracts.service` create lưu `initial*` và cập nhật `room` current readings.
- `invoices.service` create: (a) hoá đơn đầu tiên của HĐ dùng `contract.initial`;
  (b) tháng kế trừ theo hoá đơn trước; (c) HĐ mới reset baseline; (d) không có HĐ →
  fallback `room.initial`.
- `invoices.service` generateForMonth trả `skippedRooms` đúng tên.

Web: kiểm thử tay — form hợp đồng (tạo/sửa có chỉ số ban đầu), dialog sửa chỉ số 1
phòng ở chi tiết phòng, bảng danh sách icon, dashboard đổi màu khi đổi accent,
toast liệt kê phòng đã có hoá đơn.

## Ngoài phạm vi

- Không đổi cron lịch tự tạo hoá đơn.
- Không đổi bảng invoices (đã dùng icon).
- Không xử lý nhiều hợp đồng ACTIVE đồng thời (mô hình hiện tại: tối đa 1 ACTIVE/phòng).
