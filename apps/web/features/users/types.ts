export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER";
  isActive: boolean;
  createdAt: string;
}
