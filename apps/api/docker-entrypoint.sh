#!/bin/sh
set -e

echo "▶ Applying database migrations (prisma migrate deploy)..."
pnpm exec prisma migrate deploy

# Run the compiled seed rather than `prisma db seed`: that config entry shells
# out to ts-node, which cannot resolve the generated client's `./internal/*.js`
# requires against the .ts sources shipped in the image.
echo "▶ Seeding admin account (idempotent)..."
node dist/prisma/seed.js

echo "▶ Starting API on port ${PORT:-3001}..."
exec node dist/src/main.js
