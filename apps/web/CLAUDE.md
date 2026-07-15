# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Frontend for House Management. See the root `CLAUDE.md` for monorepo-wide context.

## Tech Stack

- **Next.js 16.2** (App Router, RSC) — breaking changes vs. older versions; per `AGENTS.md` above, consult `node_modules/next/dist/docs/` before writing Next.js-specific code
- **React 19**, TypeScript 5
- **Tailwind CSS v4** (PostCSS plugin, no `tailwind.config` file — theme lives in `app/globals.css` via CSS variables)
- **shadcn/ui** (`radix-nova` style, lucide icons) — config in `components.json`; add components with `pnpm dlx shadcn add <name>`
- `next-themes` for dark mode, `sonner` for toasts
- Package manager: **pnpm**

## Commands

```bash
pnpm dev      # dev server
pnpm build    # production build
pnpm lint     # eslint
```

## Structure

```
app/
  (auth)/          # auth routes: login, forgot-password (own layout)
  (admin)/         # admin dashboard routes: /, buildings, residents, maintenance, settings (own layout)
  globals.css      # Tailwind v4 theme + CSS variables
components/
  ui/              # shadcn/ui primitives — generated; avoid hand-editing, prefer composition
  layout/          # app-sidebar, site-header
  providers/       # theme provider/script
  shared/          # reusable app components (page-header, mode-toggle, ...)
features/          # feature-first modules: features/<domain>/components/ (+ data.ts)
lib/               # utils (cn), navigation config (ADMIN_NAV), theme helpers
hooks/             # shared hooks
```

Path aliases (from `components.json` / `tsconfig.json`): `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.

## Conventions

- Feature-specific components live in `features/<domain>/components/`, not in `components/`. `components/` is only for cross-feature UI.
- Sidebar/nav entries are declared centrally in `lib/navigation.ts` — add new admin pages there.
- All user-facing text is in **Vietnamese**.

## Skills

- Use `ui-ux-pro-max` before designing or building any UI (pages, components, palettes, typography, accessibility, charts).
- Use `clerk-nextjs-patterns` when implementing authentication (middleware, Server Actions, caching with Clerk).
