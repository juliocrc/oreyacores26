import prisma from "@/lib/prisma";
import { parseFlexibleDate } from "./agenda-sync";
import { resolveMandatoryPackItemsForRaftAsync } from "@/lib/custom-pack-types";
import { isRationArticle } from "@/config/packTemplates";
import type { Prisma } from "@prisma/client";
import type { MandatoryPackItem } from "@/modules/rafts/mandatoryPack";

type RichChecklist = Record<string, unknown>;

type SyncOptions = {
  linkStock?: boolean;
};

function normalizeRef(value?: string | null): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Artigos de sobrevivência que não pertencem a packs costeiros/reduzidos
 * (rações alimentares, estojo de pesca/fishing kit e ajudas térmicas/TPA).
 * Quando o pack atual não os espera, os artigos persistidos que correspondem
 * a estes são removidos da lista física da jangada.
 */
export function isForbiddenPackArticleName(value?: string | null, packType?: string | null): boolean {
  const norm = normalizeText(value);
  if (!norm) return false;
  const upperPack = String(packType || '').toUpperCase().trim();
  const isReducedPack = upperPack === 'R' || upperPack === 'E' || upperPack === 'SOLAS B' || upperPack === 'COASTAL' || upperPack === 'ISO-RAFT' || upperPack.includes('REDUZIDO');
  if (isRationArticle(norm)) return isReducedPack;
  const isFishingOrThermal =
    norm.includes("ESTOJO DE PESCA") ||
    norm.includes("FISHING KIT") ||
    norm.includes("FISH KIT") ||
    norm.includes("AJUDAS TERMICAS") ||
    norm.includes("AJUDA TERMICA") ||
    norm.includes("MANTAS TERMICAS") ||
    norm.includes("MANTA TERMICA") ||
    norm.includes("THERMAL PROTECTIVE") ||
    norm.includes("THERMAL BLANKET") ||
    norm.includes("SURVIVAL BLANKET") ||
    norm === "TPA" ||
    norm === "TPAS";
  if (isFishingOrThermal) return isReducedPack;
  return false;
}

function isForbiddenPackArticleRef(value?: string | null): boolean {
  const ref = normalizeRef(value);
  if (!ref) return false;
  return (
    ref.includes("FISH-KIT") ||
    ref.includes("FISHKIT") ||
    ref.includes("FOOD-RATION") ||
    ref.includes("FOODRATION") ||
    ref.includes("THER-BLANKET") ||
    ref.includes("THERM-BLANKET")
  );
}

function isForbiddenPackArticle(article: {
  name?: string | null;
  referencia?: string | null;
}, packType?: string | null): boolean {
  return isForbiddenPackArticleName(article?.name, packType) || isForbiddenPackArticleRef(article?.referencia);
}

async function findBestStockMatch(
  item: MandatoryPackItem,
  allStock: Array<{
    id: number;
    referencia: string;
    descricao: string;
    quantidade: number;
    associavelJangada: boolean;
    aplicavelMarcaJangada: string | null;
    aplicavelModeloJangada: string | null;
    validade?: string | null;
  }>,
  raftBrand?: string | null,
): Promise<number | null> {
  const itemRefs = new Set(
    item.stockReferences.map((r) => normalizeRef(r)).filter(Boolean)
  );

  for (const stock of allStock) {
    const stockRef = normalizeRef(stock.referencia);
    if (stockRef && itemRefs.has(stockRef)) {
      return stock.id;
    }
  }

  for (const stock of allStock) {
    const stockDesc = normalizeText(stock.descricao);
    const tokens = item.articleTokens.map((t) => normalizeText(t)).filter(Boolean);
    if (tokens.some((t) => stockDesc.includes(t) || t.includes(stockDesc))) {
      return stock.id;
    }
  }

  for (const stock of allStock) {
    const stockDesc = normalizeText(stock.descricao);
    const labelNorm = normalizeText(item.label);
    if (stockDesc.includes(labelNorm) || labelNorm.includes(stockDesc)) {
      return stock.id;
    }
  }

  if (raftBrand && item.stockReferences.length > 0) {
    const brandLower = normalizeText(raftBrand);
    for (const stock of allStock) {
      if (!stock.associavelJangada) continue;
      const brands = normalizeText(stock.aplicavelMarcaJangada || "");
      if (brands && brands.includes(brandLower)) {
        const desc = normalizeText(stock.descricao);
        const tokens = item.articleTokens.map((t) => normalizeText(t)).filter(Boolean);
        if (tokens.some((t) => desc.includes(t))) {
          return stock.id;
        }
      }
    }
  }

  return null;
}

