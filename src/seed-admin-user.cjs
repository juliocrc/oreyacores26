const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async () => {
  const prisma = new PrismaClient();
  try {
    const email = 'julio.correia@orey.com';
    const plain = 'cabouco321';
    const name = 'Julio Correia';

    const hash = await bcrypt.hash(plain, 10);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        role: 'ADMIN',
        passwordHash: hash,
        updatedAt: new Date(),
      },
      create: {
        email,
        name,
        role: 'ADMIN',
        passwordHash: hash,
      },
    });

    console.log(`Upserted admin user id=${user.id} email=${user.email}`);
  } catch (e) {
    console.error('Seed error:', e);
    process.exitCode = 1;
  } finally {
    try { await (new PrismaClient()).$disconnect(); } catch {};
  }
})();
