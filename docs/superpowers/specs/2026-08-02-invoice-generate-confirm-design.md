# Modal xác nhận tạo hoá đơn theo tháng

Ngày: 2026-08-02

## Bối cảnh

Trên màn `/invoices`, nút **"Tạo hoá đơn tháng M/YYYY"** chạy ngay khi bấm, không
hỏi lại. Phòng nào chưa nhập chỉ số điện nước của tháng đó thì API từ chối tạo
hoá đơn cho phòng đó, và UI mở dialog nhập chỉ số cho **toàn bộ** phòng đang
thuê. Các toast báo kết quả bị sonner gom thành chồng xếp chồng lên nhau, tối đa
3 cái.

## Mục tiêu

1. Bấm "Tạo hoá đơn theo tháng" → hiện modal xác nhận, trong đó liệt kê ngắn gọn
   các hoá đơn đã tạo của tháng đó (nếu có).
2. Bấm "Xác nhận" → tạo hoá đơn cho mọi phòng đang thuê, **kể cả phòng chưa có
   chỉ số điện nước**; sau đó mở dialog nhập chỉ số cho đúng những phòng còn
   thiếu.
3. Hoá đơn thiếu chỉ số hiện icon cảnh báo ở cột **Tổng cộng**.
4. Mọi toast đều hiện, không đè lên nhau.

## Thiết kế

### 1. API — cho phép tạo hoá đơn khi chưa có chỉ số

`apps/api/src/invoices/invoices.service.ts`

`computeInvoiceData()` hiện `throw new BadRequestException` khi không tìm thấy
`MeterReading` của kỳ. Bỏ nhánh throw đó: khi thiếu chỉ số thì lấy

```
electricityCurrent = electricityPrev
waterCurrent       = waterPrev
```

nên tiêu thụ = 0 và tiền điện/nước = 0. Hoá đơn vẫn có tiền phòng và các phí cố
định (internet, thang máy, vệ sinh, xe máy, phí khác).

Hệ quả trong cùng file:

- `create()` (POST `/invoices`, tạo lẻ một phòng) — không còn ném
  `BadRequestException` vì thiếu chỉ số. Ràng buộc trùng kỳ
  (`ConflictException`) giữ nguyên.
- `generateForMonth()` — nhánh `catch (e) { if (e instanceof BadRequestException) }`
  không còn được kích hoạt. Phòng thiếu chỉ số nay tính vào `created`. Trường
  `missingReadings` trong response vẫn giữ nhưng **đổi nghĩa**: "đã tạo hoá đơn
  nhưng chưa có chỉ số tháng này". Nó được tính bằng một truy vấn
  `meterReading.findMany` cho kỳ đó trước vòng lặp, thay vì bắt exception.
- `refreshForMonth()` — hoá đơn chưa thanh toán mà vẫn thiếu chỉ số nay được
  tính lại (prev = current) thay vì bị bỏ qua. `missingReadings` cũng đổi nghĩa
  tương tự.
- `invoices.cron.ts` — không sửa code. Cron cuối tháng nay tạo hoá đơn có cờ
  cảnh báo cho phòng chưa nhập chỉ số, thay vì bỏ sót phòng đó. **Đây là hành vi
  mong muốn, đã được xác nhận.**

### 2. API — cờ `meterReadingMissing` suy ra lúc đọc

Không thêm cột vào bảng `Invoice`. `findAll()` sau khi lấy danh sách hoá đơn sẽ
truy vấn `meterReading` theo các cặp `(roomId, year, month)` tương ứng (một
`findMany` với `OR` hoặc lọc theo `roomId in [...]` + `year`/`month` khi filter
đã cố định kỳ), rồi gắn `meterReadingMissing: boolean` vào từng hoá đơn trả về.

Lý do chọn suy ra thay vì lưu:

- Không cần đổi schema (dự án dùng `db push`, không có migration).
- Tự hết cảnh báo khi nhập chỉ số sau: `RoomsService.bulkUpdateReadings()` đã gọi
  `InvoicesService.syncMeterReading()` để tính lại hoá đơn của kỳ đó, nên số tiền
  và cờ cảnh báo cùng cập nhật một lượt.

### 3. Web — modal xác nhận

Component mới: `apps/web/features/invoices/components/generate-invoices-dialog.tsx`

