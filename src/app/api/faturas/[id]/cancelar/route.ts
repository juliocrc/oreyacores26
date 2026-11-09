import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { cancelarFatura, FaturamentoError } from "@/lib/faturamento";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const { id: rawId } = await context.params;
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });
    const faturaId = Number(rawId);
    if (!Number.isSafeInteger(faturaId) || faturaId <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const motivo = typeof body?.motivo === "string" ? body.motivo : undefined;

    const resultado = await cancelarFatura({
      faturaId,
      motivo,
      emitidaPor: access.email || "sistema",
    });

    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof FaturamentoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/faturas/[id]/cancelar]", error);
    return buildDatabaseErrorResponse(error, "Erro ao anular fatura.");
  }
}
