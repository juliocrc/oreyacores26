import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

export const dynamic = "force-dynamic";

/**
 * KPIs executivos consolidados para o painel principal (home /).
 * Agrega números financeiros e operacionais diretamente via Prisma,
 * evitando múltiplos fetchs internos.
 */
export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const in60 = new Date(now.getTime() + 60 * 86400000);

    const [
      faturacaoMes,
      faturacaoAno,
      faturasAReceber,
      faturasVencidas,
      osAbertas,
      osConcluidasMes,
      margemConcluidasMes,
      jangadas30,
      jangadas60,
      stockCritico,
      totalClientes,
      totalJangadas,
    ] = await Promise.all([
      prisma.fatura.aggregate({
        where: { cancelada: false, dataEmissao: { gte: startOfMonth } },
        _sum: { valorTotal: true },
      }),
      prisma.fatura.aggregate({
        where: { cancelada: false, dataEmissao: { gte: startOfYear } },
        _sum: { valorTotal: true },
      }),
      // valor em aberto (pendente) - simplificação: soma faturas não canceladas sem nota de crédito
      prisma.fatura.aggregate({
        where: { cancelada: false, pagamentoStatus: { in: ["Pendente", "Parcial"] } },
        _sum: { valorTotal: true },
      }),
      prisma.fatura.count({
        where: { cancelada: false, pagamentoStatus: { in: ["Pendente", "Parcial"] } },
      }),
      prisma.ordemServico.count({
        where: { status: { notIn: ["concluida", "cancelada", "rejeitada", "fechada"] } },
      }),
      prisma.ordemServico.count({
        where: { status: "concluida", dataConclusao: { gte: startOfMonth } },
      }),
      prisma.ordemServico.aggregate({
        where: { status: "concluida", dataConclusao: { gte: startOfMonth } },
        _sum: { valorTotal: true, valorPecas: true, valorMaoObra: true },
      }),
      prisma.jangada.count({
        where: { dataProxInspecao: { lt: in30.toISOString() } },
      }),
      prisma.jangada.count({
        where: { dataProxInspecao: { gte: in30.toISOString(), lt: in60.toISOString() } },
      }),
      prisma.stock.count({
        where: {
          OR: [
            { quantidade: { lte: 0 } },
            { quantidadeMinima: { not: null }, quantidade: { lte: prisma.stock.fields.quantidadeMinima } },
          ],
        },
      }),
      prisma.cliente.count(),
      prisma.jangada.count(),
    ]);

    const margemValor =
      (Number(margemConcluidasMes._sum.valorTotal || 0) ||
        Number(margemConcluidasMes._sum.valorMaoObra || 0) ||
        0);

    return NextResponse.json({
      faturacaoMes: Number(faturacaoMes._sum.valorTotal || 0),
      faturacaoAno: Number(faturacaoAno._sum.valorTotal || 0),
      aReceber: Number(faturasAReceber._sum.valorTotal || 0),
      faturasPorCobrar: faturasVencidas,
      osAbertas,
      osConcluidasMes,
      osValorMes: Number(margemConcluidasMes._sum.valorTotal || 0),
      osMaoObraMes: Number(margemConcluidasMes._sum.valorMaoObra || 0),
      osPecasMes: Number(margemConcluidasMes._sum.valorPecas || 0),
      margemBrutaMes: margemValor,
      jangadasExpirar30: jangadas30,
      jangadasExpirar60: jangadas60,
      stockCriticoCount: stockCritico,
      totalClientes,
      totalJangadas,
    });
  } catch (error) {
    console.error("[GET /api/dashboard/executive]", error);
    return NextResponse.json({ error: "Erro ao calcular KPIs executivos." }, { status: 500 });
  }
}
