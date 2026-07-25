import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { ReadingHistoryTable } from "@/features/rooms/components/reading-history-table";
import { RoomInvoicesSection } from "@/features/rooms/components/room-invoices-section";
import type { MeterReadingHistoryRow } from "@/features/rooms/reading-history-types";
import { ROOM_STATUS_LABEL, type RoomDetail } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Chi tiết phòng" };

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Đang hiệu lực",
  EXPIRED: "Hết hạn",
  TERMINATED: "Đã chấm dứt",
};

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const { id } = await params;
  const token = await getSessionToken();
  const res = await apiFetch<RoomDetail>(`/rooms/${id}`, {
    token: token ?? undefined,
  });
  if (!res.data) notFound();
  const room = res.data;

  const historyRes = await apiFetch<MeterReadingHistoryRow[]>(
    `/rooms/${id}/meter-readings/history`,
    { token: token ?? undefined },
  );
  const readingHistory = historyRes.data ?? [];

  const status = ROOM_STATUS_LABEL[room.status];
  const activeContract = room.contracts.find((c) => c.status === "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Phòng ${room.name}`}
        description="Thông tin phòng, người thuê, hợp đồng và hoá đơn"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Thông tin phòng
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Giá thuê</p>
            {activeContract ? (
              <p className="font-medium tabular-nums">
                <Link
                  href={`/contracts?roomId=${room.id}`}
                  className="hover:underline"
                  title="Sửa giá thuê trong hợp đồng"
                >
                  {formatCurrency(activeContract.price)}/tháng
                </Link>
              </p>
            ) : (
              <p className="font-medium">
                <Link
                  href={`/contracts?roomId=${room.id}`}
                  className="text-muted-foreground hover:underline"
                >
                  Chưa có hợp đồng
                </Link>
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Số người</p>
            <p className="font-medium tabular-nums">{room.occupantCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Số xe máy</p>
            <p className="font-medium tabular-nums">{room.motorbikeCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Internet</p>
            <p className="font-medium">
              {room.internetEnabled ? "Có sử dụng" : "Không sử dụng"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Chỉ số điện hiện tại</p>
            <p className="font-medium tabular-nums">
              {room.electricityReading} kWh
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Chỉ số nước hiện tại</p>
            <p className="font-medium tabular-nums">{room.waterReading} m³</p>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Người thuê</h2>
        {room.tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có người thuê nào. Gán người thuê tại trang Người thuê.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Số CCCD</TableHead>
                  <TableHead>Ngày sinh</TableHead>
                  <TableHead>Quê quán</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      {tenant.fullName}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {tenant.idCardNumber}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(tenant.dateOfBirth)}
                    </TableCell>
                    <TableCell>{tenant.hometown}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Hợp đồng</h2>
        {room.contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có hợp đồng nào. Tạo hợp đồng tại trang Hợp đồng.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Giá thuê</TableHead>
                  <TableHead>Tiền cọc</TableHead>
                  <TableHead>Từ ngày</TableHead>
                  <TableHead>Đến ngày</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.price)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.deposit)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.startDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          contract.status === "ACTIVE" ? "default" : "outline"
                        }
                      >
                        {CONTRACT_STATUS_LABEL[contract.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Lịch sử chỉnh sửa chỉ số</h2>
        <ReadingHistoryTable rows={readingHistory} />
      </section>

      <RoomInvoicesSection
        roomId={room.id}
        roomName={room.name}
        invoices={room.invoices}
      />
    </div>
  );
}
