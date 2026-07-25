import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { DashboardCharts } from "@/features/dashboard/components/dashboard-charts";
import { DashboardStatCards } from "@/features/dashboard/components/dashboard-stat-cards";
import { PeriodSelector } from "@/features/dashboard/components/period-selector";
import type { DashboardStats } from "@/features/dashboard/types";
import { apiFetch } from "@/lib/api";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");
  const token = await getSessionToken();

  const now = new Date();
  const sp = await searchParams;
  const parsedYear = Number(sp.year);
  const parsedMonth = Number(sp.month);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 9999
      ? parsedYear
      : now.getFullYear();
  const month =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;

  const res = await apiFetch<DashboardStats>(
    `/dashboard/stats?year=${year}&month=${month}`,
    { token: token ?? undefined },
  );
  const stats = res.data;

  const currentYear = now.getFullYear();
  const yearSet = new Set<number>();
  for (let y = currentYear - 3; y <= currentYear; y++) yearSet.add(y);
  yearSet.add(year);
  const years = Array.from(yearSet).sort((a, b) => b - a);

  return (
    <>
      <PageHeader
        title="Trang chủ"
        description="Tổng quan tình hình vận hành toà nhà"
      >
        <PeriodSelector year={year} month={month} years={years} />
      </PageHeader>
      {stats ? (
        <>
          <DashboardStatCards stats={stats} />
          <DashboardCharts stats={stats} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Không tải được số liệu thống kê. Vui lòng thử lại.
        </p>
      )}
    </>
  );
}
