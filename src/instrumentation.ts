import * as Sentry from '@sentry/nextjs';

export async function register() {
  console.log(`[Instrumentation] register() chamado. NEXT_RUNTIME=${process.env.NEXT_RUNTIME}, NEXT_PHASE=${process.env.NEXT_PHASE}`);

    if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');

    // Aquecer a ligacao Prisma antes de o servidor comecar a aceitar pedidos.
    // Isto evita falhas do motor quando o dashboard dispara multiplas queries
    // em paralelo durante o primeiro carregamento.
    try {
      console.log('[Instrumentation] A iniciar warmup Prisma...');
      const { ensurePrismaConnected } = await import('./lib/prisma');
      await ensurePrismaConnected();
      console.log('[Instrumentation] Warmup Prisma concluido.');
    } catch (err) {
      console.error('[Instrumentation] Falha no warmup Prisma:', err);
    }

    // Aplicar modo WAL + busy_timeout na BD SQLite local (ignorado se Postgres).
    try {
      const { applySqlitePragmas } = await import('./lib/sqlite-pragmas');
      const pragmaResult = await applySqlitePragmas();
      if (pragmaResult.applied) {
        console.log('[Instrumentation] PRAGMAs SQLite aplicados (WAL/synchronous/busy_timeout).');
      } else if (pragmaResult.error) {
        console.error('[Instrumentation] Falha ao aplicar PRAGMAs SQLite:', pragmaResult.error);
      }
    } catch (err) {
      console.error('[Instrumentation] Falha ao aplicar PRAGMAs SQLite:', err);
    }

    // Start database backup scheduler hourly on server startup
    const phase = process.env.NEXT_PHASE;
    if (phase === 'phase-development-server' || phase === 'phase-production-server') {
      try {
        const { startBackupScheduler } = await import('../scripts/db_backup');
        startBackupScheduler();
      } catch (err) {
        console.error('[Backup] Failed to start backup scheduler:', err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
