type DatabaseEnvName =
  | "POSTGRES_URL"
  | "POSTGRES_PRISMA_URL"
  | "POSTGRES_URL_NON_POOLING"
  | "VERCEL_POSTGRES_URL"
  | "VERCEL_POSTGRES_PRISMA_URL"
  | "NEON_DATABASE_URL"
  | "SUPABASE_DATABASE_URL"
  | "DATABASE_URL"
  | "DIRECT_URL"
  | "gestornavalpro_DATABASE_URL"
  | "GESTOR_DB"
  | "gestornavalpro_POSTGRES_URL";

type DatabaseUrlResolution = {
  connectionString: string | null;
  source: DatabaseEnvName | null;
};

const RUNTIME_DATABASE_ENV_ORDER: DatabaseEnvName[] = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "VERCEL_POSTGRES_URL",
  "VERCEL_POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
  "SUPABASE_DATABASE_URL",
  "DATABASE_URL",
  "DIRECT_URL",
  "gestornavalpro_DATABASE_URL",
  "GESTOR_DB",
  "gestornavalpro_POSTGRES_URL",
];

const CLI_DATABASE_ENV_ORDER: DatabaseEnvName[] = [
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "VERCEL_POSTGRES_URL",
  "VERCEL_POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
  "SUPABASE_DATABASE_URL",
  "DATABASE_URL",
  "gestornavalpro_DATABASE_URL",
  "GESTOR_DB",
  "gestornavalpro_POSTGRES_URL",
];

function resolveFromEnv(order: DatabaseEnvName[]): DatabaseUrlResolution {
  for (const name of order) {
    const value = process.env[name]?.trim();
    if (value) {
      return {
        connectionString: value,
        source: name,
      };
    }
  }

  return {
    connectionString: null,
    source: null,
  };
}

export function resolveRuntimeDatabaseUrl() {
  return resolveFromEnv(RUNTIME_DATABASE_ENV_ORDER);
}

export function resolveCliDatabaseUrl() {
  return resolveFromEnv(CLI_DATABASE_ENV_ORDER);
}

export function getSupportedDatabaseEnvNames() {
  return [...new Set([...CLI_DATABASE_ENV_ORDER, ...RUNTIME_DATABASE_ENV_ORDER])];
}