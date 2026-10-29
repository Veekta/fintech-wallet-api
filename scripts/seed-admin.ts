import 'dotenv/config';
import * as argon2 from 'argon2';
import { db } from '../dist/prisma/db.js';

async function main() {
  const email = process.env['ADMIN_EMAIL']?.trim().toLowerCase();
  const password = process.env['ADMIN_PASSWORD'];
  const name = process.env['ADMIN_NAME']?.trim();

  if (!email || !password || !name) {
    throw new Error(
      'Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME before running this script.',
    );
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const existingUser = await db.orm.public.User.first({ email });

  if (existingUser) {
    throw new Error(
      `An account already exists for ${email}. No changes were made.`,
    );
  }

  const passwordHash = await argon2.hash(password);

  const user = await db.transaction(async (tx) => {
    const createdUser = await tx.orm.public.User.create({
      email,
      passwordHash,
      name,
      role: 'ADMIN',
    });

    await tx.orm.public.Wallet.create({
      userId: createdUser.id,
    });

    return createdUser;
  });

  console.log('Admin account created successfully.');
  console.log(`Email: ${user.email}`);
  console.log(`Role: ${user.role}`);
  console.log('Wallet: created');
}

main().catch((error: unknown) => {
  console.error('Admin seed failed:', error);
  process.exitCode = 1;
});
