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
  portoRegisto?: string | null;
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

export function getNavioIslandLabel(navio: Pick<NavioGroupingItem, "ilha" | "cliente" | "portoRegisto" | "matricula">): string {
  const ilhaRaw = String(navio.ilha || "").trim();
  const portoRaw = String(navio.portoRegisto || "").trim();
  const matriculaRaw = String(navio.matricula || "").trim();

  const az = canonicalizeAzoresIsland(ilhaRaw) || inferAzoresIslandFromPort(portoRaw) || inferAzoresIslandFromPort(ilhaRaw);
  if (az) return az;

  const combined = (portoRaw + " " + ilhaRaw + " " + matriculaRaw).toLowerCase();
  if (
    combined.includes("funchal") ||
    combined.includes("madeira") ||
    combined.includes("porto santo") ||
    combined.includes("fnc") ||
    combined.includes("mad-") ||
    /^fnc/i.test(matriculaRaw) ||
    /^ps/i.test(portoRaw)
  ) {
    return "Madeira";
  }

  const norteKeywords = ["porto", "leixões", "leixoes", "aveiro", "viana do castelo", "póvoa", "povoa", "matosinhos", "figueira da foz", "caminha", "vila do conde", "braga", "guimarães", "viana"];
  if (norteKeywords.some((k) => combined.includes(k))) {
    return "Norte";
  }

  const sulKeywords = ["faro", "portimão", "portimao", "lagos", "olhão", "olhao", "sines", "tavira", "albufeira", "sagres", "vila real", "quarteira", "sesimbra", "beja", "évora", "evora", "algarve"];
  if (sulKeywords.some((k) => combined.includes(k))) {
    return "Sul";
  }

  const centroKeywords = ["lisboa", "cascais", "peniche", "nazaré", "nazare", "setúbal", "setubal", "santarém", "santarem", "leiria", "coimbra", "almada", "barreiro", "sintra"];
  if (centroKeywords.some((k) => combined.includes(k))) {
    return "Centro";
  }

  if (portoRaw) return portoRaw;
  return "Sul";
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