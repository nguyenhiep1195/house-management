"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { MeterReadingItem, Room } from "./types";

export interface RoomFormState {
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

export async function createRoom(
  _prev: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const res = await authedFetch<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? ""),
      price: Number(formData.get("price") ?? 0),
      occupantCount: Number(formData.get("occupantCount") ?? 0),
      motorbikeCount: Number(formData.get("motorbikeCount") ?? 0),
      internetEnabled: formData.get("internetEnabled") === "on",
      initialElectricityReading: Number(
        formData.get("initialElectricityReading") ?? 0,
      ),
      initialWaterReading: Number(formData.get("initialWaterReading") ?? 0),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  return { error: null, success: true };
}

export async function updateRoom(
  _prev: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const id = Number(formData.get("id"));
  const res = await authedFetch<Room>(`/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: String(formData.get("name") ?? ""),
      price: Number(formData.get("price") ?? 0),
      status: String(formData.get("status") ?? "AVAILABLE"),
      occupantCount: Number(formData.get("occupantCount") ?? 0),
      motorbikeCount: Number(formData.get("motorbikeCount") ?? 0),
      internetEnabled: formData.get("internetEnabled") === "on",
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${id}`);
  return { error: null, success: true };
}

export async function deleteRoom(id: number): Promise<RoomFormState> {
  const res = await authedFetch<{ message: string }>(`/rooms/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  return { error: null, success: true };
}

export async function bulkUpdateReadings(
  items: MeterReadingItem[],
): Promise<RoomFormState> {
  const res = await authedFetch<{ message: string; updated: number }>(
    "/rooms/meter-readings",
    { method: "PATCH", body: JSON.stringify({ items }) },
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/rooms");
  return { error: null, success: true };
}
