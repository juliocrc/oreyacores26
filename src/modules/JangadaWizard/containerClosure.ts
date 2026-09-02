import {
  getContainerClosureMatchBundle,
  getContainerClosureCatalogForModel,
  formatContainerClosureCapacities,
  type ContainerClosureStrapEntry,
} from "@/modules/rafts/containerClosureStraps";
import { findRaftTechnicalModel } from "@/modules/rafts/raftModelData";
import { HRU_STOCK_REFERENCE, HRU_REFERENCE_CANDIDATES } from "@/lib/stock-reference-rules";
import type { GlobalStockItem, InspectionData } from "./types";

export type ClosureItemKind = "cinta" | "autocolante" | "hru";

export type ClosureSuggestion = {
  key: string;
  kind: ClosureItemKind;
  referencia: string;
  descricao: string;
  quantidade: number;
  unidade?: string;
  partNumber?: string;
  sourceCatalog?: string;
  certainty?: string;
  extraNotes?: string[];
};

export type ClosureStockLookup = {
  stockId: number | null;
  precoVenda: number;
  quantidadeDisponivel: number;
  emStock: boolean;
};

export type ClosureItemState = {
  key: string;
  kind: ClosureItemKind;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  stockId?: number | null;
  partNumber?: string;
  dividido?: boolean;
};

const STRAP_ALIASES: Record<string, string> = {
  D508: "CINTAS CONTENTOR",
  D509: "CINTAS CONTENTOR",
  "MK20-FLAT": "CINTAS CONTENTOR",
};

const AUTOCLANTE_CATALOG: Array<{
  referencia: string;
  descricao: string;
  quantidade: number;
  unidade?: string;
}> = [
  {
    referencia: "SEAL-CONTAINER",
    descricao: "Autocolante/Selo de inviolabilidade do contentor",
    quantidade: 2,
  },
  {
    referencia: "ETIQUETA-INSPECAO",
    descricao: "Etiqueta de inspeção (data de re-inspeção)",
    quantidade: 1,
  },
];

function normalizeRef(value?: string | null) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function resolveStockForReference(
  globalStock: GlobalStockItem[],
  referencia: string,
): ClosureStockLookup {
  const byRef = globalStock.find(
    (s) => s.referencia && normalizeRef(s.referencia) === normalizeRef(referencia),
  );
  if (byRef) {
    return {
      stockId: byRef.id,
      precoVenda: Number(byRef.precoVenda) || 0,
      quantidadeDisponivel: Number(byRef.quantidade) || 0,
      emStock: true,
    };
  }
  const byDesc = globalStock.find((s) => {
    const desc = normalizeRef(s.descricao).replace(/\s+/g, " ");
    const token = STRAP_ALIASES[normalizeRef(referencia)];
    return token ? desc.includes(token) : false;
  });
  if (byDesc) {
    return {
      stockId: byDesc.id,
      precoVenda: Number(byDesc.precoVenda) || 0,
      quantidadeDisponivel: Number(byDesc.quantidade) || 0,
      emStock: true,
    };
  }
  const hru = HRU_REFERENCE_CANDIDATES.some(
    (candidate) => normalizeRef(candidate) === normalizeRef(referencia) || normalizeRef(referencia).includes(normalizeRef(candidate)),
  );
  if (hru) {
    const byHru = globalStock.find((s) =>
      HRU_REFERENCE_CANDIDATES.some(
        (candidate) => s.referencia && normalizeRef(s.referencia) === normalizeRef(candidate),
      ),
    );
    if (byHru) {
      return {
        stockId: byHru.id,
        precoVenda: Number(byHru.precoVenda) || 0,
        quantidadeDisponivel: Number(byHru.quantidade) || 0,
        emStock: true,
      };
    }
  }
  return { stockId: null, precoVenda: 0, quantidadeDisponivel: 0, emStock: false };
}

function getEffectiveContainerModel(data: InspectionData): string | null {
  const technical = findRaftTechnicalModel(data.brand, data.model);
  const technicalContainer = technical?.containerModel || null;
  return technicalContainer || null;
}

