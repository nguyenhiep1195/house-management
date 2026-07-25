"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { Contract } from "./types";

export interface ContractFormState {
  error: string | null;
  success?: boolean;
}

function revalidateContractPages() {
  revalidatePath("/contracts");
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

export async function createContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const note = String(formData.get("note") ?? "").trim();
  const res = await authedFetch<Contract>("/contracts", {
    method: "POST",
    body: JSON.stringify({
      roomId: Number(formData.get("roomId")),
      price: Number(formData.get("price") ?? 0),
      deposit: Number(formData.get("deposit") ?? 0),
      initialElectricityReading: Number(
        formData.get("initialElectricityReading") ?? 0,
      ),
      initialWaterReading: Number(formData.get("initialWaterReading") ?? 0),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      ...(note ? { note } : {}),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidateContractPages();
  return { error: null, success: true };
}

export async function updateContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();
  const res = await authedFetch<Contract>(`/contracts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      price: Number(formData.get("price") ?? 0),
      deposit: Number(formData.get("deposit") ?? 0),
      initialElectricityReading: Number(
        formData.get("initialElectricityReading") ?? 0,
      ),
      initialWaterReading: Number(formData.get("initialWaterReading") ?? 0),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      status: String(formData.get("status") ?? "ACTIVE"),
      note: note || undefined,
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidateContractPages();
  return { error: null, success: true };
}

export async function deleteContract(id: number): Promise<ContractFormState> {
  const res = await authedFetch<{ message: string }>(`/contracts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidateContractPages();
  return { error: null, success: true };
}
