import { normalizeNavioTipoCategoria as normalizeNavioTipoCategoriaFromLegalTypes } from "@/lib/navio-legal-types";
import { normalizeManualNavioIsland } from "@/lib/navio-island-resolution";
import { canonicalizeAzoresIsland, inferAzoresIslandFromPort } from "@/lib/azores-islands";

export type NavioGroupingClient = {
  id?: number;
  nome?: string | null;
  ilha?: string | null;
} | null;

export type NavioGroupingStation = {
  id?: number;
  codigo?: string | null;
  nome?: string | null;
  regiaoOperacional?: string | null;
  territorioTipo?: string | null;
} | null;

export type NavioGroupingItem = {
  id: number;
  nome: string;
  matricula?: string | null;
  tipoPesca?: string | null;
  tipoNavio?: string | null;
  ilha?: string | null;
  cliente?: NavioGroupingClient;
  serviceStation?: NavioGroupingStation;
};

export type GroupedNavioClientSection<T extends NavioGroupingItem> = {
  client: string;
  navios: T[];
};

export type GroupedNavioTypeSection<T extends NavioGroupingItem> = {
  type: string;
  total: number;
  clients: GroupedNavioClientSection<T>[];
};

export type GroupedNavioIslandSection<T extends NavioGroupingItem> = {
  island: string;
  total: number;
  types: GroupedNavioTypeSection<T>[];
};

function comparePt(a: string, b: string) {
  return a.localeCompare(b, "pt", { sensitivity: "base" });
}

export function getNavioIslandLabel(navio: Pick<NavioGroupingItem, "ilha" | "cliente">): string {
  const raw = String(navio.ilha || "").trim();
  const az = canonicalizeAzoresIsland(raw) || inferAzoresIslandFromPort(raw);
  if (az) return az;
  const manual = normalizeManualNavioIsland(raw);
  return manual || "Sem ilha";
}

export function getNavioClientLabel(navio: Pick<NavioGroupingItem, "cliente">): string {
  return String(navio.cliente?.nome || "").trim() || "Sem cliente";
}

export function normalizeNavioTipoCategoria(tipo?: string | null, matricula?: string | null, tipoNavio?: string | null) {
  return normalizeNavioTipoCategoriaFromLegalTypes(tipo, matricula, tipoNavio);
}

export function groupNaviosByIslandTypeClient<T extends NavioGroupingItem>(navios: T[]): GroupedNavioIslandSection<T>[] {
  const grouped = navios.reduce((acc, navio) => {
    const island = getNavioIslandLabel(navio);
    const type = normalizeNavioTipoCategoria(navio.tipoPesca, navio.matricula, navio.tipoNavio);
    const client = getNavioClientLabel(navio);

    if (!acc.has(island)) acc.set(island, new Map<string, Map<string, T[]>>());
    const islandMap = acc.get(island)!;

    if (!islandMap.has(type)) islandMap.set(type, new Map<string, T[]>());
    const typeMap = islandMap.get(type)!;

    if (!typeMap.has(client)) typeMap.set(client, []);
    typeMap.get(client)!.push(navio);
    return acc;
  }, new Map<string, Map<string, Map<string, T[]>>>());

  return Array.from(grouped.entries())
    .sort(([a], [b]) => comparePt(a, b))
    .map(([island, typeMap]) => {
      const types = Array.from(typeMap.entries())
        .sort(([a], [b]) => comparePt(a, b))
        .map(([type, clientMap]) => {
          const clients = Array.from(clientMap.entries())
            .sort(([a], [b]) => comparePt(a, b))
            .map(([client, clientNavios]) => ({
              client,
              navios: [...clientNavios].sort((a, b) => comparePt(String(a.nome || ""), String(b.nome || ""))),
            }));

          return {
            type,
            total: clients.reduce((sum, clientSection) => sum + clientSection.navios.length, 0),
            clients,
          };
        });

      return {
        island,
        total: types.reduce((sum, typeSection) => sum + typeSection.total, 0),
        types,
      };
    });
}