import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import { getMandatoryPackItemsForRaft, type MandatoryPackItem } from "@/modules/rafts/mandatoryPack";

export const runtime = "nodejs";

function normalizeRef(value?: string | null): string {
  return String(value || "").trim().toUpperCase();
}

function parseDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(String(input).trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(dateStr: string | null): number | null {
  const d = parseDate(dateStr);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

type StockItem = {
  id: number;
  referencia: string;
  descricao: string;
  categoria: string | null;
  quantidade: number;
  quantidadeMinima: number | null;
  associavelJangada: boolean;
  aplicavelMarcaJangada: string | null;
  aplicavelModeloJangada: string | null;
};

type PackArticleDemand = {
  reference: string;
  label: string;
  category: string;
  section: string;
  quantity: number;
  stockReferences: string[];
  articleTokens: string[];
  raftCount: number;
  raftSerials: Set<string>;
};

function findStockMatch(
  stockItems: StockItem[],
  item: MandatoryPackItem
): StockItem | null {
  const primaryRef = normalizeRef(item.reference || item.stockReferences[0] || "");
  
  if (primaryRef) {
    const byRef = stockItems.find(s => normalizeRef(s.referencia) === primaryRef);
    if (byRef) return byRef;
  }

  for (const ref of item.stockReferences) {
    const normalized = normalizeRef(ref);
    if (!normalized) continue;
    const match = stockItems.find(s => normalizeRef(s.referencia) === normalized);
    if (match) return match;
  }

  const labelLower = (item.label || "").toLowerCase();
  const tokens = labelLower.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length > 0) {
    const byToken = stockItems.find(s => {
      const desc = (s.descricao || "").toLowerCase();
      return tokens.some(t => desc.includes(t));
    });
    if (byToken) return byToken;
  }

  return null;
}

export async function GET() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!canViewPath(access.permissions, "/stock") && !canEditPath(access.permissions, "/stock") && !access.isAdmin) {
    return NextResponse.json({ error: "Sem permissão para aceder ao stock." }, { status: 403 });
  }

  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const [stockRaw, allRafts] = await Promise.all([
      prisma.stock.findMany({
        select: {
          id: true,
          referencia: true,
          descricao: true,
          categoria: true,
          quantidade: true,
          quantidadeMinima: true,
          associavelJangada: true,
          aplicavelMarcaJangada: true,
          aplicavelModeloJangada: true,
        },
      }),
      prisma.jangada.findMany({
        where: { dataProxInspecao: { not: null } },
        select: {
          id: true,
          serial: true,
          brand: true,
          model: true,
          capacity: true,
          packType: true,
          dataProxInspecao: true,
        },
      }),
    ]);

    const stockItems = stockRaw.map(s => ({
      ...s,
      referencia: normalizeRef(s.referencia),
    }));

    const allRaftsWithDays = allRafts
      .map(r => ({ ...r, daysUntil: daysUntil(r.dataProxInspecao) }))
      .filter(r => r.daysUntil !== null && r.daysUntil! >= 0);

    const demandMap = new Map<string, PackArticleDemand>();

    for (const raft of allRaftsWithDays) {
      let items: MandatoryPackItem[] = [];
      try {
        items = getMandatoryPackItemsForRaft({
          brand: raft.brand,
          model: raft.model,
          packType: raft.packType,
          capacity: raft.capacity,
        });
      } catch {
        continue;
      }
      if (!items.length) continue;

      for (const item of items) {
        if (item.optional) continue;

        const primaryRef = item.reference || item.stockReferences[0] || "";
        const key = primaryRef ? `ref:${primaryRef}` : `name:${item.checklistName}`;

        if (!demandMap.has(key)) {
          demandMap.set(key, {
            reference: primaryRef,
            label: item.label,
            category: item.category,
            section: item.section,
            quantity: 0,
            stockReferences: item.stockReferences,
            articleTokens: item.articleTokens || [],
            raftCount: 0,
            raftSerials: new Set(),
          });
        }

        const entry = demandMap.get(key)!;
        entry.quantity += item.quantity;
        entry.raftCount++;
        entry.raftSerials.add(raft.serial);
      }
    }

    const matched: Array<{
      packLabel: string;
      packReference: string;
      category: string;
      section: string;
      demandQty: number;
      raftCount: number;
      stockId: number;
      stockReference: string;
      stockDescription: string;
      stockQuantity: number;
      stockMinQuantity: number | null;
      status: "ok" | "low" | "out" | "missing";
      suggestion: string;
    }> = [];

    const unmatched: Array<{
      packLabel: string;
      packReference: string;
      category: string;
      section: string;
      demandQty: number;
      raftCount: number;
      stockReferences: string[];
      suggestion: "create" | "find_similar";
      similarItems: Array<{ id: number; referencia: string; descricao: string }>;
    }> = [];

    const seenRefs = new Set<string>();

    for (const [, demand] of demandMap) {
      const refKey = normalizeRef(demand.reference);
      if (refKey && seenRefs.has(refKey)) continue;
      if (refKey) seenRefs.add(refKey);

      const stockMatch = findStockMatch(stockItems, demand as unknown as MandatoryPackItem);

      if (stockMatch) {
        const status = stockMatch.quantidade <= 0
          ? "out"
          : stockMatch.quantidadeMinima !== null && stockMatch.quantidade <= stockMatch.quantidadeMinima
            ? "low"
            : "ok";

        let suggestion = "";
        if (status === "out") {
          suggestion = `Encomendar ${demand.quantity} un. — stock esgotado`;
        } else if (status === "low") {
          const deficit = Math.max(0, demand.quantity - stockMatch.quantidade);
          suggestion = `Repor ${deficit > 0 ? deficit : demand.quantity} un. — abaixo do mínimo`;
        } else if (stockMatch.quantidade < demand.quantity) {
          suggestion = `Stock atual (${stockMatch.quantidade}) inferior à demanda prevista (${demand.quantity})`;
        } else {
          suggestion = "Stock suficiente";
        }

        matched.push({
          packLabel: demand.label,
          packReference: demand.reference,
          category: demand.category,
          section: demand.section,
          demandQty: demand.quantity,
          raftCount: demand.raftCount,
          stockId: stockMatch.id,
          stockReference: stockMatch.referencia,
          stockDescription: stockMatch.descricao,
          stockQuantity: stockMatch.quantidade,
          stockMinQuantity: stockMatch.quantidadeMinima,
          status,
          suggestion,
        });
      } else {
        const similarItems = stockItems
          .filter(s => {
            const desc = (s.descricao || "").toLowerCase();
            const label = (demand.label || "").toLowerCase();
            const tokens = label.split(/\s+/).filter(t => t.length > 2);
            return tokens.some(t => desc.includes(t));
          })
          .slice(0, 5)
          .map(s => ({ id: s.id, referencia: s.referencia, descricao: s.descricao }));

        unmatched.push({
          packLabel: demand.label,
          packReference: demand.reference,
          category: demand.category,
          section: demand.section,
          demandQty: demand.quantity,
          raftCount: demand.raftCount,
          stockReferences: demand.stockReferences,
          suggestion: similarItems.length > 0 ? "find_similar" : "create",
          similarItems,
        });
      }
    }

    const summary = {
      totalPackArticles: demandMap.size,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      statusBreakdown: {
        ok: matched.filter(m => m.status === "ok").length,
        low: matched.filter(m => m.status === "low").length,
        out: matched.filter(m => m.status === "out").length,
      },
      totalRaftsAnalyzed: allRaftsWithDays.length,
    };

    return NextResponse.json({ matched, unmatched, summary });
  } catch (err) {
    console.error("[stock/sync-pack] Error:", err);
    return NextResponse.json(
      { error: "Erro ao sincronizar artigos do pack com stock." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!access.isAdmin && !canEditPath(access.permissions, "/stock")) {
    return NextResponse.json({ error: "Sem permissão para gerir stock." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, items } = body as {
      action: "create_missing" | "link_stock" | "update_min_qty";
      items: Array<{
        packReference: string;
        packLabel: string;
        category: string;
        stockId?: number;
        newMinQty?: number;
      }>;
    };

    if (!action || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    const results: Array<{ reference: string; status: string; message: string }> = [];

    for (const item of items) {
      try {
        if (action === "create_missing") {
          const existing = await prisma.stock.findFirst({
            where: { referencia: normalizeRef(item.packReference) },
          });

          if (existing) {
            results.push({
              reference: item.packReference,
              status: "skipped",
              message: `Artigo já existe no stock (ID: ${existing.id})`,
            });
            continue;
          }

          const newStock = await prisma.stock.create({
            data: {
              referencia: normalizeRef(item.packReference),
              descricao: item.packLabel || item.packReference,
              categoria: item.category || null,
              quantidade: 0,
              quantidadeMinima: 1,
              associavelJangada: true,
              precoVenda: 0,
              estadoArtigo: "ATIVO",
            },
          });

          results.push({
            reference: item.packReference,
            status: "created",
            message: `Artigo criado no stock (ID: ${newStock.id})`,
          });
        } else if (action === "link_stock" && item.stockId) {
          const stockTarget = await prisma.stock.findUnique({
            where: { id: item.stockId },
          });

          if (!stockTarget) {
            results.push({
              reference: item.packReference,
              status: "error",
              message: `Stock ID ${item.stockId} não encontrado`,
            });
            continue;
          }

          const linked = await prisma.artigoJangada.updateMany({
            where: {
              inspecaoId: null,
              OR: [
                { referencia: { in: [item.packReference, stockTarget.referencia] } },
                ...(item.packLabel
                  ? [{ name: { contains: item.packLabel } }]
                  : []),
              ],
            },
            data: { stockId: item.stockId },
          });

          results.push({
            reference: item.packReference,
            status: "linked",
            message: `Artigo vinculado ao stock ID: ${item.stockId} (${linked.count} artigo(s) atualizado(s))`,
          });
        } else if (action === "update_min_qty" && item.stockId && item.newMinQty !== undefined) {
          await prisma.stock.update({
            where: { id: item.stockId },
            data: { quantidadeMinima: item.newMinQty },
          });

          results.push({
            reference: item.packReference,
            status: "updated",
            message: `Quantidade mínima atualizada para ${item.newMinQty}`,
          });
        }
      } catch (err) {
        results.push({
          reference: item.packReference,
          status: "error",
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[stock/sync-pack] POST Error:", err);
    return NextResponse.json(
      { error: "Erro ao processar sincronização." },
      { status: 500 }
    );
  }
}
