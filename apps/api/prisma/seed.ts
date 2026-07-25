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

    // Ensure exactly one default fee type ("Loại I") exists. `db push` renames
    // the old single settings row into a FeeSetting via the name default; this
    // marks it as default and backfills references that were left NULL.
    let defaultFee = await prisma.feeSetting.findFirst({
      where: { isDefault: true },
      orderBy: { id: 'asc' },
    });
    if (!defaultFee) {
      const any = await prisma.feeSetting.findFirst({ orderBy: { id: 'asc' } });
      defaultFee = any
        ? await prisma.feeSetting.update({
            where: { id: any.id },
            data: { isDefault: true },
          })
        : await prisma.feeSetting.create({
            data: { name: 'Loại I', isDefault: true },
          });
      console.log(`Ensured default fee type "${defaultFee.name}"`);
    } else {
      console.log(`Default fee type "${defaultFee.name}" already exists`);
    }

    // Point any orphaned history / rooms at the default fee type.
    const historyBackfill = await prisma.feeSettingHistory.updateMany({
      where: { feeSettingId: null },
      data: { feeSettingId: defaultFee.id },
    });
    const roomsBackfill = await prisma.room.updateMany({
      where: { feeSettingId: null },
      data: { feeSettingId: defaultFee.id },
    });
    if (historyBackfill.count || roomsBackfill.count) {
      console.log(
        `Backfilled ${historyBackfill.count} history + ${roomsBackfill.count} rooms to "${defaultFee.name}"`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
