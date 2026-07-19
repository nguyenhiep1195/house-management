import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { TenantsTable } from "@/features/tenants/components/tenants-table";
import type { RoomOption, Tenant } from "@/features/tenants/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Người thuê" };

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const [tenantsRes, roomsRes] = await Promise.all([
    apiFetch<Tenant[]>("/tenants", { token: token ?? undefined }),
    apiFetch<RoomOption[]>("/rooms", { token: token ?? undefined }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Người thuê"
        description="Quản lý người thuê và phòng đang ở"
      />
      <TenantsTable
        tenants={tenantsRes.data ?? []}
        rooms={(roomsRes.data ?? []).map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
