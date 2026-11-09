import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { isServiceResourceReference } from '@/lib/stock-reference-rules';
import { canEditStock, stockStationWhere, stockTransaction, StockWriteError, stockWriteStatus } from "@/lib/stock-utils";
import { canViewPath } from "@/lib/user-permissions";
import { isManualStockMovement } from "@/lib/stock-reversals";

// Prisma Int is a signed 32-bit value on both supported databases.
const MAX_QUANTITY = 2_147_483_647;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    if (!canEditStock(access) && !canViewPath(access.permissions, "/stock")) return NextResponse.json({ error: "Sem permissao para consultar stock." }, { status: 403 });
    const { id } = await context.params;
    if (!/^[1-9]\d*$/.test(id) || Number(id) > MAX_QUANTITY) return NextResponse.json({ error: "ID invalido." }, { status: 400 });
    const scope = stockStationWhere(access, resolveActiveServiceStationId(req, access));
    const result = await stockTransaction(async tx => {
      const article = await tx.stock.findFirst({ where: { AND: [{ id: Number(id) }, scope] } });
      if (!article) throw new StockWriteError("Artigo nao encontrado nesta estacao.", 404);
      const movements = await tx.movimentacaoStock.findMany({ where: { stockId: article.id },
        include: { estorno: { select: { id: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      return { canEdit: canEditStock(access), movements: movements.map(movement => ({ ...movement,
        canReverse: canEditStock(access) && !isServiceResourceReference(article.referencia) && isManualStockMovement(movement) && !movement.estorno })) };
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = stockWriteStatus(error);
    return NextResponse.json({ error: status && error instanceof Error ? error.message : "Erro ao consultar movimentos." }, { status: status ?? 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    if (!canEditStock(access)) return NextResponse.json({ error: "Sem permissao para editar stock." }, { status: 403 });

    const { id: rawId } = await context.params;
    const id = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
    if (!Number.isSafeInteger(id) || id > MAX_QUANTITY) {
      return NextResponse.json({ error: "ID de stock invalido." }, { status: 400 });
    }
    let body;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "JSON invalido." }, { status: 400 }); }
    const { operacao, quantidade } = body ?? {};
    if ((operacao !== "entrada" && operacao !== "saida") ||
        !Number.isSafeInteger(quantidade) || quantidade <= 0 || quantidade > MAX_QUANTITY) {
      return NextResponse.json({ error: "Indique entrada/saida e uma quantidade inteira positiva." }, { status: 400 });
    }

    const scope = stockStationWhere(access, resolveActiveServiceStationId(req, access));
    const updated = await stockTransaction(async tx => {
      const current = await tx.stock.findFirst({ where: { AND: [{ id }, scope] } });
      if (!current) throw new StockWriteError("Artigo nao encontrado nesta estacao.", 404);
      if (isServiceResourceReference(current.referencia)) throw new StockWriteError('Recursos de servico nao permitem movimentos de stock.', 400);
      if (current.estadoArtigo === "INATIVO") throw new StockWriteError("Artigo inativo.");
      const after = current.quantidade + (operacao === "entrada" ? quantidade : -quantidade);
      if (after < Math.max(0, current.quantidadeReservada)) throw new StockWriteError("Stock disponivel insuficiente (exclui reservas).");
      if (after > MAX_QUANTITY) throw new StockWriteError("Quantidade excede o limite permitido.", 400);

      // Compare-and-swap also protects against a concurrent reservation or station change.
      const result = await tx.stock.updateMany({
        where: { id, quantidade: current.quantidade, quantidadeReservada: current.quantidadeReservada,
          serviceStationId: current.serviceStationId, estadoArtigo: current.estadoArtigo },
        data: { quantidade: operacao === "entrada" ? { increment: quantidade } : { decrement: quantidade } },
      });
      if (result.count !== 1) throw new StockWriteError("Stock alterado entretanto. Pesquise novamente.");
      await tx.movimentacaoStock.create({ data: {
        stockId: id, tipo: operacao, quantidade,
        quantidadeAntes: current.quantidade, quantidadeDepois: after,
        motivo: "Movimento pelo scanner de stock",
        usuario: `${access.userId}:${access.email}`,
      } });
      return { ...current, quantidade: after };
    });
    return NextResponse.json(updated);
  } catch (error) {
    const status = stockWriteStatus(error);
    return NextResponse.json({ error: status && error instanceof Error ? error.message : "Erro ao registar movimento." }, { status: status ?? 500 });
  }
}
