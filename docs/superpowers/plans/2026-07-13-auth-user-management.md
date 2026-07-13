# Auth & User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login/logout/forgot-password with a single 30-day JWT in an httpOnly cookie, role-based user management (ADMIN CRUD over MANAGER accounts), and a login-gate middleware — per the approved spec `docs/superpowers/specs/2026-07-13-auth-user-management-design.md`.

**Architecture:** NestJS API (`apps/api`, port 3001) with Prisma 7 + MySQL owns all auth logic; Next.js 16 (`apps/web`, port 3000) acts as a BFF — Server Actions call the API server-to-server and keep the JWT in an httpOnly cookie the browser never reads. Revocation without refresh tokens is handled by a `tokenVersion` column checked on every authenticated request.

**Tech Stack:** NestJS 11, Prisma 7 (`prisma-client` generator, `@prisma/adapter-mariadb`), MySQL 8 (docker), bcrypt, `@nestjs/jwt`, `@nestjs/throttler`, helmet, nodemailer (+ Mailhog for dev), Next.js 16.2 (App Router, `proxy.ts`, Server Actions, `useActionState`), shadcn/ui, Tailwind v4.

## Global Constraints

- Package manager is **pnpm**; there is **no root workspace** — run all package commands from inside `apps/api` or `apps/web`.
- **`apps/api` is its own git repository.** Commits for API files MUST be made with cwd inside `apps/api`. `apps/web`, root files (`docker-compose.yml`, `.claude/`, `docs/`) commit to the **root repo** with cwd at the repo root. Never `git add apps/api` from the root repo.
- User-facing copy is **Vietnamese**; code, comments, identifiers are English.
- JWT lifetime: **30d** (env `JWT_EXPIRES_IN`, default `30d`). Cookie name: **`hm_token`**, maxAge 30 days.
- Roles enum: `ADMIN`, `MANAGER`. Passwords: bcrypt cost **12**, min length **8**.
- Reset tokens: random 32 bytes hex, stored as SHA-256 hash, expire after **15 minutes**, single-use.
- Auth error messages are generic (no user enumeration): login → `"Email hoặc mật khẩu không đúng"`; forgot-password always returns 200.
- Next.js 16 breaking changes verified against `node_modules/next/dist/docs/`: request interception file is **`proxy.ts`** at project root (exported function `proxy`); `cookies()` and `searchParams` are **async** (`await` them); pending/error state hook is **`useActionState`**; `redirect()` throws — call it outside try/catch.
- Never log or return passwords, JWTs, or raw reset tokens.

---

### Task 1: Local infrastructure — MySQL + Mailhog in docker-compose

**Files:**
- Modify: `docker-compose.yml` (currently empty, at repo root)

**Interfaces:**
- Produces: MySQL at `localhost:3306` (root/root, db `house_management`); Mailhog SMTP at `localhost:1025`, web UI at `http://localhost:8025`.

- [ ] **Step 1: Write docker-compose.yml**

```yaml
services:
  mysql:
    image: mysql:8
    container_name: house-management-mysql
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: house_management
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-proot"]
      interval: 5s
      timeout: 5s
      retries: 10

  mailhog:
    image: mailhog/mailhog:latest
    container_name: house-management-mailhog
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  mysql_data:
```

- [ ] **Step 2: Start and verify**

Run: `docker compose up -d && docker compose ps`
Expected: both services `Up`, mysql eventually `healthy`. Verify DB: `docker exec house-management-mysql mysql -uroot -proot -e "SHOW DATABASES;"` → contains `house_management`.

- [ ] **Step 3: Commit (root repo)**

```bash
git add docker-compose.yml
git commit -m "feat: add MySQL and Mailhog to docker-compose"
```

---

### Task 2: Prisma 7 + MySQL setup in apps/api

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/.env`, `apps/api/.env.example`, `apps/api/src/prisma/prisma.module.ts`, `apps/api/src/prisma/prisma.service.ts`
- Modify: `apps/api/.gitignore`, `apps/api/eslint.config.mjs` (ignores), `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `PrismaService` (global, injectable) — a `PrismaClient` with models `user`, `passwordResetToken` and enum `Role { ADMIN, MANAGER }`. Generated client lives at `apps/api/src/generated/` (gitignored). Import types from `src/generated/client` (adjust relative path per file).

- [ ] **Step 1: Install dependencies** (cwd `apps/api`)

```bash
pnpm add @prisma/client @prisma/adapter-mariadb mariadb @nestjs/config
pnpm add -D prisma dotenv
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
datasource db {
  provider = "mysql"
}

generator client {
  provider = "prisma-client"
  output   = "../src/generated"
}

enum Role {
  ADMIN
  MANAGER
}

model User {
  id           Int                  @id @default(autoincrement())
  email        String               @unique
  password     String
  name         String
  phone        String?
  role         Role                 @default(MANAGER)
  isActive     Boolean              @default(true)
  tokenVersion Int                  @default(0)
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
  resetTokens  PasswordResetToken[]

  @@map("users")
}

model PasswordResetToken {
  id        Int       @id @default(autoincrement())
  userId    Int
  tokenHash String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@map("password_reset_tokens")
}
```

- [ ] **Step 3: Write `prisma.config.ts`** (at `apps/api/prisma.config.ts`)

```typescript
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
```

- [ ] **Step 4: Write `.env` and `.env.example`**

`apps/api/.env` (generate the secret: `openssl rand -hex 32`):

```env
DATABASE_URL="mysql://root:root@localhost:3306/house_management"
PORT=3001
JWT_SECRET="<paste output of: openssl rand -hex 32>"
JWT_EXPIRES_IN="30d"
WEB_URL="http://localhost:3000"
SMTP_HOST="localhost"
SMTP_PORT=1025
SMTP_USER=""
SMTP_PASS=""
MAIL_FROM="House Management <no-reply@house.local>"
SEED_ADMIN_EMAIL="admin@house.local"
SEED_ADMIN_PASSWORD="Admin@12345"
```

`apps/api/.env.example`: same keys, but `JWT_SECRET=""` and a comment header `# Copy to .env and fill in values. Generate JWT_SECRET with: openssl rand -hex 32`.

- [ ] **Step 5: Ignore generated client and env**

Append to `apps/api/.gitignore`:

```
.env
src/generated/
```

In `apps/api/eslint.config.mjs`, add `'src/generated/**'` to the existing `ignores` array (read the file first; Nest scaffolds one near the top). Create `apps/api/.prettierignore` containing `src/generated/`.

- [ ] **Step 6: Run migration + generate**

Run (cwd `apps/api`): `pnpm prisma migrate dev --name init`
Expected: migration created under `prisma/migrations/`, client generated into `src/generated/`. Verify tables: `docker exec house-management-mysql mysql -uroot -proot house_management -e "SHOW TABLES;"` → `users`, `password_reset_tokens`, `_prisma_migrations`.

- [ ] **Step 7: Write `src/prisma/prisma.service.ts` and `src/prisma/prisma.module.ts`**

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaMariaDb(config.getOrThrow<string>('DATABASE_URL')),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Note: if `../generated/client` fails to resolve, check what `prisma generate` actually emitted under `src/generated/` (newer generators emit `client.ts` plus an `enums.ts`) and adjust the import — enum `Role` may need `import { Role } from '../generated/enums'`. Use whichever path the generated code exposes; keep it consistent everywhere.

