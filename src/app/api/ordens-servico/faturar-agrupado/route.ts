import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { emitirFatura, FaturamentoError } from "@/lib/faturamento";

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const rawIds = body?.ordemServicoIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: "Indique pelo menos uma ordem de serviço." }, { status: 400 });
    }

    const ordemServicoIds = rawIds
      .map((raw) => Number(raw))
      .filter((id) => Number.isFinite(id) && id > 0);

    const pagamentoStatus = body && typeof body.pagamentoStatus === "string" && body.pagamentoStatus.trim()
      ? body.pagamentoStatus.trim()
      : "Pendente";

    const resultado = await emitirFatura({
      ordemServicoIds,
      pagamentoStatus,
      emitidaPor: access.email || "sistema",
    });

    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof FaturamentoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/ordens-servico/faturar-agrupado]", error);
    return buildDatabaseErrorResponse(error, "Erro ao emitir fatura agrupada.");
  }
}
