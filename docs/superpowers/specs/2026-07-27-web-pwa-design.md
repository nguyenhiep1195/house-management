# Thiết kế: PWA cho `apps/web`

- Ngày: 2026-07-27
- Phạm vi: `apps/web` (Next.js 16.2, App Router, RSC)
- Mục tiêu: Web app cài đặt được lên màn hình chính trên mobile (PWA), có
  offline shell nhẹ, và rà soát nhanh responsive các trang bảng.

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Mức độ PWA | Installable + offline shell (không offline dữ liệu) |
| Thư viện | Serwist (`@serwist/next` + `serwist`) |
| Icon | Tạo icon tạm (chữ "HM" trên nền brand), thay logo thật sau |
| Responsive | Rà nhanh, chỉ sửa chỗ vỡ rõ (bảng tràn viewport) |
| Cache trang đăng nhập | KHÔNG cache HTML/RSC (tránh rò rỉ dữ liệu riêng tư) |
| Trạng thái offline | Thanh cảnh báo đỏ ở header khi mất mạng |

## 2. Ràng buộc kỹ thuật

Next.js 16 build mặc định bằng **Turbopack**, nhưng `@serwist/next` là webpack
plugin và Turbopack không hỗ trợ webpack plugin. Giải pháp chính thức hiện tại:
build bằng cờ `--webpack`.

- `dev`: giữ Turbopack (SW tắt ở dev qua `disable: NODE_ENV === "development"`).
- `build`: đổi thành `next build --webpack`.

Nguồn: LogRocket "Build a Next.js 16 PWA with Serwist", Next.js 16 upgrade guide.

## 3. Các thành phần

### 3.1 File thêm mới / sửa

| File | Vai trò |
|---|---|
| `next.config.ts` | Bọc `withSerwistInit` (swSrc/swDest, disable ở dev) |
| `app/sw.ts` | Service worker nguồn (Serwist), precache + `defaultCache` runtime |
| `app/manifest.ts` | Web app manifest (Next native) |
| `app/~offline/page.tsx` | Trang fallback khi điều hướng offline & chưa cache |
| `public/icons/icon-192.png` | Icon 192×192 |
| `public/icons/icon-512.png` | Icon 512×512 (any) |
| `public/icons/maskable-512.png` | Icon 512×512 (maskable) |
| `public/icons/apple-touch-icon.png` | Icon 180×180 cho iOS |
| `app/layout.tsx` | Thêm `viewport` (themeColor) + `appleWebApp` metadata |
| `components/shared/offline-indicator.tsx` | Client component: thanh đỏ khi offline |
| `components/layout/site-header.tsx` | Nhúng `OfflineIndicator` |
| `package.json` | Đổi build script sang `--webpack`; thêm deps |
| `.gitignore` | Bỏ qua `public/sw.js` và `public/swe-worker-*.js` (sinh khi build) |

### 3.2 Dependencies

```
pnpm add @serwist/next serwist
```

(Chỉ cần cho offline shell — KHÔNG cần `idb`/`@serwist/precaching` vì không
làm offline dữ liệu.)

## 4. Chi tiết triển khai

### 4.1 `next.config.ts`

```ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
```

`@serwist/next` mặc định `register: true` → tự chèn script đăng ký SW, không cần
component đăng ký thủ công.

### 4.2 `app/sw.ts`

```ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST, // chỉ tài sản build tĩnh
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
```

Bảo mật: `__SW_MANIFEST` chỉ chứa tài sản tĩnh do build sinh (JS/CSS/font từ
`_next/static`), KHÔNG chứa HTML trang đăng nhập. `defaultCache` xử lý runtime
cho static assets; điều hướng offline chưa cache → rơi vào fallback `/~offline`.

### 4.3 `app/manifest.ts`

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "House Management",
    short_name: "House Mgmt",
    description: "Hệ thống quản trị nhà ở",
    lang: "vi",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a", // khớp brand, xác nhận lại khi làm
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

### 4.4 `app/~offline/page.tsx`

Trang tĩnh đơn giản (server component thường): tiêu đề "Bạn đang offline",
mô tả ngắn, nút "Thử lại". Tiếng Việt.

### 4.5 `components/shared/offline-indicator.tsx`

Client component (`"use client"`):
- State `isOffline`, khởi tạo từ `navigator.onLine`.
- Lắng nghe `window` events `online` / `offline`, cập nhật state; cleanup khi unmount.
- Khi offline: render một thanh đỏ mảnh (nền `bg-destructive`, chữ trắng, nhỏ),
  ví dụ: "Mất kết nối mạng — một số chức năng có thể không hoạt động".
- Khi online: render `null`.

Nhúng ở đầu `site-header.tsx` (ngay trong header, trên hàng nav) để luôn thấy.

### 4.6 `app/layout.tsx`

- Thêm export `viewport: Viewport` với `themeColor` (khớp `theme_color`).
- Bổ sung `metadata.appleWebApp = { capable: true, statusBarStyle: "default", title: "House Mgmt" }`
  và `metadata.manifest = "/manifest.webmanifest"` (Next tự phục vụ từ `app/manifest.ts`).

### 4.7 Icon tạm

Tạo bằng script Node nhỏ hoặc SVG→PNG: nền brand (#0f172a), chữ "HM" trắng
căn giữa. Sinh 192, 512, maskable-512 (thêm padding an toàn ~10%), apple-touch
180. Lưu vào `public/icons/`.

## 5. Responsive — rà soát nhanh

Shell đã responsive (shadcn `sidebar` + Sheet mobile, padding `p-4 sm:p-6`).
Rà nhanh các trang bảng: `contracts`, `invoices`, `rooms`, `tenants`, `users`.
Chỉ can thiệp khi bảng tràn ngang trên viewport ~375px: bọc bảng trong
`<div className="overflow-x-auto">` (hoặc dùng wrapper sẵn có nếu đã có).
KHÔNG refactor bảng thành card, KHÔNG đổi cấu trúc trang.

## 6. Kiểm thử / nghiệm thu

1. `pnpm build` chạy được với `--webpack`, sinh `public/sw.js` không lỗi.
2. `pnpm start`, mở DevTools → Application:
   - Manifest hợp lệ, đủ icon, "installable".
   - Service worker `activated`.
3. Lighthouse (mobile) mục PWA: Installable = pass.
4. Ngắt mạng (DevTools Offline) → điều hướng tới route chưa cache hiện `/~offline`.
5. Ngắt mạng khi đang mở app → thanh đỏ offline xuất hiện ở header; nối lại mạng → thanh biến mất.
6. Không có HTML trang đăng nhập/nội dung riêng tư nằm trong Cache Storage.
7. Kiểm 5 trang bảng ở 375px: không tràn ngang gây vỡ layout.

## 7. Ngoài phạm vi (YAGNI)

- Offline dữ liệu (IndexedDB, sync queue).
- Push notification.
- Refactor bảng → card cho mobile (tách việc riêng nếu cần).
- Đồng bộ nền (Background Sync).
