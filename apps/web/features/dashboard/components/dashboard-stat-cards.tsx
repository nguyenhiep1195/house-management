import {
  Bike,
  CircleDollarSign,
  DoorOpen,
  Droplets,
  Users,
  Zap,
} from "lucide-react";

import type { DashboardStats } from "@/features/dashboard/types";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardStatCards({ stats }: { stats: DashboardStats }) {
  const { rooms, occupants, motorbikes, utilities, invoices } = stats;

  const cards = [
    {
      title: "Số phòng",
      value: rooms.total.toLocaleString("vi-VN"),
      hint: `${rooms.occupied} đang thuê · ${rooms.available} trống · ${rooms.maintenance} bảo trì`,
      icon: DoorOpen,
    },
    {
      title: "Số người",
      value: occupants.toLocaleString("vi-VN"),
      hint: "Tổng số người đang ở",
      icon: Users,
    },
    {
      title: "Số xe",
      value: motorbikes.toLocaleString("vi-VN"),
      hint: "Tổng số xe máy",
      icon: Bike,
    },
    {
      title: "Doanh thu (kỳ)",
      value: formatCurrency(invoices.revenue),
      hint: `${invoices.paid}/${invoices.total} hoá đơn đã thanh toán`,
      icon: CircleDollarSign,
    },
    {
      title: "Điện tiêu thụ (kỳ)",
      value: `${utilities.electricityConsumption.toLocaleString("vi-VN")} kWh`,
      hint: "Tổng chỉ số điện trong kỳ",
      icon: Zap,
    },
    {
      title: "Nước tiêu thụ (kỳ)",
      value: `${utilities.waterConsumption.toLocaleString("vi-VN")} m³`,
      hint: "Tổng chỉ số nước trong kỳ",
      icon: Droplets,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
