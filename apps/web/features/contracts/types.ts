export type ContractStatus = "ACTIVE" | "EXPIRED" | "TERMINATED";

export const CONTRACT_STATUS_LABEL: Record<
  ContractStatus,
  { label: string; variant: "default" | "outline" | "secondary" }
> = {
  ACTIVE: { label: "Đang hiệu lực", variant: "default" },
  EXPIRED: { label: "Hết hạn", variant: "outline" },
  TERMINATED: { label: "Đã chấm dứt", variant: "secondary" },
};

export interface Contract {
  id: number;
  roomId: number;
  room: { id: number; name: string };
  price: number;
  deposit: number;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  note: string | null;
  createdAt: string;
}

export interface ContractRoomOption {
  id: number;
  name: string;
  price: number;
}
