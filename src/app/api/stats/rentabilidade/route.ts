import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";

export const CUSTO_PECAS_PCT = 0.6;

type GrupoRent = {
  key: string;
  label?: string | null;
  n: number;
  receita: number;
  maoObra: number;
  pecas: number;
  desconto: number;
  custoPecas: number;
  margem: number;
  margemPct: number;
};

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const de = sp.get("de") || "";
    const ate = sp.get("ate") || "";
    const agrupar = sp.get("agrupar") === "obra" ? "obra" : "tecnico";

    const desde = de ? new Date(`${de}T00:00:00`) : null;
    const ateDate = ate ? new Date(`${ate}T23:59:59`) : null;

    const ordens = await prisma.ordemServico.findMany({
      where: {
        NOT: { status: { in: ["cancelada", "cancelled", "no_show"] } },
      },
      include: { cliente: { select: { nome: true } }, jangada: { select: { serial: true } } },
    });

    const filtradas = ordens.filter((o) => {
      const ref = o.dataConclusao ?? o.dataAbertura;
      if (!ref) return false;
      if (desde && ref < desde) return false;
      if (ateDate && ref > ateDate) return false;
      return o.valorTotal > 0 || o.valorMaoObra > 0 || o.valorPecas > 0;
    });

    const mapa = new Map<string, GrupoRent>();
    const total: GrupoRent = { key: "TOTAL", n: 0, receita: 0, maoObra: 0, pecas: 0, desconto: 0, custoPecas: 0, margem: 0, margemPct: 0 };

    for (const o of filtradas) {
      const receita = o.valorTotal || 0;
      const maoObra = o.valorMaoObra || 0;
      const pecas = o.valorPecas || 0;
      const desconto = o.valorDesconto || 0;
      const custoPecas = pecas * CUSTO_PECAS_PCT;
      const margem = receita - custoPecas;

      const key = agrupar === "obra" ? `OT ${o.numeroOrdem}` : (o.tecnicoResponsavel || "—");
      const label =
        agrupar === "obra"
          ? [o.cliente?.nome, o.jangada?.serial].filter(Boolean).join(" · ")
          : null;

      const g = mapa.get(key) || { key, label, n: 0, receita: 0, maoObra: 0, pecas: 0, desconto: 0, custoPecas: 0, margem: 0, margemPct: 0 };
      g.n += 1;
      g.receita += receita;
      g.maoObra += maoObra;
      g.pecas += pecas;
      g.desconto += desconto;
      g.custoPecas += custoPecas;
      g.margem += margem;
      mapa.set(key, g);

      total.n += 1;
      total.receita += receita;
      total.maoObra += maoObra;
      total.pecas += pecas;
      total.desconto += desconto;
      total.custoPecas += custoPecas;
      total.margem += margem;
    }

    const finish = (g: GrupoRent) => {
      g.receita = Math.round(g.receita * 100) / 100;
      g.maoObra = Math.round(g.maoObra * 100) / 100;
      g.pecas = Math.round(g.pecas * 100) / 100;
      g.desconto = Math.round(g.desconto * 100) / 100;
      g.custoPecas = Math.round(g.custoPecas * 100) / 100;
      g.margem = Math.round(g.margem * 100) / 100;
      g.margemPct = g.receita > 0 ? Math.round((g.margem / g.receita) * 1000) / 10 : 0;
      return g;
    };

    const grupos = Array.from(mapa.values()).map(finish).sort((a, b) => b.receita - a.receita);

    return NextResponse.json({
      agrupar,
      de,
      ate,
      custoPecasPct: CUSTO_PECAS_PCT,
      total: finish(total),
      grupos,
    });
  } catch (err: unknown) {
    return buildDatabaseErrorResponse(err, err instanceof Error ? err.message : "Erro ao calcular rentabilidade");
  }
}