# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend API for House Management. See the root `CLAUDE.md` for monorepo-wide context.

## Tech Stack

- **NestJS 11** (Express platform), TypeScript 5
- **Prisma 7** ORM with **MySQL** (client generated to `src/generated/`, CJS module format; the MySQL instance is defined in the root `docker-compose.yml`)
- **Jest** for unit tests (`src/**/*.spec.ts`) and e2e tests (`test/`, config in `test/jest-e2e.json`)
- Package manager: **pnpm**

## Commands

```bash
pnpm start:dev                      # dev server with watch
pnpm start:debug                    # dev server with debugger
pnpm build                          # nest build
pnpm lint                           # eslint --fix
pnpm format                         # prettier on src/ and test/

pnpm test                           # all unit tests
pnpm test path/to/file.spec.ts      # single test file
pnpm test -t "test name"            # single test by name
pnpm test:e2e                       # e2e tests
```

## Structure

```
src/
  main.ts          # bootstrap (port from process.env.PORT, default 3000)
  app.module.ts    # root module
prisma/            # schema.prisma + migrations (once Prisma is set up)
test/              # e2e specs
```

Follow standard NestJS layout when adding features: one directory per domain module under `src/` containing `*.module.ts`, `*.controller.ts`, `*.service.ts`, and `dto/`.

## Skills

- Use `nestjs-best-practices` before writing or refactoring any NestJS code (module boundaries, DI, validation pipes, guards, config).
- Use `prisma-database-setup` when installing/configuring Prisma, wiring the MySQL connection, or debugging connection issues.

## Notes

- This directory has its own nested `.git` — verify which repo you are operating on before committing.
