import "server-only";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER";
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const res = await apiFetch<SessionUser>("/auth/me", { token });
  return res.data;
}
