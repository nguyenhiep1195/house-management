# Auth & User Management — Design Spec

**Date:** 2026-07-13
**Status:** Approved by user (brainstorming session)

## Overview

Add authentication and role-based user management to House Management:

- Login, logout, forgot password (email), password reset.
- Single JWT, 30-day expiry, stored in an httpOnly cookie via a Next.js BFF layer. **No refresh token** (explicit user decision — revocation is covered by `tokenVersion`, see below).
- Two roles: `ADMIN`, `MANAGER`. One admin is seeded into the database.
- Admin gets CRUD over MANAGER accounts and an extra "Người dùng" menu entry.
- All `(admin)` routes, including home `/`, require login.
- A security rules file for Claude at `.claude/rules/security.md`.

## Decisions (settled with user)

| Question | Decision |
|---|---|
| Token model | Single JWT, 30d expiry. No refresh token. |
| Forgot password delivery | Real SMTP email via nodemailer, config via env. |
| Token storage | httpOnly cookie set by Next.js BFF (Server Actions call NestJS server-to-server). |

## 1. Database (Prisma + MySQL)

`docker-compose.yml` (currently empty) gets a `mysql:8` service: database `house_management`, port 3306, named volume, credentials via env with sane local defaults.

Prisma is not yet installed in `apps/api` — set it up per the `prisma-database-setup` skill (MySQL provider).

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | Int, autoincrement PK | |
| `email` | String, unique | login identifier |
| `password` | String | bcrypt hash (cost 12); never returned by any API |
| `name` | String | display name |
| `phone` | String? | optional |
| `role` | enum `Role { ADMIN, MANAGER }` | default `MANAGER` |
| `isActive` | Boolean, default true | admin can deactivate an account; inactive users cannot log in and existing tokens are rejected |
| `tokenVersion` | Int, default 0 | embedded in JWT; bumped on password reset/change → all previously issued tokens become invalid immediately |
| `createdAt` / `updatedAt` | DateTime | |

### `password_reset_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | Int, autoincrement PK | |
| `userId` | Int, FK → users, cascade delete | |
| `tokenHash` | String | SHA-256 of the raw token; raw token only ever appears in the email link |
| `expiresAt` | DateTime | 15 minutes after creation |
| `usedAt` | DateTime? | single-use; set on successful reset |
| `createdAt` | DateTime | |

Creating a new reset token deletes the user's previous unused tokens.

### Seed (`prisma/seed.ts`)

Idempotent: creates one ADMIN from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars if no user with that email exists. Wired to `prisma db seed`.

## 2. Backend API (NestJS, `apps/api`)

Runs on port **3001** (web dev server uses 3000). Follow `nestjs-best-practices` skill.

### AuthModule

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /auth/login` | Public | email + password → `{ accessToken, user }`. JWT payload: `{ sub, role, tokenVersion }`, `expiresIn: '30d'`. Generic error "Email hoặc mật khẩu không đúng" for wrong email OR password. Rejects inactive users with the same generic error. |
| `GET /auth/me` | JWT | returns current user (id, email, name, phone, role) — no password. |
| `POST /auth/forgot-password` | Public | always returns 200 with a generic message, whether or not the email exists (prevents user enumeration). If it exists: create reset token, send Vietnamese email with link `{WEB_URL}/reset-password?token=<raw>`. |
| `POST /auth/reset-password` | Public | `{ token, newPassword }` → validate hash/expiry/unused → update password, set `usedAt`, bump `tokenVersion`. |

Logout is a BFF concern (cookie deletion) — no backend endpoint needed.

### UsersModule (ADMIN only)

CRUD scoped to MANAGER accounts: `GET /users` (list), `POST /users`, `PATCH /users/:id`, `DELETE /users/:id`. Rules:

- Only role `MANAGER` can be created/updated/deleted through this API (the seeded admin is the sole admin; admin accounts are not manageable here).
- `PATCH` may update name, phone, email, `isActive`, and optionally password (bumps `tokenVersion`).

### Guards & cross-cutting

- `JwtAuthGuard` registered globally via `APP_GUARD`; `@Public()` decorator opts endpoints out. Custom guard using `@nestjs/jwt` directly (no passport — one strategy, fewer deps). Verification: JWT valid **and** user exists **and** `isActive` **and** `tokenVersion` matches DB.
- `RolesGuard` + `@Roles(Role.ADMIN)` for UsersModule.
- Global `ValidationPipe` (`whitelist: true, transform: true`) with class-validator DTOs.
- `helmet` middleware.
- `@nestjs/throttler` on auth endpoints (e.g. 5 req/min per IP on login & forgot-password).
- `@nestjs/config` with env validation at boot (fail fast on missing `JWT_SECRET`, `DATABASE_URL`, etc.).

### MailModule

nodemailer wrapper service; SMTP via env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Reset email copy in Vietnamese.

### Env (`apps/api/.env`, with `.env.example` committed)

`DATABASE_URL`, `JWT_SECRET`, `PORT=3001`, `WEB_URL=http://localhost:3000`, `SMTP_*`, `MAIL_FROM`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

