export interface ManagedUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER";
  isActive: boolean;
  createdAt: string;
}
