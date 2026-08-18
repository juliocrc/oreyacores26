#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /app/data

# Detect PostgreSQL vs SQLite
if echo "$DATABASE_URL" | grep -qE "^postgresql://"; then
  echo "PostgreSQL detected — applying schema via psql..."
  psql "$DATABASE_URL" -f /app/prisma/schema.sql 2>&1 || echo "psql schema warning (non-fatal)"
else
  echo "SQLite detected — skipping psql."
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
