import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import { InvoicesToolbar } from "@/features/invoices/components/invoices-toolbar";
import type { Invoice } from "@/features/invoices/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Hoá đơn" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month) || now.getMonth() + 1;
  const year = Number(params.year) || now.getFullYear();

  const token = await getSessionToken();
  const res = await apiFetch<Invoice[]>(
    `/invoices?month=${month}&year=${year}`,
    { token: token ?? undefined },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hoá đơn"
        description="Hoá đơn hàng tháng của các phòng — tự động sinh vào ngày cuối tháng"
      />
      <InvoicesToolbar month={month} year={year} />
      <InvoiceList invoices={res.data ?? []} showRoom />
    </div>
  );
}
