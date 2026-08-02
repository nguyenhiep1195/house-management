import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { RoomsTable } from "@/features/rooms/components/rooms-table";
import type { Room, RoomPeriodReading } from "@/features/rooms/types";
import type { FeeSetting } from "@/features/settings/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Phòng thuê" };

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  // The readings dialog always targets the current period here. Resolved on
  // the server so it does not depend on the visitor's clock.
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const token = await getSessionToken();
  const [res, feeRes, readingsRes] = await Promise.all([
    apiFetch<Room[]>("/rooms", { token: token ?? undefined }),
    apiFetch<FeeSetting[]>("/settings", { token: token ?? undefined }),
    apiFetch<RoomPeriodReading[]>(
      `/rooms/meter-readings?year=${year}&month=${month}`,
      { token: token ?? undefined },
    ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Phòng thuê"
        description="Quản lý phòng, giá thuê và chỉ số điện nước"
      />
      <RoomsTable
        rooms={res.data ?? []}
        feeSettings={feeRes.data ?? []}
        readings={readingsRes.data ?? []}
        year={year}
        month={month}
      />
    </div>
  );
}
