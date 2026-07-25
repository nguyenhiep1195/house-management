"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardStats } from "@/features/dashboard/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const roomConfig = {
  occupied: { label: "Đang thuê", color: "var(--chart-5)" },
  available: { label: "Trống", color: "var(--chart-3)" },
  maintenance: { label: "Bảo trì", color: "var(--chart-1)" },
} satisfies ChartConfig;

const invoiceConfig = {
  paid: { label: "Đã thanh toán", color: "var(--chart-5)" },
  unpaid: { label: "Chưa thanh toán", color: "var(--chart-2)" },
} satisfies ChartConfig;

const utilityConfig = {
  electricity: { label: "Điện (kWh)", color: "var(--chart-5)" },
  water: { label: "Nước (m³)", color: "var(--chart-2)" },
} satisfies ChartConfig;

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function DashboardCharts({ stats }: { stats: DashboardStats }) {
  const { rooms, invoices, trend } = stats;

  const roomData = [
    { status: "occupied", value: rooms.occupied, fill: "var(--color-occupied)" },
    { status: "available", value: rooms.available, fill: "var(--color-available)" },
    {
      status: "maintenance",
      value: rooms.maintenance,
      fill: "var(--color-maintenance)",
    },
  ];

  const invoiceData = [
    { status: "paid", value: invoices.paid, fill: "var(--color-paid)" },
    { status: "unpaid", value: invoices.unpaid, fill: "var(--color-unpaid)" },
  ];

  const trendData = trend.map((t) => ({
    label: `T${t.month}`,
    electricity: t.electricityConsumption,
    water: t.waterConsumption,
  }));

  const hasTrend = trendData.some((t) => t.electricity > 0 || t.water > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Cơ cấu phòng</CardTitle>
          <CardDescription>
            Tổng {rooms.total.toLocaleString("vi-VN")} phòng theo trạng thái
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rooms.total === 0 ? (
            <EmptyState message="Chưa có phòng nào." />
          ) : (
            <ChartContainer
              config={roomConfig}
              className="mx-auto aspect-square max-h-[250px]"
            >
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent nameKey="status" hideLabel />}
                />
                <Pie
                  data={roomData}
                  dataKey="value"
                  nameKey="status"
                  innerRadius={55}
                  strokeWidth={2}
                />
                <ChartLegend content={<ChartLegendContent nameKey="status" />} />
              </PieChart>
            </ChartContainer>
          )}
          <p className="sr-only">
            {rooms.occupied} phòng đang thuê, {rooms.available} phòng trống,{" "}
            {rooms.maintenance} phòng bảo trì.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trạng thái thanh toán hoá đơn</CardTitle>
          <CardDescription>
            Kỳ {stats.period.month}/{stats.period.year} ·{" "}
            {invoices.total.toLocaleString("vi-VN")} hoá đơn
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.total === 0 ? (
            <EmptyState message="Chưa có hoá đơn trong kỳ này." />
          ) : (
            <ChartContainer
              config={invoiceConfig}
              className="mx-auto aspect-square max-h-[250px]"
            >
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent nameKey="status" hideLabel />}
                />
                <Pie
                  data={invoiceData}
                  dataKey="value"
                  nameKey="status"
                  innerRadius={55}
                  strokeWidth={2}
                />
                <ChartLegend content={<ChartLegendContent nameKey="status" />} />
              </PieChart>
            </ChartContainer>
          )}
          <p className="sr-only">
            {invoices.paid} hoá đơn đã thanh toán, {invoices.unpaid} hoá đơn chưa
            thanh toán.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Tiêu thụ điện &amp; nước 6 tháng</CardTitle>
          <CardDescription>Chỉ số điện (kWh) và nước (m³) theo tháng</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasTrend ? (
            <EmptyState message="Chưa có dữ liệu tiêu thụ." />
          ) : (
            <ChartContainer
              config={utilityConfig}
              className="aspect-auto h-[250px] w-full"
            >
              <LineChart data={trendData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis yAxisId="left" hide />
                <YAxis yAxisId="right" orientation="right" hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  yAxisId="left"
                  dataKey="electricity"
                  stroke="var(--color-electricity)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  dataKey="water"
                  stroke="var(--color-water)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
