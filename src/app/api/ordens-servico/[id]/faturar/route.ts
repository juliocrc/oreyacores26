import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { emitirFatura, FaturamentoError } from "@/lib/faturamento";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const rawId = segments[segments.length - 2];
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const pagamentoStatus = body && typeof body.pagamentoStatus === "string" && body.pagamentoStatus.trim()
      ? body.pagamentoStatus.trim()
      : "Pendente";

    const resultado = await emitirFatura({
      ordemServicoIds: [id],
      pagamentoStatus,
      emitidaPor: access.email || "sistema",
    });

    if (resultado.alreadyEmitted) {
      return NextResponse.json({ fatura: resultado.fatura, numeroFatura: resultado.numeroFatura, alreadyEmitted: true });
    }

    return NextResponse.json({ fatura: resultado.fatura, numeroFatura: resultado.numeroFatura, alreadyEmitted: false });
  } catch (error) {
    if (error instanceof FaturamentoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/ordens-servico/[id]/faturar]", error);
    return buildDatabaseErrorResponse(error, "Erro ao emitir fatura.");
  }
}
