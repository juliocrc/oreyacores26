import prisma from './lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
