import { History } from "lucide-react";

import type { FeeSettingHistory } from "@/features/settings/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FeeHistoryTable({ history }: { history: FeeSettingHistory[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử cài đặt phí</CardTitle>
        <CardDescription>
          Mỗi lần lưu tạo một bản ghi. Phí mới chỉ áp dụng cho hoá đơn tạo sau
          đó — hoá đơn đã tạo không bị ảnh hưởng.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
            <History className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Chưa có thay đổi nào được ghi lại.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người thay đổi</TableHead>
                  <TableHead className="text-right">Điện</TableHead>
                  <TableHead className="text-right">Nước</TableHead>
                  <TableHead className="text-right">Internet</TableHead>
                  <TableHead className="text-right">Thang máy</TableHead>
                  <TableHead className="text-right">Vệ sinh</TableHead>
                  <TableHead className="text-right">Xe vượt</TableHead>
                  <TableHead className="text-right">Xe miễn phí</TableHead>
                  <TableHead className="text-right">Khác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDateTime(row.changedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.changedByName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.electricityUnitPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.waterUnitPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.internetFee)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.elevatorFeePerPerson)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.cleaningFeePerPerson)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.motorbikeFeePerExtra)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.freeMotorbikeCount} xe
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.otherFee)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
