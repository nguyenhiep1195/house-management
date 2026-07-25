export interface SessionUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER";
}