- [ ] **Step 8: Register in `app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 9: Verify boot**

Run (cwd `apps/api`): `pnpm build && pnpm start:dev` (Ctrl-C after it logs `Nest application successfully started`).
Expected: no DI or import errors.

- [ ] **Step 10: Commit (apps/api repo)**

```bash
cd apps/api
git add .gitignore .prettierignore .env.example prisma.config.ts prisma/ src/prisma/ src/app.module.ts package.json pnpm-lock.yaml eslint.config.mjs
git commit -m "feat: set up Prisma 7 with MySQL, User and PasswordResetToken models"
```

---

### Task 3: Seed the default admin

**Files:**
- Create: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars; `prisma.config.ts` `migrations.seed` wiring from Task 2.
- Produces: one ADMIN row; running twice is a no-op.

- [ ] **Step 1: Install bcrypt** (cwd `apps/api`)

```bash
pnpm add bcrypt
pnpm add -D @types/bcrypt
```

- [ ] **Step 2: Write `prisma/seed.ts`**

```typescript
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/client';

const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set');
  }

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
  const prisma = new PrismaClient({ adapter });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin ${email} already exists, skipping seed`);
      return;
    }
    await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, SALT_ROUNDS),
        name: 'Quản trị viên',
        role: 'ADMIN',
      },
    });
    console.log(`Seeded admin ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Run and verify idempotency**

Run (cwd `apps/api`): `pnpm prisma db seed` → `Seeded admin admin@house.local`.
Run again: `pnpm prisma db seed` → `Admin admin@house.local already exists, skipping seed`.
Verify: `docker exec house-management-mysql mysql -uroot -proot house_management -e "SELECT email, role, isActive FROM users;"` → one ADMIN row.

- [ ] **Step 4: Commit (apps/api repo)**

```bash
cd apps/api
git add prisma/seed.ts package.json pnpm-lock.yaml
git commit -m "feat: seed default admin user"
```

---

### Task 4: API baseline — env validation, helmet, ValidationPipe, throttler, port 3001

**Files:**
- Create: `apps/api/src/config/env.validation.ts`, `apps/api/src/app.setup.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`

**Interfaces:**
- Produces: `configureApp(app: INestApplication): void` (shared by `main.ts` and e2e tests); global `ThrottlerGuard` (default 100 req/min, auth endpoints tightened later); boot fails fast on missing env.

- [ ] **Step 1: Install dependencies** (cwd `apps/api`)

```bash
pnpm add helmet @nestjs/throttler
```

- [ ] **Step 2: Write `src/config/env.validation.ts`**

```typescript
const REQUIRED_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WEB_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'MAIL_FROM',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter(
    (key) => config[key] === undefined || config[key] === '',
  );
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return config;
}
```

- [ ] **Step 3: Write `src/app.setup.ts`**

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
}
```

- [ ] **Step 4: Update `src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT') ?? 3001);
}
void bootstrap();
```

- [ ] **Step 5: Update `src/app.module.ts`** (add validation + throttler)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Install class-validator stack (used by all DTOs from Task 5 on)**

```bash
pnpm add class-validator class-transformer
```

- [ ] **Step 7: Verify**

Run: `pnpm build` → success. Run `pnpm start:dev`, confirm it boots on 3001 (`curl -s localhost:3001` → `Hello World!`), then temporarily rename `JWT_SECRET` in `.env` to `X_JWT_SECRET`, restart → boot MUST fail with `Missing required environment variables: JWT_SECRET`. Restore `.env`.

- [ ] **Step 8: Commit (apps/api repo)**

```bash
cd apps/api
git add src/config/ src/app.setup.ts src/main.ts src/app.module.ts package.json pnpm-lock.yaml
git commit -m "feat: add env validation, helmet, global validation pipe and rate limiting"
```

---

### Task 5: Auth foundation — JWT module, @Public, JwtAuthGuard, RolesGuard

**Files:**
- Create: `apps/api/src/auth/decorators/public.decorator.ts`, `apps/api/src/auth/decorators/roles.decorator.ts`, `apps/api/src/auth/decorators/current-user.decorator.ts`, `apps/api/src/auth/types/jwt-payload.ts`, `apps/api/src/auth/types/auth-user.ts`, `apps/api/src/auth/guards/jwt-auth.guard.ts`, `apps/api/src/auth/guards/jwt-auth.guard.spec.ts`, `apps/api/src/auth/guards/roles.guard.ts`, `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `Role` from `src/generated/client`.
- Produces:
  - `JwtPayload = { sub: number; role: Role; tokenVersion: number }`
  - `AuthUser = { id: number; email: string; name: string; phone: string | null; role: Role }` attached to `request.user`
  - Decorators `@Public()`, `@Roles(...roles: Role[])`, `@CurrentUser()` (param decorator returning `AuthUser`)
  - Global guard order in `AppModule`: `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`

- [ ] **Step 1: Install @nestjs/jwt** (cwd `apps/api`)

```bash
pnpm add @nestjs/jwt
```

- [ ] **Step 2: Write decorators and types**

```typescript
// src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```typescript
// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
```

```typescript
// src/auth/types/jwt-payload.ts
import { Role } from '../../generated/client';

export interface JwtPayload {
  sub: number;
  role: Role;
  tokenVersion: number;
}
```

```typescript
// src/auth/types/auth-user.ts
import { Role } from '../../generated/client';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
}
```

(If `Role` is not exported from `../../generated/client`, use the path the generator emitted — see Task 2 Step 7 note.)

- [ ] **Step 3: Write the failing guard test `src/auth/guards/jwt-auth.guard.spec.ts`**

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

function mockContext(headers: Record<string, string>, isPublic = false) {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { context: context as never, request, isPublic };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const jwtService = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const reflector = { getAllAndOverride: jest.fn() };

  const dbUser = {
    id: 1,
    email: 'a@a.com',
    name: 'A',
    phone: null,
    role: 'MANAGER',
    isActive: true,
    tokenVersion: 0,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    guard = moduleRef.get(JwtAuthGuard);
  });

  it('allows @Public routes without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = mockContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects requests without a bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = mockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when tokenVersion does not match the database', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({ ...dbUser, tokenVersion: 1 });
    const { context } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects inactive users', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({ ...dbUser, isActive: false });
    const { context } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches AuthUser to the request on success', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue(dbUser);
    const { context, request } = mockContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 1,
      email: 'a@a.com',
      name: 'A',
      phone: null,
      role: 'MANAGER',
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (cwd `apps/api`): `pnpm test src/auth/guards/jwt-auth.guard.spec.ts`
Expected: FAIL — `Cannot find module './jwt-auth.guard'`.

- [ ] **Step 5: Write `src/auth/guards/jwt-auth.guard.ts`**

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException();

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        tokenVersion: true,
      },
    });
    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException();
    }

    const { isActive, tokenVersion, ...authUser } = user;
    void isActive;
    void tokenVersion;
    (request as Request & { user: typeof authUser }).user = authUser;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/auth/guards/jwt-auth.guard.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Write `src/auth/guards/roles.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    return !!user && requiredRoles.includes(user.role);
  }
}
```

- [ ] **Step 8: Write `src/auth/auth.module.ts` and register global guards**

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '30d' },
      }),
    }),
  ],
})
export class AuthModule {}
```

