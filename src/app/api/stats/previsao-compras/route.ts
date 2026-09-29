import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveMandatoryPackItemsForRaftAsync } from "@/lib/custom-pack-types";
import { isArticleNonExpiring } from "@/modules/rafts/mandatoryPack";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const diasParam = searchParams.get("dias") || "60";
    const dias = parseInt(diasParam, 10);
    if (isNaN(dias) || dias <= 0) {
      return NextResponse.json({ error: "Parâmetro 'dias' inválido." }, { status: 400 });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + dias);
    limitDate.setHours(23, 59, 59, 999);

    // Fetch all active rafts
    const rafts = await prisma.jangada.findMany({
      select: {
        id: true,
        serial: true,
        brand: true,
        model: true,
        capacity: true,
        packType: true,
        dataProxInspecao: true,
        shipNameManual: true,
        shipId: true,
        serviceStationId: true,
      },
    });

    // Filter rafts within next inspection period
    const upcomingRafts = rafts.filter((r) => {
      if (!r.dataProxInspecao) return false;
      const d = new Date(r.dataProxInspecao);
      return !isNaN(d.getTime()) && d >= now && d <= limitDate;
    });

    // Map to aggregate expected consumption quantities
    // Key: reference or lowercase name
    const consumptionMap = new Map<
      string,
      {
        referencia: string | null;
        name: string;
        quantidadeEstimada: number;
        raftsLinked: Array<{ id: number; serial: string; dataProxInspecao: string }>;
      }
    >();

    for (const raft of upcomingRafts) {
      const resolvedPack = await resolveMandatoryPackItemsForRaftAsync({
        brand: raft.brand,
        model: raft.model,
        packType: raft.packType,
        capacity: raft.capacity,
      });

      for (const item of resolvedPack.items) {
        const nameLower = item.label.toLowerCase();
        const isSeasicknessBag = nameLower.includes('saco') && (nameLower.includes('enjoo') || nameLower.includes('vomit'));
        const isNonExpiring = isArticleNonExpiring({ name: item.label }) || isSeasicknessBag;
        const isBatteryOrLight = nameLower.includes('bateria') || nameLower.includes('litio') || nameLower.includes('luz') || nameLower.includes('light');
        if (isNonExpiring && !isBatteryOrLight) {
          continue; // Excluir artigos permanentes e sacos sem validade
        }

        let finalQty = item.quantity;
        if (nameLower.includes('comprimido') || nameLower.includes('enjoo') || nameLower.includes('pastilha')) {
          const packs = Math.ceil(finalQty / 60);
          finalQty = packs * 60;
        }

        // Use reference as main key if available, otherwise lowercase label
        const refKey = item.reference ? String(item.reference).trim().toUpperCase() : "";
        const nameKey = item.label.trim().toLowerCase();
        const mainKey = refKey || nameKey;

        const existing = consumptionMap.get(mainKey);
        if (existing) {
          existing.quantidadeEstimada += finalQty;
          existing.raftsLinked.push({
            id: raft.id,
            serial: raft.serial,
            dataProxInspecao: raft.dataProxInspecao!,
          });
        } else {
          consumptionMap.set(mainKey, {
            referencia: item.reference || null,
            name: item.label,
            quantidadeEstimada: finalQty,
            raftsLinked: [
              {
                id: raft.id,
                serial: raft.serial,
                dataProxInspecao: raft.dataProxInspecao!,
              },
            ],
          });
        }
      }
    }

    // Load all stock items to compare
    const stockItems = await prisma.stock.findMany({
      select: {
        id: true,
        referencia: true,
        descricao: true,
        quantidade: true,
        quantidadeReservada: true,
        quantidadeMinima: true,
        leadTimeDias: true,
      },
    });

    function normalizeRef(value: string | null | undefined): string {
      return String(value || "").trim().toUpperCase();
    }

    function matchStockForPrevisao(referencia: string | null, name: string) {
      if (referencia) {
        const refUpper = normalizeRef(referencia);
        const exact = stockItems.find((s) => s.referencia && normalizeRef(s.referencia) === refUpper);
        if (exact) return exact;
      }
      const exactDesc = stockItems.find((s) => s.descricao.trim().toLowerCase() === name.trim().toLowerCase());
      if (exactDesc) return exactDesc;

      const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
      if (!tokens.length) return undefined;
      const scored = stockItems
        .map((s) => ({
          s,
          hits: tokens.filter((t) => s.descricao.toLowerCase().includes(t)).length,
        }))
        .filter((x) => x.hits >= Math.min(2, tokens.length))
        .sort((a, b) => b.hits - a.hits);
      return scored.length ? scored[0].s : undefined;
    }

    type PrevisaoResult = {
      key: string;
      referencia: string | null;
      name: string;
      quantidadeEstimada: number;
      stockAtual: number;
      disponivel: number;
      reservado: number;
      minStock: number;
      leadTimeDias: number | null;
      quantidadeEmFalta: number;
      raftsLinked: Array<{ id: number; serial: string; dataProxInspecao: string }>;
      stockId: number | null;
    };
    const results: PrevisaoResult[] = [];

    for (const [key, val] of consumptionMap.entries()) {
      // Match por referência exata, descrição exata ou scoring por tokens do nome
      const matchedStock = matchStockForPrevisao(val.referencia, val.name);

      const stockAtual = matchedStock ? matchedStock.quantidade : 0;
      const reservado = matchedStock ? Number(matchedStock.quantidadeReservada) || 0 : 0;
      const disponivel = Math.max(0, stockAtual - reservado);
      const minStock = matchedStock ? matchedStock.quantidadeMinima || 0 : 0;

      // Necessidade real: estimada sobre o disponível + garantir piso do mínimo
      const quantidadeEmFalta = Math.max(
        0,
        val.quantidadeEstimada - disponivel,
        minStock > 0 && disponivel <= minStock ? minStock - disponivel : 0
      );

      results.push({
        key,
        referencia: val.referencia,
        name: val.name,
        quantidadeEstimada: val.quantidadeEstimada,
        stockAtual,
        disponivel,
        reservado,
        minStock,
        leadTimeDias: matchedStock?.leadTimeDias ?? null,
        quantidadeEmFalta,
        raftsLinked: val.raftsLinked,
        stockId: matchedStock ? matchedStock.id : null,
      });
    }

    // Sort by items with greatest shortage first, then by estimated quantity
    results.sort((a, b) => b.quantidadeEmFalta - a.quantidadeEmFalta || b.quantidadeEstimada - a.quantidadeEstimada);

    return NextResponse.json({
      dias,
      totalJangadasAnalisadas: upcomingRafts.length,
      previsao: results,
    });
  } catch (error) {
    console.error("Error calculating stock forecasting:", error);
    return NextResponse.json({ error: "Erro interno ao calcular previsão de stock." }, { status: 500 });
  }
}
