import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { ContractsTable } from "@/features/contracts/components/contracts-table";
import type { Contract, ContractRoomOption } from "@/features/contracts/types";
import type { Room } from "@/features/rooms/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");

  const token = await getSessionToken();
  const [contractsRes, roomsRes] = await Promise.all([
    apiFetch<Contract[]>("/contracts", { token: token ?? undefined }),
    apiFetch<Room[]>("/rooms", { token: token ?? undefined }),
  ]);

  const rooms: ContractRoomOption[] = (roomsRes.data ?? []).map(
    ({ id, name, price }) => ({ id, name, price }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hợp đồng"
        description="Quản lý hợp đồng thuê phòng và thời hạn"
      />
      <ContractsTable contracts={contractsRes.data ?? []} rooms={rooms} />
    </div>
  );
}