In `src/app.module.ts`: add `AuthModule` to `imports` and extend `providers` (order matters — throttling before auth, auth before roles):

```typescript
providers: [
  AppService,
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

with imports `import { AuthModule } from './auth/auth.module';`, `import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';`, `import { RolesGuard } from './auth/guards/roles.guard';`.

Also add `@Public()` to the scaffold `AppController.getHello()` (`src/app.controller.ts`) so the root health route stays open:

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

- [ ] **Step 9: Verify**

Run: `pnpm test` → all pass. `pnpm build` → success. Boot `pnpm start:dev`: `curl -s localhost:3001/` → `Hello World!` (public), `curl -s -o /dev/null -w "%{http_code}" localhost:3001/nonexistent` → 401 (guard runs before 404 routing is irrelevant here; any guarded probe like `curl -s localhost:3001/auth/me` once Task 6 lands returns 401).

- [ ] **Step 10: Commit (apps/api repo)**

```bash
cd apps/api
git add src/auth/ src/app.module.ts src/app.controller.ts package.json pnpm-lock.yaml
git commit -m "feat: add JWT auth guard, roles guard and auth decorators"
```

---

### Task 6: Login + /auth/me (TDD)

**Files:**
- Create: `apps/api/src/auth/dto/login.dto.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Produces:
  - `POST /auth/login` (public, throttled 5/min) body `{ email, password }` → 200 `{ accessToken: string, user: { id, email, name, role } }`
  - `GET /auth/me` → 200 `AuthUser`
  - `AuthService.login(dto: LoginDto): Promise<{ accessToken: string; user: { id: number; email: string; name: string; role: Role } }>`
  - Shared constant `SALT_ROUNDS = 12` exported from `auth.service.ts`.

- [ ] **Step 1: Write `src/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

- [ ] **Step 2: Write the failing service test `src/auth/auth.service.spec.ts`**

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn() },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt') };
  const mailService = { sendPasswordReset: jest.fn() };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: 'MailService', useValue: mailService },
        { provide: 'ConfigService', useValue: configService },
      ],
    })
      .useMocker(() => ({}))
      .compile();
    service = moduleRef.get(AuthService);
  });

  const activeUser = async () => ({
    id: 1,
    email: 'admin@house.local',
    password: await bcrypt.hash('Admin@12345', 4),
    name: 'Quản trị viên',
    phone: null,
    role: 'ADMIN',
    isActive: true,
    tokenVersion: 3,
  });

  it('returns a token and safe user on valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(await activeUser());
    const result = await service.login({
      email: 'admin@house.local',
      password: 'Admin@12345',
    });
    expect(result.accessToken).toBe('signed.jwt');
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      role: 'ADMIN',
      tokenVersion: 3,
    });
    expect(result.user).toEqual({
      id: 1,
      email: 'admin@house.local',
      name: 'Quản trị viên',
      role: 'ADMIN',
    });
    expect(result.user).not.toHaveProperty('password');
  });

  it('throws the generic error for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@x.com', password: 'Admin@12345' }),
    ).rejects.toThrow('Email hoặc mật khẩu không đúng');
  });

  it('throws the generic error for a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue(await activeUser());
    await expect(
      service.login({ email: 'admin@house.local', password: 'wrong-pass' }),
    ).rejects.toThrow('Email hoặc mật khẩu không đúng');
  });

  it('throws the same generic error for an inactive user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...(await activeUser()),
      isActive: false,
    });
    await expect(
      service.login({ email: 'admin@house.local', password: 'Admin@12345' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

Note: `MailService`/`ConfigService` are injected in Task 7; the string-token placeholders plus `.useMocker` keep this spec compiling before and after. When Task 7 adds the real constructor params, update these two provider lines to `{ provide: MailService, useValue: mailService }` and `{ provide: ConfigService, useValue: configService }` with real imports.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/auth/auth.service.spec.ts`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 4: Write `src/auth/auth.service.ts` (login only for now)**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload';

export const SALT_ROUNDS = 12;

const INVALID_CREDENTIALS = 'Email hoặc mật khẩu không đúng';

export interface LoginResult {
  accessToken: string;
  user: { id: number; email: string; name: string; role: Role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/auth/auth.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write `src/auth/auth.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginResult } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './types/auth-user';

const AUTH_THROTTLE = {
  default: { limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5), ttl: 60_000 },
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
```

(`THROTTLE_AUTH_LIMIT` exists so e2e tests can raise the limit; production leaves it unset → 5/min.)

- [ ] **Step 7: Register in `auth.module.ts`**

Add to the `@Module` in `src/auth/auth.module.ts`:

```typescript
controllers: [AuthController],
providers: [AuthService],
```

with imports `import { AuthController } from './auth.controller';` and `import { AuthService } from './auth.service';`.

- [ ] **Step 8: Manual smoke test**

Boot `pnpm start:dev`, then:

```bash
curl -s -X POST localhost:3001/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@house.local","password":"Admin@12345"}'
```
Expected: 200 with `accessToken` and `user` (no `password` field).

```bash
TOKEN=<accessToken from above>
curl -s localhost:3001/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: the admin's AuthUser JSON. Also `curl -s localhost:3001/auth/me` (no token) → 401, and a wrong-password login → 401 `"Email hoặc mật khẩu không đúng"`.

- [ ] **Step 9: Commit (apps/api repo)**

```bash
cd apps/api
git add src/auth/
git commit -m "feat: add login endpoint and /auth/me"
```

---

### Task 7: Mail module + forgot/reset password (TDD)

**Files:**
- Create: `apps/api/src/mail/mail.module.ts`, `apps/api/src/mail/mail.service.ts`, `apps/api/src/auth/dto/forgot-password.dto.ts`, `apps/api/src/auth/dto/reset-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `SALT_ROUNDS`, `PrismaService`, env `WEB_URL`, `SMTP_*`, `MAIL_FROM`.
- Produces:
  - `MailService.sendPasswordReset(to: string, name: string, resetUrl: string): Promise<void>`
  - `POST /auth/forgot-password` (public, throttled) `{ email }` → always 200 `{ message: string }`
  - `POST /auth/reset-password` (public, throttled) `{ token, newPassword }` → 200 `{ message: string }` or 400
  - `AuthService.forgotPassword(email: string): Promise<{ message: string }>`, `AuthService.resetPassword(dto: ResetPasswordDto): Promise<{ message: string }>`

- [ ] **Step 1: Install nodemailer** (cwd `apps/api`)

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

- [ ] **Step 2: Write `src/mail/mail.service.ts` and `src/mail/mail.module.ts`**

```typescript
// src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const port = Number(config.getOrThrow<string>('SMTP_PORT'));
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    this.from = config.getOrThrow<string>('MAIL_FROM');
  }

  async sendPasswordReset(
    to: string,
    name: string,
    resetUrl: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Đặt lại mật khẩu — House Management',
      html: [
        `<p>Xin chào ${name},</p>`,
        '<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>',
        `<p><a href="${resetUrl}">Nhấn vào đây để đặt lại mật khẩu</a> (liên kết có hiệu lực trong 15 phút và chỉ dùng được một lần).</p>`,
        '<p>Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>',
      ].join('\n'),
    });
    this.logger.log(`Password reset email sent to ${to}`);
  }
}
```

```typescript
// src/mail/mail.module.ts
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 3: Write DTOs**

