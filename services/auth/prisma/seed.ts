/**
 * prisma/seed.ts – creates one ADMIN user from env vars.
 *
 * Admins cannot self-register through the public API, so this seed is the
 * only way to bootstrap the first admin account.
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=admin@ticksy.local \
 *   SEED_ADMIN_PASSWORD=ChangeMe123!     \
 *   SEED_ADMIN_NAME="Platform Admin"     \
 *   npx tsx prisma/seed.ts
 *
 * Or add to package.json scripts and run: npm run seed
 *
 * Safe to run multiple times – uses upsert so existing admin is not
 * duplicated.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email    = process.env['SEED_ADMIN_EMAIL']    ?? 'admin@ticksy.local';
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'ChangeMe123!';
  const name     = process.env['SEED_ADMIN_NAME']     ?? 'Platform Admin';

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where:  { email },
    update: { passwordHash, name },
    create: {
      email,
      passwordHash,
      name,
      role:       'ADMIN',
      isVerified: true,
    },
  });

  console.log(`✅ Admin user ready: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
