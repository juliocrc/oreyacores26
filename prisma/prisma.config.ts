import 'dotenv/config';

function resolvePrismaDatasourceUrl() {
  return (
    process.env.DIRECT_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.VERCEL_POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.VERCEL_POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.gestornavalpro_DATABASE_URL ||
    process.env.GESTOR_DB ||
    process.env.gestornavalpro_POSTGRES_URL ||
    ''
  ).trim();
}

const config = {
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: resolvePrismaDatasourceUrl(),
  },
  seed: {
    run: 'ts-node prisma/seed_all.ts',
  },
};

export default config;