```typescript
// src/auth/dto/forgot-password.dto.ts
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
```

```typescript
// src/auth/dto/reset-password.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
```

- [ ] **Step 4: Add failing tests to `src/auth/auth.service.spec.ts`**

First update the two placeholder providers from Task 6 to real ones — add imports `import { ConfigService } from '@nestjs/config';` and `import { MailService } from '../mail/mail.service';`, replace `{ provide: 'MailService', ... }` with `{ provide: MailService, useValue: mailService }` and `{ provide: 'ConfigService', ... }` with `{ provide: ConfigService, useValue: configService }`, and drop `.useMocker(() => ({}))`. Then append:

```typescript
describe('AuthService.forgotPassword', () => {
  // reuse the same setup block/mocks as above (same file)

  it('returns the generic message and sends no mail for unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.forgotPassword('nobody@x.com');
    expect(result.message).toBeDefined();
    expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a hashed single-use token and emails a reset link for a known user', async () => {
    prisma.user.findUnique.mockResolvedValue(await activeUser());
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});

    await service.forgotPassword('admin@house.local');

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1, usedAt: null },
    });
    const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
    expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgs.data.userId).toBe(1);
    const [to, , resetUrl] = mailService.sendPasswordReset.mock.calls[0];
    expect(to).toBe('admin@house.local');
    expect(resetUrl).toContain('http://localhost:3000/reset-password?token=');
    // the raw token in the URL must NOT equal the stored hash
    expect(resetUrl).not.toContain(createArgs.data.tokenHash);
  });

  it('still returns the generic message when mail sending fails', async () => {
    prisma.user.findUnique.mockResolvedValue(await activeUser());
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});
    mailService.sendPasswordReset.mockRejectedValue(new Error('smtp down'));
    await expect(
      service.forgotPassword('admin@house.local'),
    ).resolves.toHaveProperty('message');
  });
});

describe('AuthService.resetPassword', () => {
  it('rejects an invalid or expired token', async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);
    await expect(
      service.resetPassword({ token: 'bad', newPassword: 'NewPass@123' }),
    ).rejects.toThrow('Liên kết không hợp lệ hoặc đã hết hạn');
  });

  it('updates the password, marks token used and bumps tokenVersion', async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue({
      id: 9,
      userId: 1,
      tokenHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prisma.$transaction.mockResolvedValue([]);

    await service.resetPassword({
      token: 'raw-token',
      newPassword: 'NewPass@123',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    const ops = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(ops)).toBe(true);
  });
});
```

`activeUser`, `service`, and the mocks must be shared — restructure the file so the `beforeEach`/mocks sit in the outer `describe('AuthService')` block with the three inner describes (`login`, `forgotPassword`, `resetPassword`).

- [ ] **Step 5: Run tests to verify the new ones fail**

Run: `pnpm test src/auth/auth.service.spec.ts`
Expected: login tests still pass; new tests FAIL (`service.forgotPassword is not a function`).

- [ ] **Step 6: Extend `src/auth/auth.service.ts`**

Add imports and methods:

```typescript
import { BadRequestException } from '@nestjs/common'; // merge with existing import
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common'; // merge with existing import
import { MailService } from '../mail/mail.service';
import { ResetPasswordDto } from './dto/reset-password.dto';

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_MESSAGE =
  'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.';

// constructor becomes:
constructor(
  private readonly prisma: PrismaService,
  private readonly jwtService: JwtService,
  private readonly mailService: MailService,
  private readonly configService: ConfigService,
) {}

private readonly logger = new Logger(AuthService.name);

async forgotPassword(email: string): Promise<{ message: string }> {
  const user = await this.prisma.user.findUnique({ where: { email } });
  if (user && user.isActive) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    const webUrl = this.configService.getOrThrow<string>('WEB_URL');
    const resetUrl = `${webUrl}/reset-password?token=${rawToken}`;
    try {
      await this.mailService.sendPasswordReset(user.email, user.name, resetUrl);
    } catch (err) {
      // never leak delivery failures to the caller (enumeration/DoS surface)
      this.logger.error(`Failed to send reset email to user ${user.id}`, err);
    }
  }
  return { message: FORGOT_PASSWORD_MESSAGE };
}

async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
  const tokenHash = createHash('sha256').update(dto.token).digest('hex');
  const resetToken = await this.prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!resetToken) {
    throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn');
  }

  const newPasswordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
  await this.prisma.$transaction([
    this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    this.prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        password: newPasswordHash,
        tokenVersion: { increment: 1 },
      },
    }),
  ]);
  return { message: 'Đặt lại mật khẩu thành công' };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test src/auth/auth.service.spec.ts` → PASS (9 tests).

- [ ] **Step 8: Wire controller + module**

Add to `src/auth/auth.controller.ts`:

```typescript
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Public()
@Throttle(AUTH_THROTTLE)
@HttpCode(HttpStatus.OK)
@Post('forgot-password')
forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
  return this.authService.forgotPassword(dto.email);
}

@Public()
@Throttle(AUTH_THROTTLE)
@HttpCode(HttpStatus.OK)
@Post('reset-password')
resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
  return this.authService.resetPassword(dto);
}
```

In `src/auth/auth.module.ts` add `MailModule` to `imports` (`import { MailModule } from '../mail/mail.module';`).

- [ ] **Step 9: Manual smoke test with Mailhog**

Boot `pnpm start:dev`:

```bash
curl -s -X POST localhost:3001/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"admin@house.local"}'
```
Expected: 200 generic message. Open http://localhost:8025 — the reset email is there; copy the token from the link, then:

```bash
curl -s -X POST localhost:3001/auth/reset-password -H 'Content-Type: application/json' \
  -d '{"token":"<token from email>","newPassword":"Admin@12345"}'
```
Expected: 200 `Đặt lại mật khẩu thành công`. Repeat the same call → 400 (single-use). Also confirm an old login token now gets 401 on `/auth/me` (tokenVersion bumped), and logging in again works.

- [ ] **Step 10: Commit (apps/api repo)**

```bash
cd apps/api
git add src/auth/ src/mail/ package.json pnpm-lock.yaml
git commit -m "feat: add forgot/reset password flow with mailer"
```

---

### Task 8: Users CRUD module — ADMIN manages MANAGER accounts (TDD)

**Files:**
- Create: `apps/api/src/users/dto/create-user.dto.ts`, `apps/api/src/users/dto/update-user.dto.ts`, `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.service.spec.ts`, `apps/api/src/users/users.controller.ts`, `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `SALT_ROUNDS` from `../auth/auth.service`, `@Roles`, `Role`.
- Produces (all under `@Roles(Role.ADMIN)`):
  - `GET /users` → `SafeUser[]`; `POST /users` → 201 `SafeUser`; `PATCH /users/:id` → `SafeUser`; `DELETE /users/:id` → 200 `{ message: string }`
  - `SafeUser = { id, email, name, phone, role, isActive, createdAt }` (never `password`, selected via shared `SAFE_USER_SELECT`)

- [ ] **Step 1: Write DTOs**

```typescript
// src/users/dto/create-user.dto.ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
```

```typescript
// src/users/dto/update-user.dto.ts
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

