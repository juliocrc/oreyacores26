import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getIvaRate } from "@/lib/iva";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const jangadaId = Number(id);
    if (!Number.isFinite(jangadaId)) {
      return NextResponse.json({ error: "ID de jangada inválido" }, { status: 400 });
    }

    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
    });

    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada" }, { status: 404 });
    }

    // Buscar artigos de stock ativos para precificação
    const stockItems = await prisma.stock.findMany({
      select: { referencia: true, descricao: true, precoVenda: true, categoria: true },
    });
    const priceMap = new Map<string, number>();
    stockItems.forEach((s) => {
      if (s.referencia && s.precoVenda) priceMap.set(s.referencia.toLowerCase(), Number(s.precoVenda));
    });

    // Itens padrão de inspeção anual / 3 anos / 5 anos
    const itemsToReplace: Array<{ nome: string; referencia: string; quantidade: number; custoEstimado: number }> = [
      { nome: "Kit de Pirotecnia (Paraquedas + Fachos + Fumo)", referencia: "PYRO-KIT", quantidade: 1, custoEstimado: 120.0 },
      { nome: "Bateria de Lítio / Iluminação", referencia: "BAT-RL5", quantidade: 1, custoEstimado: 35.0 },
      { nome: "Kit de Primeiros Socorros (Farmácia)", referencia: "FIRST-AID", quantidade: 1, custoEstimado: 45.0 },
      { nome: "Comprimidos Anti-enjoo", referencia: "MOTION-TAB", quantidade: 1, custoEstimado: 15.0 },
    ];

    const maoObraPadrao = 0.0; // Sem mão de obra por defeito
    const totalMaterialEstimado = itemsToReplace.reduce((sum, i) => sum + i.custoEstimado * i.quantidade, 0);
    const subtotal = totalMaterialEstimado + maoObraPadrao;
    const iva = subtotal * getIvaRate();
    const totalGeral = Math.round((subtotal + iva) * 100) / 100;

    return NextResponse.json({
      jangadaId: jangada.id,
      serial: jangada.serial,
      brand: jangada.brand,
      model: jangada.model,
      capacidade: jangada.capacity,
      ultimaInspecao: jangada.dataInspecao || null,
      proximaInspecao: jangada.dataProxInspecao || null,
      itensPrevistos: itemsToReplace,
      custos: {
        materiais: totalMaterialEstimado,
        maoObra: maoObraPadrao,
        subtotal,
        iva,
        total: totalGeral,
      },
    });
  } catch (error) {
    console.error("Erro ao calcular previsão de custos:", error);
    return NextResponse.json({ error: "Erro interno ao calcular previsão de custos" }, { status: 500 });
  }
}
