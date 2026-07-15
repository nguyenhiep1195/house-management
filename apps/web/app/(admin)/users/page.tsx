import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { UsersTable } from "@/features/users/components/users-table";
import type { ManagedUser } from "@/features/users/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Người dùng" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");
  // hiding the menu is not the security boundary — enforce role here too
  if (user.role !== "ADMIN") redirect("/");

  const token = await getSessionToken();
  const res = await apiFetch<ManagedUser[]>("/users", { token: token ?? undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Người dùng"
        description="Quản lý các tài khoản quản lý trong hệ thống"
      />
      <UsersTable users={res.data ?? []} />
    </div>
  );
}
