import type { MovimentacaoStock, Prisma } from "@prisma/client";
import { isServiceResourceReference } from "@/lib/stock-reference-rules";
import { StockWriteError, stockTransaction } from "@/lib/stock-utils";

export function isManualStockMovement(movement: MovimentacaoStock) {
  // Shipped workflow writers omitted foreign keys; deleted workflows also leave
  // SetNull links. Their persisted audit reasons must not become manual stock.
  const reason = (movement.motivo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const workflow = /^(?:consumo (?:ot|inspecao|checklist)\b|substituicao de (?:artigo|hru) na jangada\b|reversao de movimentos de stock da inspecao\b|rececao pedido\b|reserva\b)/i.test(reason);
  return ["entrada", "saida", "ajuste"].includes(movement.tipo) &&
    movement.reversaoDeId == null && movement.ordemServicoId == null &&
    movement.inspecaoId == null && movement.pedidoReposicaoId == null && !workflow;
}

export async function reverseStockMovement(input: {
  stockId: number; movementId: number; reason: string; actor: string; scope: Prisma.StockWhereInput;
}) {
  // A unique-key loser must leave the aborted transaction before reading the winner.
  const execute = () => stockTransaction(async tx => {
    const current = await tx.stock.findFirst({ where: { AND: [{ id: input.stockId }, input.scope] } });
    if (!current) throw new StockWriteError("Artigo nao encontrado nesta estacao.", 404);
    if (isServiceResourceReference(current.referencia)) throw new StockWriteError("Recursos de servico nao permitem estornos.", 400);
    const original = await tx.movimentacaoStock.findFirst({ where: { id: input.movementId, stockId: current.id } });
    if (!original) throw new StockWriteError("Movimento nao encontrado neste artigo.", 404);
    if (!isManualStockMovement(original)) throw new StockWriteError("Apenas movimentos manuais podem ser estornados.", 400);
    const existing = await tx.movimentacaoStock.findUnique({ where: { reversaoDeId: original.id } });
    if (existing) return existing;

    const delta = original.quantidadeAntes - original.quantidadeDepois;
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) !== original.quantidade ||
        (original.tipo === "entrada" && delta >= 0) || (original.tipo === "saida" && delta <= 0)) {
      throw new StockWriteError("Movimento sem delta valido para estorno.", 400);
    }
    const after = current.quantidade + delta;
    if (after < Math.max(0, current.quantidadeReservada)) throw new StockWriteError("Stock disponivel insuficiente (exclui reservas).");
    if (after > 2_147_483_647) throw new StockWriteError("Quantidade excede o limite permitido.", 400);
    const result = await tx.stock.updateMany({
      where: { id: current.id, quantidade: current.quantidade, quantidadeReservada: current.quantidadeReservada,
        serviceStationId: current.serviceStationId, estadoArtigo: current.estadoArtigo },
      data: { quantidade: { increment: delta } },
    });
    if (result.count !== 1) throw new StockWriteError("Stock alterado entretanto. Recarregue.");
    return tx.movimentacaoStock.create({ data: {
      stockId: current.id, tipo: "estorno", quantidade: Math.abs(delta),
      quantidadeAntes: current.quantidade, quantidadeDepois: after,
      motivo: input.reason, usuario: input.actor, reversaoDeId: original.id,
    } });
  });
  try { return await execute(); }
  catch (error) {
    const unique = error as { code?: string; meta?: { target?: unknown } };
    const target = unique.meta?.target;
    if (unique.code !== "P2002" || !(Array.isArray(target)
      ? target.length === 1 && target[0] === "reversaoDeId"
      : target === "MovimentacaoStock_reversaoDeId_key")) throw error;
    // Revalidate article and station access on replay, not just the unique ID.
    return execute();
  }
}
