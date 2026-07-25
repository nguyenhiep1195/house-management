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