export function buildClosureSuggestions(data: InspectionData): ClosureSuggestion[] {
  const suggestions: ClosureSuggestion[] = [];

  const containerModel = getEffectiveContainerModel(data);
  const bundle = getContainerClosureMatchBundle({
    brand: data.brand,
    model: data.model,
    containerModel,
    capacity: data.capacity != null && data.capacity !== "" ? Number(data.capacity) : null,
    launchType: data.launchType || null,
    packType: data.packType || null,
    maxStowageHeight: data.maxStowageHeight || null,
  });

  const chosenEntry: ContainerClosureStrapEntry | null =
    bundle.exactMatches[0] || bundle.familyMatches[0] || null;

  if (chosenEntry) {
    const strapRef = chosenEntry.stockReference.split("/")[0].trim();
    suggestions.push({
      key: `cinta-${chosenEntry.key}`,
      kind: "cinta",
      referencia: strapRef,
      descricao: `${chosenEntry.description} (${chosenEntry.containerLabel} ${chosenEntry.size || ""} · ${formatContainerClosureCapacities(chosenEntry)})`.trim(),
      quantidade: chosenEntry.strapQuantity,
      partNumber: chosenEntry.completePartNumber,
      sourceCatalog: `Manual MK · pág. ${chosenEntry.page}`,
      certainty:
        bundle.exactMatches.length > 0
          ? "exact"
          : bundle.familyMatches.length > 0
            ? "family"
            : "unknown",
      extraNotes: bundle.operationalNotes,
    });
  } else {
    const fallbackCatalog = getContainerClosureCatalogForModel({
      brand: data.brand,
      model: data.model,
      containerModel,
    });
    if (fallbackCatalog.length > 0) {
      const first = fallbackCatalog[0];
      const strapRef = first.stockReference.split("/")[0].trim();
      suggestions.push({
        key: `cinta-${first.key}`,
        kind: "cinta",
        referencia: strapRef,
        descricao: `${first.description} (${first.containerLabel} ${first.size || ""})`.trim(),
        quantidade: first.strapQuantity,
        partNumber: first.completePartNumber,
        sourceCatalog: `Manual MK · pág. ${first.page}`,
        certainty: "catalog",
        extraNotes: [
          "Não foi encontrada correspondência exata (contentor/lotação/pack). Confirme o conjunto de cintas a instalar.",
        ],
      });
      if (first.sealPartNumber) {
        suggestions.push({
          key: `autocolante-cinta-${first.key}`,
          kind: "autocolante",
          referencia: "SEAL-CONTAINER",
          descricao: `Selo de cinta (${first.sealPartNumber})`,
          quantidade: first.strapQuantity,
          partNumber: first.sealPartNumber,
        });
      }
    }
  }

  for (const seal of AUTOCLANTE_CATALOG) {
    suggestions.push({
      key: `autocolante-${seal.referencia}`,
      kind: "autocolante",
      referencia: seal.referencia,
      descricao: seal.descricao,
      quantidade: seal.quantidade,
    });
  }

  if (String(data.hruAplicavel || "").toUpperCase() === "SIM" || data.hruValidade || data.hruExpiry) {
    suggestions.push({
      key: "hru-substituicao",
      kind: "hru",
      referencia: HRU_STOCK_REFERENCE,
      descricao: "Unidade de Libertação Hidrostática (HRU)",
      quantidade: 1,
      extraNotes: data.hruReference
        ? [`HRU atual: ${data.hruReference} · validade ${data.hruValidade || data.hruExpiry || "S/D"}`]
        : undefined,
    });
  }

  return suggestions;
}

export function toClosureState(
  suggestion: ClosureSuggestion,
  stock: ClosureStockLookup,
): ClosureItemState {
  return {
    key: suggestion.key,
    kind: suggestion.kind,
    referencia: suggestion.referencia,
    descricao: suggestion.descricao,
    quantidade: suggestion.quantidade,
    unitPrice: stock.precoVenda,
    stockId: stock.stockId,
    partNumber: suggestion.partNumber,
  };
}

export function getClosureStock(
  globalStock: GlobalStockItem[],
  suggestion: ClosureSuggestion,
): ClosureStockLookup {
  return resolveStockForReference(globalStock, suggestion.referencia);
}

export function closureLineId(item: ClosureItemState) {
  return `closure-${item.key}`;
}

export function buildClosureOrcamentoLinha(item: ClosureItemState) {
  return {
    id: closureLineId(item),
    stockId: item.stockId ?? null,
    referencia: item.referencia,
    descricao: item.descricao,
    quantidade: Number(item.quantidade) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    total: Math.round((Number(item.quantidade) || 0) * (Number(item.unitPrice) || 0) * 100) / 100,
    source: "closure" as const,
  };
}
