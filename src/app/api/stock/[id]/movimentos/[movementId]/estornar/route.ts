import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { canEditStock, stockStationWhere, stockWriteStatus } from "@/lib/stock-utils";
import { reverseStockMovement } from "@/lib/stock-reversals";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; movementId: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    if (!canEditStock(access)) return NextResponse.json({ error: "Sem permissao para editar stock." }, { status: 403 });
    const { id, movementId } = await context.params;
    if (![id, movementId].every(value => /^[1-9]\d*$/.test(value) && Number(value) <= 2_147_483_647)) {
      return NextResponse.json({ error: "ID invalido." }, { status: 400 });
    }
    let body;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "JSON invalido." }, { status: 400 }); }
    const reason = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!reason || reason.length > 300) return NextResponse.json({ error: "Indique um motivo entre 1 e 300 caracteres." }, { status: 400 });
    const movement = await reverseStockMovement({ stockId: Number(id), movementId: Number(movementId), reason,
      actor: `${access.userId}:${access.email}`, scope: stockStationWhere(access, resolveActiveServiceStationId(req, access)) });
    return NextResponse.json(movement);
  } catch (error) {
    const status = stockWriteStatus(error);
    return NextResponse.json({ error: status && error instanceof Error ? error.message : "Erro ao estornar movimento." }, { status: status ?? 500 });
  }
}
