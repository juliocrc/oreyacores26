# ── Stage 1: Dependencies ─────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY scripts/patch-prisma-types.cjs ./scripts/patch-prisma-types.cjs
COPY scripts/sync_schema_sqlite.js ./scripts/sync_schema_sqlite.js

RUN npm ci --ignore-scripts && \
    npx prisma generate && \
    node scripts/patch-prisma-types.cjs && \
    node scripts/sync_schema_sqlite.js

# ── Stage 2: Build ───────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV PRISMA_DISABLE_WARNINGS=1
ENV NODE_ENV=production
ENV DATABASE_URL=file:./local.db

RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy prisma schema for runtime db push + entrypoint
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Ensure data directories exist and are writable
RUN mkdir -p /app/data /app/public/uploads /app/public/certificados-externos && \
    chown -R nextjs:nodejs /app/data /app/public /app/prisma

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
