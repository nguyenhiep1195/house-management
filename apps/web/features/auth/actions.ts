"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-constants";

export interface AuthFormState {
  error: string | null;
  success?: boolean;
}

interface LoginResponse {
  accessToken: string;
  user: {
    id: number;
    username: string;
    email: string | null;
    name: string;
    role: string;
  };
}

function safeNextPath(raw: FormDataEntryValue | null): string {
  const next = String(raw ?? "/");
  // only allow same-origin absolute paths — prevents open redirects
  // also reject /\ prefix: browsers normalise backslash → slash, yielding //evil.com
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const res = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
    }),
  });
  if (!res.ok || !res.data) {
    return { error: res.error ?? "Đăng nhập thất bại, vui lòng thử lại" };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, res.data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(safeNextPath(formData.get("next")));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function forgotPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const res = await apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
  });
  if (!res.ok) {
    return { error: res.error ?? "Đã có lỗi xảy ra, vui lòng thử lại" };
  }
  return { error: null, success: true };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) {
    return { error: "Mật khẩu nhập lại không khớp" };
  }
  const res = await apiFetch<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token: String(formData.get("token") ?? ""),
      newPassword: password,
    }),
  });
  if (!res.ok) {
    return { error: res.error ?? "Đã có lỗi xảy ra, vui lòng thử lại" };
  }
  return { error: null, success: true };
}
