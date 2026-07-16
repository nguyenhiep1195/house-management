# House Management — Web (Admin)

Trang quản trị xây dựng với **Next.js 16 (App Router) + Tailwind CSS v4 + shadcn/ui**, responsive cho cả mobile và desktop.

## Chạy dự án

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # build production
pnpm lint     # ESLint
```

## Cấu trúc thư mục (feature-based)

```
app/                      # Chỉ chứa route (mỏng) — logic nằm trong features/
  (auth)/                 # Nhóm route xác thực (layout căn giữa)
    login/                # /login
    forgot-password/      # /forgot-password
  (admin)/                # Nhóm route quản trị (layout sidebar + header)
    page.tsx              # / — trang chủ (dashboard)
    settings/             # /settings
    buildings|residents|maintenance/   # placeholder

features/                 # Mỗi tính năng một thư mục, tự chứa component/data của nó
  auth/components/        # LoginForm, ForgotPasswordForm
  dashboard/              # StatsCards, RecentActivities + data mẫu
  settings/components/    # AppearanceSettings, ProfileSettings

components/
  ui/                     # shadcn/ui (generated) — KHÔNG sửa tay, thêm bằng CLI
  layout/                 # AppSidebar, SiteHeader
  shared/                 # Component dùng chung: PageHeader, ModeToggle, PlaceholderPage
  providers/              # ThemeProvider, ThemeScript

lib/
  theme.ts                # Types + hằng số + apply/load/save theme (localStorage)
  navigation.ts           # Cấu hình menu sidebar (thêm mục mới ở đây)
  utils.ts                # cn()

hooks/                    # Hooks dùng chung (use-mobile, …)
```

**Quy ước:** trang mới = route mỏng trong `app/` + component trong `features/<tên-feature>/`. Component tái sử dụng giữa nhiều feature thì đặt ở `components/shared/`.

## Hệ thống theme

Người dùng tuỳ chỉnh trong **Cài đặt → Giao diện**; thiết lập lưu vào `localStorage` (key `house-management:theme`) và tự áp dụng lại khi mở trang:

- **Chế độ**: sáng / tối / theo hệ thống (class `dark` trên `<html>`)
- **Màu chủ đạo**: neutral, blue, green, violet, orange, rose (`data-accent` trên `<html>`, palette định nghĩa cuối `app/globals.css`)
- **Cỡ chữ**: nhỏ 14px / vừa 16px / lớn 18px (`data-font-size` — Tailwind dùng rem nên toàn UI scale theo)

`ThemeScript` (inline trong `<head>`) áp dụng theme trước khi paint để không bị nháy giao diện; `ThemeProvider` cung cấp hook `useTheme()` cho client component.

Thêm màu accent mới: bổ sung entry vào `THEME_ACCENTS` trong `lib/theme.ts` + block `[data-accent="…"]` trong `app/globals.css`.

## Thêm component shadcn/ui

```bash
pnpm dlx shadcn@latest add <tên-component>
```

## Lưu ý Next.js 16

Phiên bản này có breaking changes so với tài liệu phổ biến — đọc `node_modules/next/dist/docs/` trước khi viết code:

- `params`, `searchParams` là **Promise** (phải `await`)
- `cookies()` là async
- `proxy.ts` thay cho `middleware.ts`
- Auth đã hoàn thiện — Server Actions trong `features/auth` gọi NestJS API (localhost:3001), JWT lưu trong httpOnly cookie `hm_token`, route gating qua `proxy.ts`
