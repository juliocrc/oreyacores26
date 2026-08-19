#!/bin/bash
set -e

echo "==> Render build: installing dependencies"
npm ci

echo "==> Render build: generating Prisma client for PostgreSQL"
npx prisma generate --schema prisma/schema.postgresql.prisma

echo "==> Render build: syncing database schema (idempotent)"
npx prisma db push --schema prisma/schema.postgresql.prisma --skip-generate

echo "==> Render build: building Next.js"
npm run build

echo "==> Render build: copying static assets for standalone"
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> Render build: done"
