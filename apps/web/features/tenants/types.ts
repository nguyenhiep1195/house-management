export interface Tenant {
  id: number;
  fullName: string;
  idCardNumber: string;
  dateOfBirth: string;
  hometown: string;
  roomId: number | null;
  room: { id: number; name: string } | null;
  createdAt: string;
}

export interface RoomOption {
  id: number;
  name: string;
}
