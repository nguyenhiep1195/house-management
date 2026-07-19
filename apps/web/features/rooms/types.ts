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
