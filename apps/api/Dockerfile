# syntax=docker/dockerfile:1

# ---- builder: install all deps (with native build tools) and compile ----
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
WORKDIR /app

# toolchain for native modules (bcrypt, mariadb)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

# install against the lockfile first for better layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# copy sources and build (regenerate the Prisma client for linux, then compile).
# prisma.config.ts resolves env('DATABASE_URL') at load time, so `generate`
# needs a placeholder — it never connects. The real URL is injected at runtime.
COPY . .
RUN DATABASE_URL="mysql://placeholder:placeholder@localhost:3306/placeholder" \
  pnpm exec prisma generate \
  && pnpm run build

# ---- runner: slim image without the build toolchain ----
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
WORKDIR /app

# Prisma engines look up the OpenSSL version; provide it to avoid warnings.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

# bring the fully-installed, compiled app across. node_modules keeps the Prisma
# CLI + ts-node that the entrypoint needs for `migrate deploy` and seeding.
COPY --from=builder /app ./

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
