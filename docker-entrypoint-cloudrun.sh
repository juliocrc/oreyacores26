#!/bin/sh
set -e

# Cloud Run entrypoint - PostgreSQL mode
# DATABASE_URL is provided as an environment variable from Cloud Run / Neon

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set. Please configure it in Cloud Run env vars."
  exit 1
fi

# Schema changes are an approved release operation, never a startup fallback.
# The repository also contains provider-specific migrations: do not replay the
# SQLite migration history or run db push against the production database.
echo "Checking PostgreSQL schema compatibility..."
node /app/scripts/check-runtime-database.cjs

echo "Starting server..."
exec node server.js