(No `role` field anywhere — this API only manages MANAGER accounts; role is forced server-side.)

- [ ] **Step 2: Write the failing test `src/users/users.service.spec.ts`**

```typescript
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const manager = {
    id: 2,
    email: 'm@house.local',
    name: 'Manager',
    phone: null,
    role: 'MANAGER',
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('creates a manager with a hashed password and MANAGER role forced', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(manager);
    await service.create({
      email: 'm@house.local',
      password: 'Manager@123',
      name: 'Manager',
    });
    const args = prisma.user.create.mock.calls[0][0];
    expect(args.data.role).toBe('MANAGER');
    expect(args.data.password).not.toBe('Manager@123');
    expect(args.data.password).toMatch(/^\$2[aby]\$/);
    expect(args.select).toBeDefined();
  });

  it('rejects a duplicate email with ConflictException', async () => {
    prisma.user.findUnique.mockResolvedValue(manager);
    await expect(
      service.create({
        email: 'm@house.local',
        password: 'Manager@123',
        name: 'Manager',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('lists only MANAGER accounts', async () => {
    prisma.user.findMany.mockResolvedValue([manager]);
    await service.findAll();
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      role: 'MANAGER',
    });
  });

  it('refuses to update a non-MANAGER account', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...manager, role: 'ADMIN' });
    await expect(service.update(2, { name: 'X' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.update(99, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('bumps tokenVersion when the password is updated', async () => {
    prisma.user.findUnique.mockResolvedValue(manager);
    prisma.user.update.mockResolvedValue(manager);
    await service.update(2, { password: 'NewPass@123' });
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.data.tokenVersion).toEqual({ increment: 1 });
    expect(args.data.password).toMatch(/^\$2[aby]\$/);
  });

  it('refuses to delete a non-MANAGER account', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...manager, role: 'ADMIN' });
    await expect(service.remove(2)).rejects.toThrow(ForbiddenException);
  });

  it('deletes a manager', async () => {
    prisma.user.findUnique.mockResolvedValue(manager);
    prisma.user.delete.mockResolvedValue(manager);
    await expect(service.remove(2)).resolves.toHaveProperty('message');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/users/users.service.spec.ts`
Expected: FAIL — `Cannot find module './users.service'`.

- [ ] **Step 4: Write `src/users/users.service.ts`**

```typescript
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../auth/auth.service';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const MANAGER_ONLY = 'Chỉ có thể thao tác trên tài khoản quản lý';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { role: 'MANAGER' },
      orderBy: { createdAt: 'desc' },
      select: SAFE_USER_SELECT,
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email đã được sử dụng');

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        name: dto.name,
        phone: dto.phone,
        role: 'MANAGER',
      },
      select: SAFE_USER_SELECT,
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.assertManagedUser(id);

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Email đã được sử dụng');
      }
    }

    const { password, ...rest } = dto;
    const data: Prisma.UserUpdateInput = { ...rest };
    if (password) {
      data.password = await bcrypt.hash(password, SALT_ROUNDS);
      data.tokenVersion = { increment: 1 };
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }

  async remove(id: number): Promise<{ message: string }> {
    await this.assertManagedUser(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Đã xoá tài khoản' };
  }

  private async assertManagedUser(id: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.role !== 'MANAGER') throw new ForbiddenException(MANAGER_ONLY);
  }
}
```

