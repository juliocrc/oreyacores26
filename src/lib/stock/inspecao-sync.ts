import type { Prisma } from "@prisma/client";

/**
 * Sincronização de stock <-> inspeção.
 *
 * Regras:
 *  - A reserva feita pelo orçamento converte-se em consumo real quando a
 *    inspeção é finalizada: `quantidade` desce e `quantidadeReservada` é libertada.
 *  - Tudo é reversível: re-gravar ou apagar uma inspeção desfaz os movimentos
 *    anteriores antes de recalcular (idempotência — nunca duplica stock).
 *  - Stock insuficiente NUNCA bloqueia a gravação: regista-se aviso e o
 *    movimento fica feito, deixando o défice visível no inventário.
 *
 * Os deltas são lidos de `quantidadeAntes`/`quantidadeDepois` de cada movimento,
 * o que torna a reversão correta mesmo com dados criados por versões anteriores.
 */

type TxClient = Prisma.TransactionClient;

const MOVIMENTOS_REVERSIVEIS = ["saida", "reserva", "libertar_reserva"] as const;

type EfeitoPorArtigo = {
  deltaQuantidade: number;
  deltaQuantidadeReservada: number;
  descricao: string;
};

/**
 * Calcula o efeito acumulado dos movimentos de stock de uma inspeção.
 * `saida` mexe em `quantidade`; `reserva`/`libertar_reserva` em `quantidadeReservada`.
 */
export async function calcularEfeitoMovimentos(tx: TxClient, inspecaoId: number) {
  const movimentos = await tx.movimentacaoStock.findMany({
    where: { inspecaoId, tipo: { in: [...MOVIMENTOS_REVERSIVEIS] } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      stockId: true,
      tipo: true,
      quantidade: true,
      quantidadeAntes: true,
      quantidadeDepois: true,
    },
  });

  const porArtigo = new Map<number, EfeitoPorArtigo>();

  for (const mov of movimentos) {
    const delta = (mov.quantidadeDepois ?? 0) - (mov.quantidadeAntes ?? 0);
    if (!delta) continue;

    const atual =
      porArtigo.get(mov.stockId) ??
      { deltaQuantidade: 0, deltaQuantidadeReservada: 0, descricao: "" };

    if (mov.tipo === "saida") {
      atual.deltaQuantidade += delta;
    } else {
      atual.deltaQuantidadeReservada += delta;
    }

    porArtigo.set(mov.stockId, atual);
  }

  return porArtigo;
}

/**
 * Desfaz integralmente os movimentos de stock de uma inspeção, escribiendo os
 * movimentos inversos para o histórico ficar auditável. Usado antes de
 * re-aplicar movimentos (re-gravação) e ao apagar a inspeção.
 */
export async function reverterMovimentosInspecao(
  tx: TxClient,
  inspecaoId: number,
  opts: { certificadoNumero?: string | null; usuario?: string; motivo?: string } = {}
) {
  const efeitos = await calcularEfeitoMovimentos(tx, inspecaoId);
  if (efeitos.size === 0) return 0;

  const stockIds = [...efeitos.keys()];
  const artigos = await tx.stock.findMany({
    where: { id: { in: stockIds } },
    select: { id: true, quantidade: true, quantidadeReservada: true, referencia: true },
  });
  const porId = new Map(artigos.map((a) => [a.id, a]));

  const motivo =
    opts.motivo ||
    `Reversão de movimentos de stock da inspeção ${opts.certificadoNumero || inspecaoId}`;

  let revertidos = 0;

  for (const [stockId, efeito] of efeitos) {
    const artigo = porId.get(stockId);
    if (!artigo) continue;

    if (efeito.deltaQuantidade !== 0) {
      const antes = artigo.quantidade;
      const depois = antes - efeito.deltaQuantidade;
      await tx.stock.update({ where: { id: stockId }, data: { quantidade: depois } });
      await tx.movimentacaoStock.create({
        data: {
          stockId,
          tipo: "ajuste",
          quantidade: Math.abs(efeito.deltaQuantidade),
          quantidadeAntes: antes,
          quantidadeDepois: depois,
          motivo: `${motivo} (reversão de saída)`,
          usuario: opts.usuario || "sistema",
          inspecaoId,
        },
      });
      revertidos++;
    }

    if (efeito.deltaQuantidadeReservada !== 0) {
      const antes = artigo.quantidadeReservada || 0;
      // Nunca deixar reservas negativas ao reverter.
      const depois = Math.max(0, antes - efeito.deltaQuantidadeReservada);
      if (depois !== antes) {
        await tx.stock.update({ where: { id: stockId }, data: { quantidadeReservada: depois } });
        await tx.movimentacaoStock.create({
          data: {
            stockId,
            tipo: "libertar_reserva",
            quantidade: Math.abs(depois - antes),
            quantidadeAntes: antes,
            quantidadeDepois: depois,
            motivo: `${motivo} (reversão de reserva)`,
            usuario: opts.usuario || "sistema",
            inspecaoId,
          },
        });
        revertidos++;
      }
    }
  }

  // As reversões são elas próprias movimentos; zerar o efeito para que uma
  // segunda chamada no mesmo ciclo não os reverta de novo.
  await tx.movimentacaoStock.deleteMany({
    where: { inspecaoId, tipo: { in: [...MOVIMENTOS_REVERSIVEIS] } },
  });

  return revertidos;
}
