#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /app/data

# Detect prisma binary
if [ -x "./node_modules/.bin/prisma" ]; then
  PRISMA_CMD="./node_modules/.bin/prisma"
else
  PRISMA_CMD="node ./node_modules/prisma/build/index.js"
fi

# Detect PostgreSQL vs SQLite
if echo "$DATABASE_URL" | grep -qE "^postgresql://"; then
  echo "PostgreSQL detected — regenerating Prisma client for PostgreSQL..."
  $PRISMA_CMD generate --schema prisma/schema.postgresql.prisma 2>&1 || true
  echo "Running prisma db push for PostgreSQL..."
  $PRISMA_CMD db push --schema prisma/schema.postgresql.prisma --accept-data-loss 2>&1 || echo "prisma db push warning (non-fatal)"
  echo "Running prisma migrate deploy for PostgreSQL..."
  $PRISMA_CMD migrate deploy --schema prisma/schema.postgresql.prisma 2>&1 || echo "prisma migrate warning (non-fatal)"
else
  echo "SQLite detected — running prisma db push..."
  $PRISMA_CMD db push --accept-data-loss --skip-generate 2>&1 || echo "prisma db push warning (non-fatal)"
fi

# Seed admin password if env var is set
if [ -n "$ADMIN_SEED_EMAIL" ] && [ -n "$ADMIN_SEED_PASSWORD" ]; then
  echo "Seeding admin password for $ADMIN_SEED_EMAIL..."
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    const prisma = new PrismaClient();
    (async () => {
      const user = await prisma.user.findUnique({ where: { email: process.env.ADMIN_SEED_EMAIL } });
      if (user && !user.passwordHash) {
        const hash = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD, 12);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
        console.log('Admin password seeded successfully.');
      } else if (user && user.passwordHash) {
        console.log('Admin already has a password — skipping.');
      } else {
        console.log('Admin user not found — creating...');
        const hash = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD, 12);
        await prisma.user.create({
          data: {
            email: process.env.ADMIN_SEED_EMAIL,
            name: 'Admin',
            passwordHash: hash,
            role: 'ADMIN',
            lastLoginAt: new Date(),
          },
        });
        console.log('Admin user created with password.');
      }
      await prisma.\$disconnect();
    })().catch(e => { console.error('Admin seed failed:', e.message); process.exit(0); });
  " 2>&1 || echo "Admin seed warning (non-fatal)"
fi

# Start the Next.js server
echo "Starting server..."
exec node server.js
