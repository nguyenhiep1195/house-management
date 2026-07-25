import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/client';

const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin';
  const email = process.env.SEED_ADMIN_EMAIL || null;

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
  const prisma = new PrismaClient({ adapter });
  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log(`Admin "${username}" already exists, skipping seed`);
    } else {
      await prisma.user.create({
        data: {
          username,
          email,
          password: await bcrypt.hash(password, SALT_ROUNDS),
          name: 'Quản trị viên',
          role: 'ADMIN',
        },
      });
      console.log(`Seeded admin "${username}"`);
    }

    const settingCount = await prisma.setting.count();
    if (settingCount === 0) {
      await prisma.setting.create({ data: {} });
      console.log('Seeded default settings');
    } else {
      console.log('Settings already exist, skipping seed');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