(If the generated client does not export a `Prisma` namespace under this name, drop the `satisfies`/`Prisma.UserUpdateInput` typings and use plain object literals — behavior is identical.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/users/users.service.spec.ts` → PASS (8 tests).

- [ ] **Step 6: Write controller + module and register**

```typescript
// src/users/users.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
```

(If `@Roles('ADMIN')` fails type-checking because `Role` is a generated enum object rather than a string union, use `@Roles(Role.ADMIN)` with `import { Role } from '../generated/client';`.)

```typescript
// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

Add `UsersModule` to `AppModule.imports`.

- [ ] **Step 7: Manual smoke test**

Boot, login as admin, then:

```bash
curl -s -X POST localhost:3001/users -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"manager1@house.local","password":"Manager@123","name":"Nguyễn Văn A","phone":"0900000001"}'
```
Expected: 201 SafeUser with `role: "MANAGER"`, no password. `GET /users` lists it. Login as the manager, call `GET /users` with the manager token → 403.

- [ ] **Step 8: Run all unit tests and lint**

Run: `pnpm test && pnpm lint` → all green.

- [ ] **Step 9: Commit (apps/api repo)**

```bash
cd apps/api
git add src/users/ src/app.module.ts
git commit -m "feat: add admin-only users CRUD for manager accounts"
```

---

### Task 9: API e2e tests

**Files:**
- Create: `apps/api/test/auth.e2e-spec.ts`
- Delete: `apps/api/test/app.e2e-spec.ts` (scaffold test hits `/` only; superseded — keep if it still passes, otherwise fold the `/` check into the new spec and delete it)

**Interfaces:**
- Consumes: running MySQL (Task 1), migrated + seeded DB (Tasks 2–3), full AppModule.

- [ ] **Step 1: Write `test/auth.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@house.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const E2E_MANAGER_EMAIL = 'e2e-manager@test.local';

describe('Auth & Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let managerId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: E2E_MANAGER_EMAIL } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: E2E_MANAGER_EMAIL } });
    await app.close();
  });

  it('rejects a login with wrong credentials (generic message)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'definitely-wrong' })
      .expect(401);
    expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
  });

  it('logs in the seeded admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.password).toBeUndefined();
    adminToken = res.body.accessToken;
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the current user on /auth/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.email).toBe(ADMIN_EMAIL);
  });

  it('rejects /users without a token', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('lets the admin create a manager', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: E2E_MANAGER_EMAIL,
        password: 'Manager@123',
        name: 'E2E Manager',
      })
      .expect(201);
    expect(res.body.role).toBe('MANAGER');
    managerId = res.body.id;
  });

  it('rejects invalid create payloads (validation pipe)', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email', password: 'short', name: '' })
      .expect(400);
  });

  it('forbids a manager from listing users', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: E2E_MANAGER_EMAIL, password: 'Manager@123' })
      .expect(200);
    managerToken = login.body.accessToken;
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
  });

  it('invalidates existing tokens when the admin resets the manager password', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${managerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'Rotated@123' })
      .expect(200);
    // old manager token now fails the tokenVersion check
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(401);
  });

  it('lets the admin delete the manager', async () => {
    await request(app.getHttpServer())
      .delete(`/users/${managerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
```

- [ ] **Step 2: Run e2e**

Precondition: docker up, `pnpm prisma migrate dev` applied, `pnpm prisma db seed` run.
Run (cwd `apps/api`): `THROTTLE_AUTH_LIMIT=100 pnpm test:e2e`
Expected: all tests pass. (The env raises the per-minute login cap for the test run; see Task 6 Step 6.)

If the scaffold `test/app.e2e-spec.ts` fails (its `/` route is public so it should still pass), delete it and rely on the new spec.

- [ ] **Step 3: Commit (apps/api repo)**

```bash
cd apps/api
git add test/
git commit -m "test: add auth and users e2e coverage"
```

---

### Task 10: Web BFF — auth constants, API helper, session helper, Server Actions

**Files:**
- Create: `apps/web/lib/auth-constants.ts`, `apps/web/lib/api.ts`, `apps/web/features/auth/session.ts`, `apps/web/features/auth/actions.ts`, `apps/web/app/api/session/clear/route.ts`, `apps/web/.env.local`, `apps/web/.env.example`

**Interfaces:**
- Consumes: API from Tasks 6–8 at `API_URL`.
- Produces (used by every later web task):
  - `SESSION_COOKIE = 'hm_token'`, `SESSION_MAX_AGE_SECONDS` (lib/auth-constants — importable from `proxy.ts`, no `server-only`)
  - `apiFetch<T>(path: string, init?: RequestInit & { token?: string }): Promise<ApiResult<T>>` where `ApiResult<T> = { ok: boolean; status: number; data: T | null; error: string | null }`
  - `getSessionToken(): Promise<string | null>`, `getCurrentUser(): Promise<SessionUser | null>`, `SessionUser = { id: number; email: string; name: string; phone: string | null; role: 'ADMIN' | 'MANAGER' }`
  - Server Actions: `login(prev: AuthFormState, formData: FormData)`, `logout()`, `forgotPassword(prev, formData)`, `resetPassword(prev, formData)` with `AuthFormState = { error: string | null; success?: boolean }`
  - `GET /api/session/clear` route handler: deletes the cookie, redirects to `/login` (layouts cannot mutate cookies — they redirect here on stale sessions)

- [ ] **Step 1: Install server-only and write env files** (cwd `apps/web`)

```bash
pnpm add server-only
```

`apps/web/.env.local`:

```env
API_URL="http://localhost:3001"
```

`apps/web/.env.example`: same content with a `# Copy to .env.local` comment. Confirm `.env*` is gitignored by the Next scaffold (`grep env .gitignore`) — `.env.example` must be force-added later (`git add -f`) or listed as an exception; check the actual .gitignore pattern and if it's `.env*`, change it to explicit lines `.env` / `.env.local` / `.env*.local` so `.env.example` commits normally.

- [ ] **Step 2: Write `lib/auth-constants.ts`**

```typescript
export const SESSION_COOKIE = "hm_token";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches JWT_EXPIRES_IN
```

- [ ] **Step 3: Write `lib/api.ts`**

```typescript
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
```

- [ ] **Step 4: Write `features/auth/session.ts`**

```typescript
import "server-only";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER";
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const res = await apiFetch<SessionUser>("/auth/me", { token });
  return res.data;
}
```

- [ ] **Step 5: Write `features/auth/actions.ts`**

```typescript
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
  user: { id: number; email: string; name: string; role: string };
}

function safeNextPath(raw: FormDataEntryValue | null): string {
  const next = String(raw ?? "/");
  // only allow same-origin absolute paths — prevents open redirects
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const res = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: String(formData.get("email") ?? ""),
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
```

- [ ] **Step 6: Write `app/api/session/clear/route.ts`**

```typescript
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export async function GET(request: Request): Promise<NextResponse> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url));
}
```

- [ ] **Step 7: Verify build**

Run (cwd `apps/web`): `pnpm lint && pnpm build` → success (actions are not yet referenced by UI; that's fine).

- [ ] **Step 8: Commit (root repo, cwd repo root)**

```bash
git add apps/web
git commit -m "feat(web): add BFF auth layer - api client, session, server actions"
```

(This first web commit adds the whole `apps/web` app to the root repo — `apps/web/.gitignore` keeps `node_modules`/`.next`/`.env*` out. Verify with `git status` that nothing from `apps/api/` is staged.)

---

### Task 11: Web middleware — `proxy.ts` login gate

**Files:**
- Create: `apps/web/proxy.ts` (project root of the web app, next to `app/`)

**Interfaces:**
- Consumes: `SESSION_COOKIE` from `@/lib/auth-constants`.
- Produces: unauthenticated requests to any protected route (incl. `/`) → 307 to `/login?next=<pathname>`; authenticated visits to `/login` / `/forgot-password` → 307 to `/`.

- [ ] **Step 1: Write `apps/web/proxy.ts`**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/api/session/clear"];

/** Decode the JWT exp claim without verifying — verification happens at the API. */
function isTokenExpired(token: string): boolean {
  try {
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isLoggedIn = !!token && !isTokenExpired(token);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/forgot-password")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\..*).*)"],
};
```

- [ ] **Step 2: Verify manually**

Start both apps (`pnpm start:dev` in `apps/api`, `pnpm dev` in `apps/web`). In a browser (or `curl -sI`):
- `curl -sI localhost:3000/` → `307` with `location: /login`
- `curl -sI localhost:3000/users` → `307` with `location: /login?next=%2Fusers`
- `curl -sI localhost:3000/login` → `200`
- `curl -sI localhost:3000/reset-password` → `200`

- [ ] **Step 3: Commit (root repo)**

```bash
git add apps/web/proxy.ts
git commit -m "feat(web): add proxy middleware gating all admin routes behind login"
```

---

### Task 12: Wire login, forgot-password and reset-password UI

**Files:**
- Modify: `apps/web/features/auth/components/login-form.tsx`, `apps/web/features/auth/components/forgot-password-form.tsx`, `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/features/auth/components/reset-password-form.tsx`, `apps/web/app/(auth)/reset-password/page.tsx`

**Interfaces:**
- Consumes: `login`, `forgotPassword`, `resetPassword` actions and `AuthFormState` from `@/features/auth/actions` (Task 10).
- Produces: working login (`?next=` aware), forgot-password and reset-password flows.

- [ ] **Step 1: Update `app/(auth)/login/page.tsx`** (searchParams is async in Next 16)

```tsx
import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/"} />;
}
```

(Read the current file first — keep its existing metadata/layout wrapper if it differs; only the `searchParams` + prop pass-through must be added.)

- [ ] **Step 2: Rewrite `features/auth/components/login-form.tsx` to use the Server Action**

Keep the existing card markup, password show/hide toggle and Vietnamese copy exactly as-is; replace the mock submit with `useActionState`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { login, type AuthFormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Đăng nhập</CardTitle>
        <CardDescription>
          Nhập email và mật khẩu để truy cập trang quản trị
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="ban@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mật khẩu</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                minLength={8}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox id="remember" name="remember" />
            <Label htmlFor="remember" className="font-normal">
              Ghi nhớ đăng nhập
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Đăng nhập
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

(Error shown inline under the field per form UX guidelines, with `role="alert"` for screen readers. `minLength` raised to 8 to match the API DTO.)

- [ ] **Step 3: Rewrite `features/auth/components/forgot-password-form.tsx`**

Keep both card states (form / success) and all Vietnamese copy; replace the mock with the action:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import {
  forgotPassword,
  type AuthFormState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPassword,
    initialState,
  );

  if (state.success) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" />
          </div>
          <CardTitle className="text-xl">Kiểm tra email của bạn</CardTitle>
          <CardDescription>
            Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại
            mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục spam).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Quay lại đăng nhập
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Quên mật khẩu</CardTitle>
        <CardDescription>
          Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="ban@example.com"
              autoComplete="email"
              required
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Gửi liên kết đặt lại
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Quay lại đăng nhập
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

(The success card no longer echoes the submitted email — the API is enumeration-safe and the UI copy now matches: "nếu email tồn tại".)

- [ ] **Step 4: Create `features/auth/components/reset-password-form.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

import {
  resetPassword,
  type AuthFormState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { error: null };

export function ResetPasswordForm({ token }: { token: string }) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, formAction, pending] = useActionState(
    resetPassword,
    initialState,
  );

  if (state.success) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>
          <CardTitle className="text-xl">Đặt lại mật khẩu thành công</CardTitle>
          <CardDescription>
            Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <Link href="/login">Đăng nhập</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Đặt lại mật khẩu</CardTitle>
        <CardDescription>Nhập mật khẩu mới cho tài khoản của bạn</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <div className="grid gap-2">
            <Label htmlFor="password">Mật khẩu mới</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Nhập lại mật khẩu mới</Label>
            <Input
              id="confirm"
              name="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Đặt lại mật khẩu
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Quay lại đăng nhập
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create `app/(auth)/reset-password/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Liên kết không hợp lệ</CardTitle>
          <CardDescription>
            Liên kết đặt lại mật khẩu bị thiếu hoặc không đúng. Vui lòng yêu cầu
            liên kết mới.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <Link href="/forgot-password">Yêu cầu liên kết mới</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm token={token} />;
}
```

- [ ] **Step 6: Verify the full flow manually**

With api + web + docker running:
1. Visit `localhost:3000/login`, log in with `admin@house.local` / `Admin@12345` → lands on `/` (dashboard).
2. Wrong password → inline error "Email hoặc mật khẩu không đúng".
3. `/forgot-password` → submit admin email → success card; open Mailhog (`localhost:8025`), click the reset link → reset form; set a new password → success card → log in with the new password.
4. Old session (previous browser tab, if any) gets 401 → redirected via `/api/session/clear` once Task 13 lands (for now `/auth/me` calls just return null).

- [ ] **Step 7: Lint, build, commit (root repo)**

```bash
cd apps/web && pnpm lint && pnpm build && cd ../..
git add apps/web
git commit -m "feat(web): wire login, forgot-password and reset-password to the API"
```

---

### Task 13: Admin layout auth — /auth/me, role-aware sidebar, working logout

**Files:**
- Modify: `apps/web/app/(admin)/layout.tsx`, `apps/web/lib/navigation.ts`, `apps/web/components/layout/app-sidebar.tsx`, `apps/web/components/layout/site-header.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `SessionUser` (Task 10), `logout` action (Task 10), `/api/session/clear` (Task 10).
- Produces: `AppSidebar` takes `role: SessionUser["role"]` prop; `SiteHeader` takes `user: { name: string; email: string }` prop; `NavItem` gains optional `adminOnly?: boolean`.

- [ ] **Step 1: Add the admin-only nav flag in `lib/navigation.ts`**

Update the `NavItem` interface and add the users entry to the "Quản lý" group:

```typescript
import {
  Building2,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Only rendered for ADMIN users. */
  adminOnly?: boolean;
}
```

and in `ADMIN_NAV`, group "Quản lý", append after "Bảo trì":

```typescript
{ title: "Người dùng", href: "/users", icon: UserCog, adminOnly: true },
```

- [ ] **Step 2: Make `app/(admin)/layout.tsx` session-aware**

```tsx
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/features/auth/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    // stale/invalid cookie — the clear route deletes it and sends us to /login
    redirect("/api/session/clear");
  }

  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset>
        <SiteHeader user={{ name: user.name, email: user.email }} />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 3: Filter nav by role in `components/layout/app-sidebar.tsx`**

Change the signature and the group rendering (rest of the file unchanged):

```tsx
import type { SessionUser } from "@/features/auth/session";

export function AppSidebar({ role }: { role: SessionUser["role"] }) {
  const pathname = usePathname();

  const visibleGroups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || role === "ADMIN"),
  })).filter((group) => group.items.length > 0);
```

then render `visibleGroups.map(...)` instead of `ADMIN_NAV.map(...)`.

Note: `SessionUser` is imported as a **type only** from a `server-only` module — `import type` is erased at compile time so the client bundle is unaffected. If the toolchain still complains, define `type Role = "ADMIN" | "MANAGER"` locally instead.

- [ ] **Step 4: Real user + logout in `components/layout/site-header.tsx`**

- Add prop: `export function SiteHeader({ user }: { user: { name: string; email: string } })`.
- Replace the hardcoded `AvatarFallback` text `AD` with the user's initials: `{user.name.split(" ").map((w) => w[0]).slice(-2).join("").toUpperCase()}`.
- Replace the hardcoded `Quản trị viên` / `admin@example.com` in `DropdownMenuLabel` with `{user.name}` / `{user.email}`.
- Replace the logout item: add `import { logout } from "@/features/auth/actions";`, drop the `useRouter` import/usage, and:

```tsx
<DropdownMenuItem
  variant="destructive"
  onSelect={() => void logout()}
>
  <LogOut />
  Đăng xuất
</DropdownMenuItem>
```

- [ ] **Step 5: Verify**

- Log in as admin → sidebar shows "Người dùng"; header shows real name/email; "Đăng xuất" returns to `/login` and `/` now redirects to login again.
- Create a manager (Task 8 curl or wait for Task 14), log in as manager → no "Người dùng" item.
- Delete the `hm_token` cookie value manually in devtools and replace with garbage → visiting `/` redirects through `/api/session/clear` to `/login` (no redirect loop).

- [ ] **Step 6: Lint, build, commit (root repo)**

```bash
cd apps/web && pnpm lint && pnpm build && cd ../..
git add apps/web
git commit -m "feat(web): session-aware admin layout, role-filtered nav and real logout"
```

---

### Task 14: /users management page (ADMIN only)

**Files:**
- Create: `apps/web/features/users/types.ts`, `apps/web/features/users/actions.ts`, `apps/web/features/users/components/users-table.tsx`, `apps/web/features/users/components/user-form-dialog.tsx`, `apps/web/features/users/components/delete-user-dialog.tsx`, `apps/web/app/(admin)/users/page.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /users` (Task 8), `getSessionToken`/`getCurrentUser` (Task 10), `PageHeader` (`@/components/shared/page-header`), shadcn `table`, `dialog`, `alert-dialog`, `badge`, `dropdown-menu`, `switch`.
- Produces:
  - `ManagedUser = { id: number; email: string; name: string; phone: string | null; role: "ADMIN" | "MANAGER"; isActive: boolean; createdAt: string }`
  - Server actions `createUser(prev, formData)`, `updateUser(prev, formData)` (reads `id` from a hidden field; empty password field = keep password), `deleteUser(id: number)`, `toggleUserActive(id: number, isActive: boolean)` — all `revalidatePath("/users")` and return `UserFormState = { error: string | null; success?: boolean }`.

- [ ] **Step 1: Add the alert-dialog primitive** (cwd `apps/web`)

```bash
pnpm dlx shadcn add alert-dialog
```

- [ ] **Step 2: Write `features/users/types.ts`**

```typescript
export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER";
  isActive: boolean;
  createdAt: string;
}
```

- [ ] **Step 3: Write `features/users/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/features/auth/session";
import type { ManagedUser } from "./types";

export interface UserFormState {
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

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const res = await authedFetch<ManagedUser>("/users", {
    method: "POST",
    body: JSON.stringify({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      ...(phone ? { phone } : {}),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}

export async function updateUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const res = await authedFetch<ManagedUser>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      phone: phone || undefined,
      ...(password ? { password } : {}),
    }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}

export async function toggleUserActive(
  id: number,
  isActive: boolean,
): Promise<UserFormState> {
  const res = await authedFetch<ManagedUser>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}

export async function deleteUser(id: number): Promise<UserFormState> {
  const res = await authedFetch<{ message: string }>(`/users/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/users");
  return { error: null, success: true };
}
```

- [ ] **Step 4: Write `features/users/components/user-form-dialog.tsx`**

One dialog for both create and edit (controlled by whether `user` is passed):

```tsx
"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createUser,
  updateUser,
  type UserFormState,
} from "@/features/users/actions";
import type { ManagedUser } from "@/features/users/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: UserFormState = { error: null };

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this user; otherwise it creates a new one. */
  user?: ManagedUser;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const isEdit = !!user;
  const action = isEdit ? updateUser : createUser;
  const [state, formAction, pending] = useActionState(action, initialState);
  const lastSuccess = React.useRef(false);

  React.useEffect(() => {
    if (state.success && !lastSuccess.current) {
      lastSuccess.current = true;
      toast.success(isEdit ? "Đã cập nhật tài khoản" : "Đã tạo tài khoản quản lý");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa tài khoản quản lý" : "Thêm tài khoản quản lý"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin tài khoản. Để trống mật khẩu nếu không đổi."
              : "Tài khoản mới sẽ có vai trò Quản lý."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? <input type="hidden" name="id" value={user.id} /> : null}
          <div className="grid gap-2">
            <Label htmlFor="user-name">
              Họ tên <span className="text-destructive">*</span>
            </Label>
            <Input
              id="user-name"
              name="name"
              defaultValue={user?.name}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="user-email"
              name="email"
              type="email"
              defaultValue={user?.email}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-phone">Số điện thoại</Label>
            <Input
              id="user-phone"
              name="phone"
              type="tel"
              defaultValue={user?.phone ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-password">
              Mật khẩu {isEdit ? "" : <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="user-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required={!isEdit}
            />
            <p className="text-xs text-muted-foreground">
              Tối thiểu 8 ký tự.
              {isEdit ? " Đổi mật khẩu sẽ đăng xuất người dùng này." : ""}
            </p>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Tạo tài khoản"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Implementation note: `useActionState` state persists per mounted component — mount the dialog with a `key` (`key={editingUser?.id ?? "create"}`) from the parent so switching targets resets state.

- [ ] **Step 5: Write `features/users/components/delete-user-dialog.tsx`**

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteUser } from "@/features/users/actions";
import type { ManagedUser } from "@/features/users/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteUserDialogProps {
  user: ManagedUser | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteUserDialog({ user, onOpenChange }: DeleteUserDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm() {
    if (!user) return;
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá tài khoản");
      }
      onOpenChange(false);
    });
  }

  return (
    <AlertDialog open={!!user} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá tài khoản quản lý?</AlertDialogTitle>
          <AlertDialogDescription>
            Tài khoản <span className="font-medium">{user?.email}</span> sẽ bị
            xoá vĩnh viễn. Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá tài khoản
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 6: Write `features/users/components/users-table.tsx`**

```tsx
"use client";

import * as React from "react";
import { MoreHorizontal, Plus, UserCog } from "lucide-react";
import { toast } from "sonner";

import { toggleUserActive } from "@/features/users/actions";
import type { ManagedUser } from "@/features/users/types";
import { DeleteUserDialog } from "./delete-user-dialog";
import { UserFormDialog } from "./user-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function UsersTable({ users }: { users: ManagedUser[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = React.useState<ManagedUser | null>(null);
  const [, startTransition] = React.useTransition();

  function handleToggleActive(user: ManagedUser) {
    startTransition(async () => {
      const result = await toggleUserActive(user.id, !user.isActive);
      if (result.error) toast.error(result.error);
      else
        toast.success(
          user.isActive ? "Đã khoá tài khoản" : "Đã mở khoá tài khoản",
        );
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm quản lý
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <UserCog className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có tài khoản quản lý nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm tài khoản quản lý đầu tiên để bắt đầu.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Thêm quản lý
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.phone ?? "—"}</TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline">Đang hoạt động</Badge>
                    ) : (
                      <Badge variant="destructive">Đã khoá</Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Thao tác với ${user.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditingUser(user)}>
                          Sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleToggleActive(user)}>
                          {user.isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeletingUser(user)}
                        >
                          Xoá
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UserFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <UserFormDialog
        key={editingUser?.id ?? "edit-none"}
        open={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
        user={editingUser ?? undefined}
      />
      <DeleteUserDialog
        user={deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      />
    </>
  );
}
```

- [ ] **Step 7: Write `app/(admin)/users/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { UsersTable } from "@/features/users/components/users-table";
import type { ManagedUser } from "@/features/users/types";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = { title: "Người dùng" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/clear");
  // hiding the menu is not the security boundary — enforce role here too
  if (user.role !== "ADMIN") redirect("/");

  const token = await getSessionToken();
  const res = await apiFetch<ManagedUser[]>("/users", { token: token ?? undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Người dùng"
        description="Quản lý các tài khoản quản lý trong hệ thống"
      />
      <UsersTable users={res.data ?? []} />
    </div>
  );
}
```

- [ ] **Step 8: Verify the CRUD flow manually**

As admin: `/users` shows the empty state → create a manager (validation errors surface inline, e.g. duplicate email) → row appears → edit name/phone → toggle "Khoá tài khoản" → try logging in as that manager in a private window → generic 401 error. Unlock, log in as manager → no "Người dùng" nav; typing `/users` in the URL bar redirects to `/`. Delete the manager → confirm dialog → row gone.

- [ ] **Step 9: Lint, build, commit (root repo)**

```bash
cd apps/web && pnpm lint && pnpm build && cd ../..
git add apps/web
git commit -m "feat(web): add admin users management page with CRUD dialogs"
```

---

### Task 15: Claude security rules file

**Files:**
- Create: `.claude/rules/security.md` (repo root)

- [ ] **Step 1: Write `.claude/rules/security.md`**

```markdown
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
```

- [ ] **Step 2: Commit (root repo)**

```bash
git add .claude/rules/security.md
git commit -m "docs: add mandatory security rules for Claude"
```

---

### Task 16: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: API checks** (cwd `apps/api`)

```bash
pnpm lint && pnpm build && pnpm test
THROTTLE_AUTH_LIMIT=100 pnpm test:e2e
```
Expected: all green.

- [ ] **Step 2: Web checks** (cwd `apps/web`)

```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 3: End-to-end manual smoke test**

With docker + both dev servers running, walk the full journey once: login gate on `/` → login as admin → dashboard → "Người dùng" → create manager → logout → login as manager (no users menu, `/users` redirects) → logout → forgot password → Mailhog link → reset → login with new password.

- [ ] **Step 4: Verify repo hygiene**

- Root repo: `git status` — no `apps/api` gitlink staged, no `.env*` files tracked (only `.env.example`).
- `apps/api` repo: `git status` — clean; `src/generated/` and `.env` untracked.

- [ ] **Step 5: Report**

Summarize results against the spec's Testing section; list any deviations from this plan that were needed.
