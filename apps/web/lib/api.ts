import "server-only";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: string | string[] }).message;
    return Array.isArray(message) ? message.join(", ") : message;
  }
  return "Đã có lỗi xảy ra, vui lòng thử lại";
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<ApiResult<T>> {
  const { token, ...rest } = init;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });
    const body: unknown = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (body as T) : null,
      error: res.ok ? null : extractErrorMessage(body),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Không thể kết nối đến máy chủ",
    };
  }
}
