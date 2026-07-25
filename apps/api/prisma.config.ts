import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    // Optional — only needed for `prisma migrate diff --from-migrations`
    // / `migrate dev`. Read via process.env so the value may be absent
    // (env() would throw and break the Docker entrypoint).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
