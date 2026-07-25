"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { FeeSetting } from "./types";

export interface FeeSettingFormState {
  error: string | null;
  success?: boolean;
}

const FEE_FIELDS = [
  "electricityUnitPrice",
  "waterUnitPrice",
  "internetFee",
  "elevatorFeePerPerson",
  "cleaningFeePerPerson",
  "motorbikeFeePerExtra",
  "freeMotorbikeCount",
  "otherFee",
] as const;

// Update one fee type's name + values. The form carries `id` (hidden) and
// `name`, plus the 8 fee fields.
export async function updateFeeSettings(
  _prev: FeeSettingFormState,
  formData: FormData,
): Promise<FeeSettingFormState> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };

  const id = Number(formData.get("id"));
  if (!id) return { error: "Thiếu loại phí" };

  const body: Record<string, number | string> = {};
  const name = String(formData.get("name") ?? "").trim();
  if (name) body.name = name;
  for (const field of FEE_FIELDS) {
    body[field] = Number(formData.get(field) ?? 0);
  }

  const res = await apiFetch<FeeSetting>(`/settings/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  return { error: null, success: true };
}

// Create a new fee type from a name (values default to the base fee set).
export async function createFeeType(
  _prev: FeeSettingFormState,
  formData: FormData,
): Promise<FeeSettingFormState> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Vui lòng nhập tên loại phí" };

  const res = await apiFetch<FeeSetting>("/settings", {
    method: "POST",
    token,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  return { error: null, success: true };
}

export async function deleteFeeType(id: number): Promise<FeeSettingFormState> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };

  const res = await apiFetch<{ message: string }>(`/settings/${id}`, {
    method: "DELETE",
    token,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  return { error: null, success: true };
}

export async function setDefaultFeeType(
  id: number,
): Promise<FeeSettingFormState> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };

  const res = await apiFetch<FeeSetting>(`/settings/${id}/default`, {
    method: "PATCH",
    token,
    body: JSON.stringify({}),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  return { error: null, success: true };
}
