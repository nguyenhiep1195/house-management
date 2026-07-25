#!/bin/sh
set -e

echo "▶ Applying database migrations (prisma migrate deploy)..."
pnpm exec prisma migrate deploy

echo "▶ Seeding admin account (idempotent)..."
pnpm exec prisma db seed

echo "▶ Starting API on port ${PORT:-3001}..."
exec node dist/src/main.js
