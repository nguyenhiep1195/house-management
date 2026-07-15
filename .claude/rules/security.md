# Security Rules

Mandatory rules when writing or reviewing code in this repository. These are
not suggestions — code that violates them must not be merged.

## Secrets & configuration
- Secrets (DB credentials, `JWT_SECRET`, SMTP credentials) live ONLY in env
  vars (`.env` / `.env.local`, both gitignored). Never hardcode or commit them.
  Every new env var gets a placeholder entry in the matching `.env.example`.
- Validate required env vars at boot (`apps/api/src/config/env.validation.ts`)
  — fail fast, never fall back to insecure defaults for secrets.

## Passwords & tokens
- Passwords are hashed with bcrypt, cost 12 (`SALT_ROUNDS` in
  `apps/api/src/auth/auth.service.ts`). Never store, log, or return plaintext
  or hashed passwords from any endpoint (use `SAFE_USER_SELECT`).
- Password-reset tokens: random ≥32 bytes, stored only as SHA-256 hashes,
  expire in 15 minutes, single-use. The raw token appears only in the email.
- JWTs and session cookies must never be logged, embedded in URLs (except the
  one-time reset link), or exposed to client-side JS.

## Session handling (web)
- The JWT lives in the `hm_token` httpOnly cookie set by Server Actions only
  (`secure` in production, `sameSite=lax`). Never store auth material in
  localStorage/sessionStorage or non-httpOnly cookies.
- All protected pages are gated by `proxy.ts` AND server-side checks
  (`getCurrentUser()` + role checks in pages/layouts). Hiding UI is never the
  security boundary — the API guard is.
- Validate/whitelist any redirect target from user input (see `safeNextPath`)
  — only same-origin absolute paths.

## API
- Every endpoint is authenticated by default (global `JwtAuthGuard`); opting
  out requires an explicit `@Public()` with a reason. Role-restricted
  endpoints use `@Roles(...)`.
- All input goes through class-validator DTOs with the global `ValidationPipe`
  (`whitelist: true`) — no `any`-typed request bodies, no unvalidated fields.
- Database access only through Prisma (parameterized). Never interpolate user
  input into `$queryRaw`/`$executeRaw` strings.
- Auth endpoints are rate-limited (`@Throttle`, 5/min). Keep brute-forceable
  endpoints (login, forgot/reset password) throttled.
- Auth failures return generic messages ("Email hoặc mật khẩu không đúng");
  forgot-password always returns 200. Never reveal whether an email exists.
- On password change/reset or deactivation, bump `tokenVersion` so existing
  JWTs die immediately.

## General
- New dependencies: prefer well-maintained packages; check for known CVEs.
- Never disable helmet, CORS restrictions, or TLS verification to "make it
  work".
- Error responses must not leak stack traces, SQL, or internal paths.
