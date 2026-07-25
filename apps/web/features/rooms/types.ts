import type { Invoice } from "@/features/invoices/types";
import type { Tenant } from "@/features/tenants/types";

export type RoomStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";

export const ROOM_STATUS_LABEL: Record<
  RoomStatus,
  { label: string; variant: "outline" | "default" | "secondary" }
> = {
  AVAILABLE: { label: "Trống", variant: "outline" },
  OCCUPIED: { label: "Đang thuê", variant: "default" },
  MAINTENANCE: { label: "Bảo trì", variant: "secondary" },
};

export interface Room {
  id: number;
  name: string;
  price: number;
  status: RoomStatus;
  occupantCount: number;
  motorbikeCount: number;
  internetEnabled: boolean;
  feeSettingId: number | null;
  initialElectricityReading: number;
  initialWaterReading: number;
  electricityReading: number;
  waterReading: number;
  createdAt: string;
  _count?: { tenants: number };
}

export interface MeterReadingItem {
  roomId: number;
  electricityReading: number;
  waterReading: number;
}

export interface RoomContract {
  id: number;
  price: number;
  deposit: number;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "EXPIRED" | "TERMINATED";
  note: string | null;
}

export interface RoomDetail extends Room {
  tenants: Tenant[];
  contracts: RoomContract[];
  invoices: Invoice[];
}