```
┌─ Tạo hoá đơn tháng 8/2026 ──────────────────┐
│ Bạn có chắc muốn tạo hoá đơn cho tháng      │
│ 8/2026?                                     │
│                                             │
│ Đã có 3 hoá đơn trong tháng này:            │
│ P101 · P102 · P205                          │
│ Các phòng này sẽ được bỏ qua.               │
│                                             │
│ Sẽ tạo mới cho 5 phòng.                     │
│                        [ Huỷ ] [ Xác nhận ] │
└─────────────────────────────────────────────┘
```

- Khối "Đã có N hoá đơn" chỉ hiện khi tháng đó đã có hoá đơn; danh sách là tên
  phòng nối bằng `·`.
- Số "sẽ tạo mới" = số phòng `OCCUPIED` chưa có hoá đơn trong tháng.
- Dữ liệu lấy từ props, **không gọi thêm API**: `app/(admin)/invoices/page.tsx`
  đã tải sẵn `invoices` và `rooms`; truyền `invoices` xuống `InvoicesToolbar`.
- Nút "Xác nhận" có trạng thái loading, disable cả hai nút khi đang chạy.

### 4. Web — luồng sau khi xác nhận

`apps/web/features/invoices/components/invoices-toolbar.tsx`

`handleGenerate` hiện chạy thẳng. Đổi thành: nút mở `GenerateInvoicesDialog`;
callback `onConfirm` mới chạy `generateInvoices(month, year)`.

Sau khi có kết quả:

1. Đóng modal xác nhận.
2. Hiện toast kết quả (đã tạo N hoá đơn; N phòng đã có hoá đơn nên bỏ qua; N
   phòng chưa có chỉ số).
3. Nếu `missingReadings` không rỗng → mở `BulkReadingsDialog` với **chỉ những
   phòng đó**: `occupiedRooms.filter(r => missingIds.has(r.id))`. Hiện tại đang
   truyền toàn bộ `occupiedRooms`.
4. `router.refresh()`.

Nút "Cập nhật chỉ số điện nước" độc lập vẫn mở dialog với toàn bộ phòng đang
thuê như cũ.

### 5. Web — icon cảnh báo ở cột Tổng cộng

- `invoice-list.tsx`: trong ô "Tổng cộng", khi `invoice.meterReadingMissing` thì
  render icon `TriangleAlert` (lucide) cạnh số tiền, bọc trong `Tooltip` với nội
  dung *"Chưa cập nhật chỉ số điện nước tháng M/YYYY"*. Icon phải có nhãn cho
  screen reader (`sr-only` hoặc `aria-label`), không chỉ dựa vào màu.
- `invoice-grid.tsx`: cùng cách xử lý ở dòng "Tổng cộng" của card.
- `types.ts`: thêm `meterReadingMissing?: boolean` vào interface `Invoice`.

### 6. Web — toast không đè lên nhau

`apps/web/app/layout.tsx:61`

```diff
-<Toaster richColors position="top-center" />
+<Toaster richColors position="top-center" expand visibleToasts={6} />
```

Sonner mặc định `expand={false}` (gom toast thành chồng xếp chồng) và
`visibleToasts={3}`. `expand` tách rời từng toast; `visibleToasts={6}` đủ cho
trường hợp nhiều thông báo nhất (thành công + bỏ qua + thiếu chỉ số).

## Kiểm thử

- `apps/api`: cập nhật `invoices.service.spec.ts` — `create()` thành công khi
  không có `MeterReading` và cho tiêu thụ = 0; `generateForMonth()` tính phòng
  thiếu chỉ số vào `created` đồng thời liệt kê trong `missingReadings`;
  `findAll()` gắn đúng `meterReadingMissing`.
- Thủ công trên web: mở `/invoices`, bấm tạo hoá đơn ở tháng đã có sẵn vài hoá
  đơn → modal liệt kê đúng; xác nhận → dialog chỉ số chỉ hiện phòng thiếu; nhập
  xong → icon cảnh báo biến mất và số tiền cập nhật; kiểm tra 3 toast cùng hiện
  tách rời.

## Ngoài phạm vi

- Không đổi cách `BulkReadingsDialog` hiển thị "Chỉ số cũ" (đang lấy chỉ số mới
  nhất của phòng, không phải chỉ số kỳ liền trước).
- Không thêm RBAC cho các thao tác hoá đơn (đã ghi nhận ở việc tồn đọng khác).
