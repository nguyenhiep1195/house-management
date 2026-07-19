import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { RoomsTable } from "@/features/rooms/components/rooms-table";
import type { Room } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Phòng trọ" };

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const res = await apiFetch<Room[]>("/rooms", { token: token ?? undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Phòng trọ"
        description="Quản lý phòng, giá thuê và chỉ số điện nước"
      />
      <RoomsTable rooms={res.data ?? []} />
    </div>
  );
}
