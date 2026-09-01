import { PrismaClient } from "@prisma/client";
import { resolveRuntimeDatabaseUrl } from "@/lib/resolve-database-url";
import {
  syncClienteNumeroFromExterno,
  extractNumeroClienteExterno,
} from "@/lib/sync-cliente-numero";

if (process.env.NODE_ENV === "production" && !process.env.PRISMA_DISABLE_WARNINGS) {
  process.env.PRISMA_DISABLE_WARNINGS = "1";
}

type GlobalWithPrisma = typeof globalThis & {
  prisma?: PrismaClient;
  prismaConnectPromise?: Promise<void>;
};
const globalForPrisma = globalThis as GlobalWithPrisma;

const { connectionString: resolvedUrl } = resolveRuntimeDatabaseUrl();
const activeUrl = resolvedUrl || process.env.DATABASE_URL || "";
const isSQLite = activeUrl.startsWith("file:");

function stripInsensitiveMode(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((it) => stripInsensitiveMode(it));
  }
  if (obj instanceof Date) {
    return obj;
  }
  const cleaned: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (key === "mode" && (value === "insensitive" || value === "default")) {
      continue;
    }
    cleaned[key] = stripInsensitiveMode(value);
  }
  return cleaned;
}

function wrapWithSQLiteProxy(rawClient: PrismaClient): PrismaClient {
  return new Proxy(rawClient as object, {
    get(target: unknown, prop: string | symbol) {
      const origValue = (target as Record<string, unknown>)[String(prop)];
      if (origValue === null || origValue === undefined) {
        return origValue;
      }

      // Interceptar os delegados dos modelos (como prisma.navio, prisma.inspecao, etc.)
      if (typeof origValue === "object" && typeof prop === "string" && !prop.startsWith("$")) {
        return new Proxy(origValue as object, {
          get(modelTarget: unknown, modelProp: string | symbol) {
            const origMethod = (modelTarget as Record<string, unknown>)[String(modelProp)];
            if (typeof origMethod === "function") {
              const fn = origMethod as (...args: unknown[]) => unknown;
              return function (...args: unknown[]) {
                const cleanedArgs = (args as unknown[]).map(stripInsensitiveMode);
                return fn.apply(modelTarget, cleanedArgs as unknown[]);
              };
            }
            return origMethod;
          },
        });
      }

      if (typeof origValue === "function") {
        const fn = origValue as (...args: unknown[]) => unknown;
        return fn.bind(target);
      }

      return origValue;
    },
  }) as unknown as PrismaClient;
}

function attachClienteNumeroSync(rawClient: PrismaClient): PrismaClient {
  async function afterWrite(row: unknown, dataClienteId?: unknown): Promise<unknown> {
    try {
      if (row && typeof row === "object") {
        const record = row as Record<string, unknown>;
        const externo = extractNumeroClienteExterno(record["metadados"]);
        const clienteId = record["clienteId"] ?? dataClienteId;
        if (externo && clienteId) {
          // Ensure clienteId is a number before calling sync; convert if possible
          const cid = typeof clienteId === "number" ? clienteId : Number(String(clienteId));
          if (!Number.isNaN(cid)) {
            await syncClienteNumeroFromExterno(rawClient, cid, externo);
          }
        }
      }
    } catch {
      // não deve interromper a escrita principal
    }
    return row;
  }

  const extended = rawClient.$extends({
    query: {
      ordemServico: {
        async create({ args, query }: { args?: unknown; query: (a?: unknown) => Promise<unknown> }) {
          const result = await query(args);
          const clienteId = getClienteIdFromArgs(args);
          return afterWrite(result, clienteId);
        },
        async update({ args, query }: { args?: unknown; query: (a?: unknown) => Promise<unknown> }) {
          const result = await query(args);
          const clienteId = getClienteIdFromArgs(args);
          return afterWrite(result, clienteId);
        },
        async upsert({ args, query }: { args?: unknown; query: (a?: unknown) => Promise<unknown> }) {
          const result = await query(args);
          const clienteId = getClienteIdFromArgs(args);
          return afterWrite(result, clienteId);
        },
      },
      fatura: {
        async create({ args, query }: { args?: unknown; query: (a?: unknown) => Promise<unknown> }) {
          const result = await query(args);
          const clienteId = getClienteIdFromArgs(args);
          return afterWrite(result, clienteId);
        },
        async update({ args, query }: { args?: unknown; query: (a?: unknown) => Promise<unknown> }) {
          const result = await query(args);
          const clienteId = getClienteIdFromArgs(args);
          return afterWrite(result, clienteId);
        },
        async upsert({ args, query }: { args?: unknown; query: (a?: unknown) => Promise<unknown> }) {
          const result = await query(args);
          const clienteId = getClienteIdFromArgs(args);
          return afterWrite(result, clienteId);
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}

function getClienteIdFromArgs(args: unknown): unknown {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  const data = a.data as Record<string, unknown> | undefined;
  return data?.clienteId ?? undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "production" ? [] : ["error"],
    datasources: {
      db: {
        url: activeUrl,
      },
    },
  }) as unknown as PrismaClient;
  return attachClienteNumeroSync(client);
}

function getPrismaSingleton(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const rawClient = createPrismaClient();
  const client = isSQLite ? wrapWithSQLiteProxy(rawClient) : rawClient;
  globalForPrisma.prisma = client;
  return client;
}

// Singleton global para evitar múltiplos motores Prisma no Next.js
const prisma = getPrismaSingleton();

export async function ensurePrismaConnected(): Promise<PrismaClient> {
  if (globalForPrisma.prismaConnectPromise) {
    await globalForPrisma.prismaConnectPromise;
  } else if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$connect();
  }
  return globalForPrisma.prisma ?? prisma;
}

export default prisma;