## 3. Frontend (Next.js 16, `apps/web`)

Next 16 has breaking changes — consult `node_modules/next/dist/docs/` before writing middleware/Server Action code (middleware convention may be `proxy.ts`).

### BFF layer

- `features/auth/actions.ts` — Server Actions: `login`, `logout`, `forgotPassword`, `resetPassword`. They call NestJS at `API_URL` (server-only env) and manage the cookie:
  - Cookie: name `hm_token`, `httpOnly`, `secure` (in prod), `sameSite: 'lax'`, `path: '/'`, `maxAge` 30d.
  - The browser never sees the JWT. Logout deletes the cookie.
- Authenticated server-side fetches forward the cookie value as `Authorization: Bearer <token>` to NestJS.

### Middleware — login-state gate (route protection)

Root-level middleware file in `apps/web` (`middleware.ts`, or `proxy.ts` if that is Next 16's convention — confirm in `node_modules/next/dist/docs/` first). Runs on every request before rendering:

1. Read the `hm_token` cookie.
2. **Not logged in** (cookie missing, or its JWT `exp` already passed when decoded without verification) → redirect to `/login` for **every** protected route: all `(admin)` routes including home `/`, `/users`, `/buildings`, `/residents`, `/maintenance`, `/settings`. Append `?next=<pathname>` so login can return the user to where they were heading.
3. **Logged in** and visiting `/login` or `/forgot-password` → redirect to `/`.
4. Public, always reachable: `/login`, `/forgot-password`, `/reset-password`, Next static assets (excluded via `matcher` config).

Middleware checks presence + expiry only (no signature verification — `JWT_SECRET` stays backend-only). It is the UX gate; the security boundary remains the API's `JwtAuthGuard` on every call, plus:

- `(admin)/layout.tsx` calls `GET /auth/me` server-side; on 401 (invalid/stale token that middleware can't detect) it deletes the cookie and redirects to `/login`. Passes `user` (name, role) to the sidebar/header.

### Role-based UI

- `lib/navigation.ts`: add "Người dùng" (`/users`, Users icon) with a `role: "ADMIN"` marker; sidebar filters items by the current user's role.
- `/users` page additionally enforces ADMIN server-side (redirect non-admins) — hiding the menu is not the security boundary.

### Pages & components

- `(admin)/users/page.tsx` — manager list (table) + create/edit dialogs, activate/deactivate, delete with confirm. shadcn/ui, Vietnamese copy, follow `ui-ux-pro-max` skill.
- `(auth)/reset-password/page.tsx` + `features/auth/components/reset-password-form.tsx` — new password form driven by `?token=`.
- Wire the existing mock `login-form.tsx` and `forgot-password-form.tsx` to the real Server Actions (loading/error states via sonner toasts, Vietnamese messages).
- User menu in header/sidebar footer gets a working "Đăng xuất" action.

### Env (`apps/web/.env.local`, with `.env.example` committed)

`API_URL=http://localhost:3001` (server-only; not `NEXT_PUBLIC_`).

## 4. Claude security rules

Create `.claude/rules/security.md` — mandatory rules when writing code in this repo: bcrypt for passwords, never log/return secrets or tokens, httpOnly cookies for session material, validate all input via DTOs, DB access only through Prisma (parameterized), rate-limit auth endpoints, generic auth error messages, secrets only via env (never committed), user enumeration prevention, single-use time-boxed reset tokens.

## 5. Testing

- Unit: `AuthService` (login success/failure/inactive, reset flow, tokenVersion bump), `UsersService` (admin-only rules), guards.
- E2E (`test/`): login → me → users CRUD happy path; 401 without token; 403 as MANAGER on `/users`.
- Frontend: `pnpm build` + `pnpm lint` pass; manual flow check.

## Trade-offs & explicitly out of scope

- **No refresh token / no per-session revocation** (user decision). A leaked token stays valid up to 30d unless the user's password is reset (`tokenVersion` bump) or the account is deactivated. Logout only deletes the cookie.
- No "remember me" variance (checkbox is cosmetic — session is always 30d), no email verification, no password-change-while-logged-in screen (admin can set passwords via user CRUD), no audit log. Can be added later.
