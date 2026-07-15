"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/features/auth/session";
import type { ManagedUser } from "./types";

export interface UserFormState {
  error: string | null;
  success?: boolean;
}

async function authedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; error: string | null }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<T>(path, { ...init, token });
  return { ok: res.ok, error: res.error };
}

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const res = await authedFetch<ManagedUser>("/users", {
    method: "POST",
    body: JSON.stringify({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      ...(phone ? { phone } : {}),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}

export async function updateUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const res = await authedFetch<ManagedUser>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      phone: phone || undefined,
      ...(password ? { password } : {}),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}

export async function toggleUserActive(
  id: number,
  isActive: boolean,
): Promise<UserFormState> {
  const res = await authedFetch<ManagedUser>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}

export async function deleteUser(id: number): Promise<UserFormState> {
  const res = await authedFetch<{ message: string }>(`/users/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}