/**
 * Sincroniza a lista de artigos físicos da jangada (ArtigoJangada) 
 * com o que é esperado pelo Tipo de Pack (SOLAS A/B, etc) e Lotação.
 * Quando `linkStock` é true, resolve e grava o stockId FK em cada artigo.
 */
export async function syncRaftArticlesWithPackType(
  jangadaId: number,
  options?: SyncOptions,
) {
  const linkStock = options?.linkStock !== false;

  const raft = await prisma.jangada.findUnique({
    where: { id: jangadaId },
    include: { artigos: true },
  });

  if (!raft) return { success: false, message: "Jangada não encontrada." };

  const resolvedPack = await resolveMandatoryPackItemsForRaftAsync({
    brand: raft.brand,
    model: raft.model,
    packType: raft.packType,
    capacity: raft.capacity,
  });
  const expectedItems = resolvedPack.items;

  if (expectedItems.length === 0) {
    return {
      success: true,
      warning: "Nenhum artigo de pack definido para este tipo de pack.",
      summary: { added: 0, updated: 0, stockLinked: 0, removed: 0, total: 0 },
      packSource: resolvedPack.source,
    };
  }

  let allStock: Awaited<ReturnType<typeof fetchStock>> = [];
  if (linkStock) {
    allStock = await fetchStock();
  }

  const summary = {
    added: 0,
    updated: 0,
    stockLinked: 0,
    removed: 0,
    total: expectedItems.length,
  };

  const matchedIds = new Set<number>();

  for (const item of expectedItems) {
    let existing = raft.artigos.find((a) => {
      if (matchedIds.has(a.id)) return false;
      const dbRef = normalizeRef(a.referencia);
      const dbName = normalizeText(a.name);
      const itemRef = normalizeRef(item.reference);
      const itemName = normalizeText(item.label);
      return (itemRef && dbRef === itemRef) || dbName === itemName;
    });

    if (!existing) {
      existing = raft.artigos.find((a) => {
        if (matchedIds.has(a.id)) return false;
        const dbRef = normalizeRef(a.referencia);
        const dbName = normalizeText(a.name);
        const matchByReference = item.stockReferences.some(
          (ref) => normalizeRef(ref) === dbRef
        );
        const matchByName =
          dbName.includes(normalizeText(item.label)) ||
          normalizeText(item.label).includes(dbName);
        const matchByTokens = item.articleTokens.some((t) =>
          dbName.includes(normalizeText(t))
        );
        return matchByReference || matchByName || matchByTokens;
      });
    }

    if (existing) {
      matchedIds.add(existing.id);
      const isComprimidosEnjoo =
        item.reference === "30202051" || existing.referencia === "30202051";
      const skipQtyUpdate = isComprimidosEnjoo && existing.quantidade >= 1;

      const updateData: Prisma.ArtigoJangadaUncheckedUpdateInput = {};

      if (existing.quantidade !== item.quantity && !skipQtyUpdate) {
        updateData.quantidade = item.quantity;
      }

      if (linkStock && !existing.stockId && allStock.length) {
        const stockId = await findBestStockMatch(
          item,
          allStock,
          raft.brand,
        );
        if (stockId) {
          updateData.stockId = stockId;
          const matchedStock = allStock.find((s) => s.id === stockId);
          if (matchedStock?.validade && !existing.validade) {
            updateData.validade = new Date(matchedStock.validade);
          }
          summary.stockLinked++;
        }
      }

      if (existing.referencia !== item.reference && item.reference) {
        updateData.referencia = item.reference;
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = new Date();
        await prisma.artigoJangada.update({
          where: { id: existing.id },
          data: updateData,
        });
        summary.updated++;
      }
    } else {
      const exactDuplicate = raft.artigos.find(
        (a) =>
          normalizeText(a.name) === normalizeText(item.label) ||
          (item.reference &&
            a.referencia &&
            normalizeRef(a.referencia) === normalizeRef(item.reference))
      );

      if (exactDuplicate) {
        matchedIds.add(exactDuplicate.id);
        summary.updated++;
      } else {
        const createData: Prisma.ArtigoJangadaUncheckedCreateInput = {
          jangadaId: raft.id,
          name: item.label,
          quantidade: item.quantity,
          referencia: item.reference || null,
          codigoFabricante: item.reference || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (linkStock && allStock.length) {
          const stockId = await findBestStockMatch(
            item,
            allStock,
            raft.brand,
          );
          if (stockId) {
            createData.stockId = stockId;
            const matchedStock = allStock.find((s) => s.id === stockId);
            if (matchedStock?.validade) {
              createData.validade = new Date(matchedStock.validade);
            }
            summary.stockLinked++;
          }
        }

        await prisma.artigoJangada.create({ data: createData });
        summary.added++;
      }
    }
  }

  const forbiddenToRemove = raft.artigos.filter((a) => {
    if (matchedIds.has(a.id)) return false;
    if (a.inspecaoId != null) return false;
    return isForbiddenPackArticle(a, raft.packType);
  });

  if (forbiddenToRemove.length > 0) {
    await prisma.artigoJangada.deleteMany({
      where: { id: { in: forbiddenToRemove.map((a) => a.id) } },
    });
    summary.removed = forbiddenToRemove.length;
  }

  return { success: true, summary, packSource: resolvedPack.source };
}

async function fetchStock() {
  try {
    return await prisma.stock.findMany({
      select: {
        id: true,
        referencia: true,
        descricao: true,
        quantidade: true,
        associavelJangada: true,
        aplicavelMarcaJangada: true,
        aplicavelModeloJangada: true,
        validade: true,
      },
    });
  } catch {
    return [];
  }
}

/**
 * Aplica os valores preenchidos na Rich Checklist (baseada em manuais) 
 * diretamente nos campos da Jangada e seus artigos associados.
 */
export async function syncRichChecklistToRaft(
  jangadaId: number,
  richChecklist: RichChecklist
) {
  if (!richChecklist) return;

  const raft = await prisma.jangada.findUnique({
    where: { id: jangadaId },
    include: { artigos: true },
  });

  if (!raft) return;

  const updateData: Record<string, unknown> = {};

  const directMappings: Record<string, string> = {
    dataInspecao: "dataInspecao",
    dataProxInspecao: "dataProxInspecao",
    data_proxima_inspecao: "dataProxInspecao",
    hru_validade: "hruValidade",
    radar_reflector_validade: "radarReflectorValidade",
    cilindro_data_teste: "cylinderDataTeste",
    cilindro_data_prox_teste: "cylinderDataProxTeste",
    cylinder_data_prox_teste: "cylinderDataProxTeste",
  };

  for (const [checklistKey, dbKey] of Object.entries(directMappings)) {
    if (richChecklist[checklistKey]) {
      const date = parseFlexibleDate(String(richChecklist[checklistKey] ?? ""));
      if (date) {
        updateData[dbKey] = date.toISOString().slice(0, 10);
      } else {
        updateData[dbKey] = String(richChecklist[checklistKey]);
      }
    }
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.jangada.update({
      where: { id: jangadaId },
      data: updateData as Prisma.JangadaUncheckedUpdateInput,
    });
  }

  const articleMappings: Record<string, string[]> = {
    validade_paraquedas: [
      "PARAQUEDAS",
      "PARACHUTE",
      "ROCKET",
      "PARACHUTE ROCKETS",
      "PARACHUTE ROCKET",
    ],
    validade_fachos_mao: [
      "FACHO",
      "HAND FLARE",
      "HANDFLARE",
      "HANDFLARES",
    ],
    validade_potes_fumo: ["FUMO", "SMOKE"],
    validade_pilhas_lanterna: ["PILHA", "BATTERY", "TORCH"],
    validade_farmacia: ["FARMACIA", "AMBULANCIA", "FIRST AID", "MEDICINE"],
    validade_comprimidos: [
      "COMPRIMIDO",
      "SICKNESS",
      "ANTI-ENJOO",
      "SEASICKNESS",
      "TABLES",
    ],
    validade_agua: ["AGUA", "WATER"],
    validade_racoes: ["RACAO", "FOOD"],
  };

  for (const [checklistKey, keywords] of Object.entries(articleMappings)) {
    const newValidade = richChecklist[checklistKey];
    if (newValidade) {
      const parsedValidade = parseFlexibleDate(String(newValidade ?? ""));
      if (!parsedValidade) continue;

      const matchedArtigo = raft.artigos.find((a) =>
        keywords.some((k) => normalizeText(a.name).includes(normalizeText(k)))
      );

      if (matchedArtigo) {
        await prisma.artigoJangada.update({
          where: { id: matchedArtigo.id },
          data: {
            validade: parsedValidade,
            updatedAt: new Date(),
          },
        });
      }
    }
  }
}
