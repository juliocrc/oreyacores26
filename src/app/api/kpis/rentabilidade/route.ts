import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const orders = await prisma.ordemServico.findMany({
      where: {
        status: "concluida",
        faturaOrdemServicos: { is: { fatura: { is: { cancelada: false } } } },
      },
      include: {
        tecnico: { select: { id: true, nome: true } },
        serviceStation: { select: { id: true, nome: true, codigo: true } },
      },
    });

    const tecnicoMap = new Map<string, { nome: string; count: number; total: number; maoObra: number; pecas: number }>();
    const stationMap = new Map<string, { nome: string; count: number; total: number; maoObra: number; pecas: number }>();

    orders.forEach((o) => {
      const tecName = o.tecnico?.nome || o.tecnicoResponsavel || "Técnico Geral";
      const stationName = o.serviceStation?.nome || "Orey Açores (Sede)";

      const tot = Number(o.valorTotal || 0);
      const mo = Number(o.valorMaoObra || 0);
      const pc = Number(o.valorPecas || 0);

      const tCurr = tecnicoMap.get(tecName) || { nome: tecName, count: 0, total: 0, maoObra: 0, pecas: 0 };
      tCurr.count += 1;
      tCurr.total += tot;
      tCurr.maoObra += mo;
      tCurr.pecas += pc;
      tecnicoMap.set(tecName, tCurr);

      const sCurr = stationMap.get(stationName) || { nome: stationName, count: 0, total: 0, maoObra: 0, pecas: 0 };
      sCurr.count += 1;
      sCurr.total += tot;
      sCurr.maoObra += mo;
      sCurr.pecas += pc;
      stationMap.set(stationName, sCurr);
    });

    return NextResponse.json({
      tecnicos: Array.from(tecnicoMap.values()).sort((a, b) => b.total - a.total),
      estacoes: Array.from(stationMap.values()).sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    console.error("[GET /api/kpis/rentabilidade]", error);
    return NextResponse.json({ error: "Erro ao calcular KPIs de rentabilidade." }, { status: 500 });
  }
}
