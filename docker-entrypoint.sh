#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /app/data

# Detect PostgreSQL vs SQLite
if echo "$DATABASE_URL" | grep -qE "^postgresql://"; then
  echo "PostgreSQL detected — regenerating Prisma client for PostgreSQL..."
  npx prisma generate --schema prisma/schema.postgresql.prisma 2>&1 || true
  echo "Running prisma migrate deploy for PostgreSQL..."
  npx prisma migrate deploy --schema prisma/schema.postgresql.prisma 2>&1 || echo "prisma migrate warning (non-fatal)"
else
  echo "SQLite detected — running prisma db push..."
  npx prisma db push --accept-data-loss --skip-generate 2>&1 || echo "prisma db push warning (non-fatal)"
fi

# Start the Next.js server
echo "Starting server..."
exec node server.js
