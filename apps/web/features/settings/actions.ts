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

export async function updateFeeSettings(
  _prev: FeeSettingFormState,
  formData: FormData,
): Promise<FeeSettingFormState> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };

  const body: Record<string, number> = {};
  for (const field of FEE_FIELDS) {
    body[field] = Number(formData.get(field) ?? 0);
  }

  const res = await apiFetch<FeeSetting>("/settings", {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  return { error: null, success: true };
}
