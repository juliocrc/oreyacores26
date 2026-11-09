import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { atualizarPagamentoStatusFatura, FaturamentoError } from "@/lib/faturamento";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });

    const { id: rawId } = await context.params;
    const faturaId = Number(rawId);
    if (!Number.isSafeInteger(faturaId) || faturaId <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const pagamentoStatus = body && typeof body.pagamentoStatus === "string" ? body.pagamentoStatus.trim() : null;
    if (!pagamentoStatus) {
      return NextResponse.json({ error: "Estado de pagamento em falta." }, { status: 400 });
    }
    if (body?.valorPago !== undefined && (typeof body.valorPago !== "number" || !Number.isFinite(body.valorPago))) {
      return NextResponse.json({ error: "Valor do pagamento inválido." }, { status: 400 });
    }
    const valorPago = body?.valorPago as number | undefined;

    const fatura = await atualizarPagamentoStatusFatura({
      faturaId,
      pagamentoStatus,
      valorPago,
      emitidaPor: access.email || "sistema",
    });

    return NextResponse.json({ fatura, numeroRecibo: fatura.numeroRecibo, valorPago: fatura.valorPago, valorPendente: fatura.valorPendente, pagamentoHistoricoSemRecibo: fatura.pagamentoHistoricoSemRecibo });
  } catch (error) {
    if (error instanceof FaturamentoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[PATCH /api/faturas/[id]]", error);
    return buildDatabaseErrorResponse(error, "Erro ao atualizar estado de pagamento.");
  }
}
