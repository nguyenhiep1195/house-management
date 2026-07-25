# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

House Management — a building/apartment management system, structured as a monorepo with two independent apps (each has its own `package.json` and `pnpm-lock.yaml`; there is no root workspace — run commands from inside each app directory):

```
apps/
  api/   # Backend  — NestJS 11, Prisma, MySQL   (see apps/api/CLAUDE.md)
  web/   # Frontend — Next.js 16, Tailwind v4, shadcn/ui  (see apps/web/CLAUDE.md)
docker-compose.yml   # Local infrastructure (MySQL)
docs/                # Project documentation
```

Package manager: **pnpm** for both apps.

Always read the app-level CLAUDE.md (`apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`) before working in that app.

## Skills

Project skills are installed in `.claude/skills/` (pinned via `skills-lock.json`). Invoke the matching skill BEFORE writing code in its domain:

| Skill | When to use |
|---|---|
| `nestjs-best-practices` | Writing, reviewing, or refactoring any NestJS code in `apps/api` (modules, DI, guards, pipes, config) |
| `prisma-database-setup` | Setting up or changing the Prisma ↔ MySQL connection, provider config, or troubleshooting DB connection issues |
| `ui-ux-pro-max` | Designing or building UI in `apps/web` — pages, components, color/typography/layout, accessibility, charts |
| `clerk-nextjs-patterns` | Implementing auth flows in `apps/web` with Clerk (middleware, Server Actions, caching) |

Rule of thumb: backend task → `nestjs-best-practices` (plus `prisma-database-setup` if it touches DB config); frontend UI task → `ui-ux-pro-max`; frontend auth task → `clerk-nextjs-patterns`.

## Common Commands

Backend (`apps/api`):

```bash
pnpm start:dev        # dev server with watch
pnpm test             # unit tests (jest, *.spec.ts under src/)
pnpm test:e2e         # e2e tests (test/jest-e2e.json)
pnpm lint             # eslint --fix
```

Frontend (`apps/web`):

```bash
pnpm dev              # Next.js dev server
pnpm build            # production build
pnpm lint             # eslint
```

## Conventions

- User-facing copy in the web app is in **Vietnamese**; code, comments, and identifiers are in English.
- `apps/api` currently contains a nested `.git` directory — do not run git commands assuming the root repo while `cwd` is inside `apps/api`.
