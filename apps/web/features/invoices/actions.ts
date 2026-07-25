"use server";

import { revalidatePath } from "next/cache";
import { getSessionToken } from "@/features/auth/session";
import { apiFetch } from "@/lib/api";
import type { Invoice, PaymentMethod } from "./types";

export interface InvoiceActionState {
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

function revalidateInvoicePages(roomId?: number) {
  revalidatePath("/invoices");
  if (roomId) revalidatePath(`/rooms/${roomId}`);
}

export async function createInvoice(
  roomId: number,
  month: number,
  year: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({ roomId, month, year }),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export async function generateInvoices(
  month: number,
  year: number,
): Promise<
  InvoiceActionState & {
    created?: number;
    skipped?: number;
    skippedRooms?: { roomId: number; roomName: string }[];
    missingReadings?: { roomId: number; roomName: string }[];
  }
> {
  const token = await getSessionToken();
  if (!token) return { error: "Phiên đăng nhập đã hết hạn" };
  const res = await apiFetch<{
    created: number;
    skipped: number;
    skippedRooms: { roomId: number; roomName: string }[];
    missingReadings: { roomId: number; roomName: string }[];
  }>("/invoices/generate", {
    method: "POST",
    token,
    body: JSON.stringify({ month, year }),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages();
  return { error: null, success: true, ...res.data };
}

export async function payInvoice(
  id: number,
  paymentMethod: PaymentMethod,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>(`/invoices/${id}/pay`, {
    method: "PATCH",
    body: JSON.stringify({ paymentMethod }),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export async function unpayInvoice(
  id: number,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>(`/invoices/${id}/unpay`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export async function deleteInvoice(
  id: number,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<{ message: string }>(`/invoices/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}

export interface InvoiceEditable {
  roomPrice: number;
  electricityPrev: number;
  electricityCurrent: number;
  electricityUnitPrice: number;
  waterPrev: number;
  waterCurrent: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFee: number;
  cleaningFee: number;
  motorbikeFee: number;
  otherFee: number;
  occupantCount: number;
  motorbikeCount: number;
}

export async function updateInvoice(
  id: number,
  data: Partial<InvoiceEditable>,
  roomId?: number,
): Promise<InvoiceActionState> {
  const res = await authedFetch<Invoice>(`/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) return { error: res.error };
  revalidateInvoicePages(roomId);
  return { error: null, success: true };
}
