import { PageHeader } from "@/components/shared/page-header";
import { RecentActivities } from "@/features/dashboard/components/recent-activities";
import { StatsCards } from "@/features/dashboard/components/stats-cards";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Trang chủ"
        description="Tổng quan tình hình vận hành toà nhà"
      />
      <StatsCards />
      <RecentActivities />
    </>
  );
}
