import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { RoomsTable } from "@/features/rooms/components/rooms-table";
import type { Room } from "@/features/rooms/types";
import type { FeeSetting } from "@/features/settings/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Phòng thuê" };

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const [res, feeRes] = await Promise.all([
    apiFetch<Room[]>("/rooms", { token: token ?? undefined }),
    apiFetch<FeeSetting[]>("/settings", { token: token ?? undefined }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Phòng thuê"
        description="Quản lý phòng, giá thuê và chỉ số điện nước"
      />
      <RoomsTable rooms={res.data ?? []} feeSettings={feeRes.data ?? []} />
    </div>
  );
}
