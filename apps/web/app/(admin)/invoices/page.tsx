import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { InvoiceGrid } from "@/features/invoices/components/invoice-grid";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import { InvoiceViewToggle } from "@/features/invoices/components/invoice-view-toggle";
import { InvoicesToolbar } from "@/features/invoices/components/invoices-toolbar";
import type { Invoice } from "@/features/invoices/types";
import type { Room, RoomPeriodReading } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Hoá đơn" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month) || now.getMonth() + 1;
  const year = Number(params.year) || now.getFullYear();
  const view = params.view === "grid" ? "grid" : "list";

  const token = await getSessionToken();
  const res = await apiFetch<Invoice[]>(
    `/invoices?month=${month}&year=${year}`,
    { token: token ?? undefined },
  );
  const invoices = res.data ?? [];

  const roomsRes = await apiFetch<Room[]>("/rooms", {
    token: token ?? undefined,
  });
  const rooms = roomsRes.data ?? [];

  const readingsRes = await apiFetch<RoomPeriodReading[]>(
    `/rooms/meter-readings?year=${year}&month=${month}`,
    { token: token ?? undefined },
  );
  const readings = readingsRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hoá đơn"
        description="Hoá đơn hàng tháng của các phòng — tự động sinh vào ngày cuối tháng"
      />
      <InvoicesToolbar
        month={month}
        year={year}
        rooms={rooms}
        readings={readings}
        invoices={invoices}
      />
      <div className="flex justify-end">
        <InvoiceViewToggle view={view} month={month} year={year} />
      </div>
      {view === "grid" ? (
        <InvoiceGrid invoices={invoices} />
      ) : (
        <InvoiceList invoices={invoices} showRoom />
      )}
    </div>
  );
}
