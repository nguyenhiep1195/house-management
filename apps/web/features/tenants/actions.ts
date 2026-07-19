"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { Tenant } from "./types";

export interface TenantFormState {
  error: string | null;
  success?: boolean;
}

function revalidateTenantPages() {
  revalidatePath("/tenants");
  revalidatePath("/rooms");
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

function tenantBody(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  return {
    fullName: String(formData.get("fullName") ?? ""),
    idCardNumber: String(formData.get("idCardNumber") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    hometown: String(formData.get("hometown") ?? ""),
    ...(roomId ? { roomId: Number(roomId) } : {}),
  };
}

export async function createTenant(
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const res = await authedFetch<Tenant>("/tenants", {
    method: "POST",
    body: JSON.stringify(tenantBody(formData)),
  });
  if (!res.ok) return { error: res.error };
  revalidateTenantPages();
  return { error: null, success: true };
}

export async function updateTenant(
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const id = Number(formData.get("id"));
  const roomId = String(formData.get("roomId") ?? "");
  const body = {
    ...tenantBody(formData),
    // dropdown gửi "" khi bỏ chọn phòng -> null để rời phòng
    roomId: roomId ? Number(roomId) : null,
  };
  const res = await authedFetch<Tenant>(`/tenants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: res.error };
  revalidateTenantPages();
  return { error: null, success: true };
}

export async function deleteTenant(id: number): Promise<TenantFormState> {
  const res = await authedFetch<{ message: string }>(`/tenants/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidateTenantPages();
  return { error: null, success: true };
}
