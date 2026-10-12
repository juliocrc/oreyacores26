import prisma from "@/lib/prisma";
import { calcIva, calcSubtotal, calcTotal } from "@/lib/iva";
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  ensureClienteNumero,
  generateNumeroFatura,
  generateNumeroNotaCredito,
  generateNumeroRecibo,
  parseOrdemServicoMeta,
  toOrdemServicoMetaJson,
  type OrdemServicoMeta,
} from "@/lib/ordens-servico";
import { logAuditoria } from "@/lib/auditoria";

export type OrdemFaturavel = {
  id: number;
  numeroOrdem: string;
  status: string;
  clienteId: number | null;
  shipId: number | null;
  isIsentoIva: boolean;
  codigoIsencaoIva: string | null;
  valorPecas: number;
  valorMaoObra: number;
  valorDesconto: number;
  metadados: string | null;
};

export type FaturaComOrdens = Awaited<ReturnType<typeof carregarFaturaPorOrdemServico>>;

const ORDEM_FATURAVEL_SELECT = {
  id: true,
  numeroOrdem: true,
  status: true,
  clienteId: true,
  shipId: true,
  isIsentoIva: true,
  codigoIsencaoIva: true,
  valorPecas: true,
  valorMaoObra: true,
  valorDesconto: true,
  metadados: true,
} as const;

const ORDEM_DOCUMENTO_INCLUDE = {
  jangada: {
    select: {
      serial: true,
      brand: true,
      model: true,
      owner: true,
      shipNameManual: true,
    },
  },
  cliente: {
    select: {
      nome: true,
      numeroCliente: true,
      nif: true,
      morada: true,
      localidade: true,
      ilha: true,
      modoPagamento: true,
    },
  },
  serviceStation: {
    select: { codigo: true, nome: true },
  },
  tecnico: {
    select: { nome: true },
  },
} as const;

export function calcularTotaisOrdem(order: Pick<OrdemFaturavel, "valorPecas" | "valorMaoObra" | "valorDesconto" | "isIsentoIva">) {
  const subtotal = calcSubtotal(order.valorPecas, order.valorMaoObra, order.valorDesconto);
  const iva = calcIva(subtotal, order.isIsentoIva);
  const total = calcTotal(order.valorPecas, order.valorMaoObra, order.valorDesconto, order.isIsentoIva);
  return { subtotal, iva, total };
}

export async function carregarFaturaPorOrdemServico(ordemServicoId: number) {
  return prisma.faturaOrdemServico.findFirst({
    where: { ordemServicoId },
    include: {
      fatura: {
        include: {
          ordemServicos: {
            include: {
              ordemServico: {
                include: ORDEM_DOCUMENTO_INCLUDE,
              },
            },
          },
          notaCredito: true,
          recibos: { orderBy: { dataEmissao: "desc" } },
          cliente: {
            select: {
              nome: true,
              numeroCliente: true,
              nif: true,
              morada: true,
              localidade: true,
              ilha: true,
              modoPagamento: true,
            },
          },
        },
      },
    },
  });
}

export type OrdemDocumento = Awaited<ReturnType<typeof carregarFaturaPorOrdemServico>> extends {
  fatura: { ordemServicos: Array<{ ordemServico: infer T }> };
}
  ? T
  : never;

export function resumoFatura(fatura: FaturaComOrdens) {
  const fat = fatura?.fatura ?? null;
  const ordens = fat?.ordemServicos?.map((l) => l.ordemServico) ?? [];
  const primary = ordens[0] ?? null;

  const cliente = fat?.cliente ?? primary?.cliente ?? null;
  const jangada = primary?.jangada ?? null;
  const clienteNome = cliente?.nome || jangada?.owner || "Cliente particular";
  const navio = jangada?.shipNameManual || "—";
  const jangadaLabel = `${jangada?.brand || ""} ${jangada?.model || ""}`.trim() || "—";
  const issuer = primary?.serviceStation?.nome || "Orey Técnica - Serviços Navais";
  const emissao = fat?.dataEmissao || new Date();
  const numeroFatura = fat?.numeroFatura || primary?.numeroOrdem || "FAT-S/N";
  const dataTrabalho = primary?.dataConclusao || primary?.dataAbertura || primary?.createdAt || null;
  const tecnico = primary?.tecnico?.nome ?? null;

  return {
    fatura: fat,
    ordens,
    primary,
    cliente,
    jangada,
    clienteNome,
    navio,
    jangadaLabel,
    issuer,
    emissao,
    numeroFatura,
    dataTrabalho,
    tecnico,
    subtotal: Number(fat?.valorSubtotal ?? 0),
    iva: Number(fat?.valorIva ?? 0),
    total: Number(fat?.valorTotal ?? 0),
    isentoIva: Boolean(fat?.isIsentoIva ?? primary?.isIsentoIva ?? false),
    codigoIsencaoIva: fat?.codigoIsencaoIva ?? primary?.codigoIsencaoIva ?? null,
    condicoesPagamento: cliente?.modoPagamento || "Pronto pagamento",
    pagamentoStatus: fat?.pagamentoStatus || "Pendente",
    numeroNotaCredito: fat?.notaCredito?.numeroNotaCredito ?? null,
    numeroRecibo: fat?.recibos?.[0]?.numeroRecibo ?? null,
  };
}

export type EmitirFaturaResultado =
  | { fatura: unknown; alreadyEmitted: true; numeroFatura: string }
  | { fatura: unknown; alreadyEmitted: false; numeroFatura: string };

export async function emitirFatura(input: {
  ordemServicoIds: number[];
  pagamentoStatus?: string;
  emitidaPor: string;
}): Promise<EmitirFaturaResultado> {
  const ids = [...new Set(input.ordemServicoIds)]
    .filter((id) => Number.isFinite(id) && id > 0)
    .map(Number);

  if (ids.length === 0) {
    throw new FaturamentoError("Nenhuma ordem de serviço indicada para faturação.", 400);
  }

  const pagamentoStatus = input.pagamentoStatus && input.pagamentoStatus.trim()
    ? input.pagamentoStatus.trim()
    : "Pendente";

  const ordens = await prisma.ordemServico.findMany({
    where: { id: { in: ids } },
    select: ORDEM_FATURAVEL_SELECT,
  });

  if (ordens.length !== ids.length) {
    throw new FaturamentoError("Algumas ordens de serviço não foram encontradas.", 404);
  }

  const agrupado = ordens.length > 1;
  const ordensAindaNaoFaturadas = ordens;

  const linkExistente = await prisma.faturaOrdemServico.findFirst({
    where: { ordemServicoId: { in: ids } },
    include: { fatura: true },
  });
  if (linkExistente) {
    return { fatura: linkExistente.fatura, alreadyEmitted: true, numeroFatura: linkExistente.fatura.numeroFatura };
  }

  const naoConcluidas = ordensAindaNaoFaturadas.filter((o) => o.status !== "concluida");
  if (naoConcluidas.length > 0) {
    const lista = naoConcluidas.map((o) => o.numeroOrdem || `#${o.id}`).join(", ");
    throw new FaturamentoError(`Apenas ordens concluídas podem ser faturadas. Faltam concluir: ${lista}.`, 400);
  }

  const clienteIds = [...new Set(ordensAindaNaoFaturadas.map((o) => o.clienteId))];
  if (clienteIds.length > 1) {
    throw new FaturamentoError("As ordens selecionadas pertencem a clientes diferentes.", 400);
  }
  const clienteId = clienteIds[0] ?? null;

  let subtotalTotal = 0;
  let ivaTotal = 0;
  let valorTotal = 0;
  for (const o of ordensAindaNaoFaturadas) {
    const { subtotal, iva, total } = calcularTotaisOrdem(o);
    subtotalTotal += subtotal;
    ivaTotal += iva;
    valorTotal += total;
  }

  if (!Number.isFinite(valorTotal) || valorTotal < 0) {
    throw new FaturamentoError("Valores das ordens inválidos para faturação.", 400);
  }

  const emitidaPor = input.emitidaPor || "sistema";
  const numeroFatura = await generateNumeroFatura();
  const shipId = ordensAindaNaoFaturadas[0]?.shipId ?? null;

  const clienteNumero = clienteId ? await ensureClienteNumero(clienteId) : null;

  const dataEmissao = new Date();

  const fatura = await prisma.$transaction(async (tx) => {
    const created = await tx.fatura.create({
      data: {
        numeroFatura,
        clienteId,
        shipId,
        valorSubtotal: subtotalTotal,
        valorIva: ivaTotal,
        valorTotal,
        isIsentoIva: ordensAindaNaoFaturadas.every((o) => o.isIsentoIva),
        codigoIsencaoIva: ordensAindaNaoFaturadas[0]?.codigoIsencaoIva ?? null,
        pagamentoStatus,
        dataEmissao,
        emitidaPor,
        metadados: JSON.stringify({
          numeroOrdens: ordensAindaNaoFaturadas.map((o) => o.numeroOrdem || `#${o.id}`),
        }),
      },
    });

    for (const order of ordensAindaNaoFaturadas) {
      await tx.faturaOrdemServico.create({
        data: { faturaId: created.id, ordemServicoId: order.id },
      });

      const { total } = calcularTotaisOrdem(order);
      const previousMeta = parseOrdemServicoMeta(order.metadados);
      let nextMeta: OrdemServicoMeta = appendWorkflowTransition(previousMeta, "concluida", {
        origin: "faturacao",
        message: agrupado
          ? `Fatura ${numeroFatura} (agrupada) emitida para a OT ${order.numeroOrdem}.`
          : `Fatura ${numeroFatura} emitida para a OT ${order.numeroOrdem}.`,
        user: emitidaPor,
      });
      nextMeta = appendOrdemServicoLog(nextMeta, {
        type: "FATURA",
        message: `Fatura ${numeroFatura} emitida. Total: €${total.toFixed(2)}.`,
        user: emitidaPor,
      });
      nextMeta = {
        ...nextMeta,
        faturaId: created.id,
        faturaNumero: numeroFatura,
        faturaEmitidaEm: dataEmissao.toISOString(),
        faturaEmitidaPor: emitidaPor,
        pagamentoStatus,
      };

      await tx.ordemServico.update({
        where: { id: order.id },
        data: { metadados: toOrdemServicoMetaJson(nextMeta) },
      });

      await tx.ordemServicoLog.create({
        data: {
          ordemServicoId: order.id,
          type: "FATURA",
          message: `Fatura ${numeroFatura} emitida. Total: €${total.toFixed(2)}.`,
          user: emitidaPor,
        },
      });
    }

    return created;
  });

  await logAuditoria({
    tabela: "Fatura",
    tipoOperacao: "CREATE",
    idRegisto: fatura.id,
    descricao: agrupado
      ? `Emissão da fatura agrupada ${numeroFatura} (${ordensAindaNaoFaturadas.length} OT) total €${valorTotal.toFixed(2)}`
      : `Emissão da fatura ${numeroFatura} para a OT ${ordensAindaNaoFaturadas[0]?.numeroOrdem} (total €${valorTotal.toFixed(2)})`,
    usuario: emitidaPor,
    dadosDepois: fatura,
  });

  if (clienteNumero && clienteId) {
    await logAuditoria({
      tabela: "Cliente",
      tipoOperacao: "UPDATE",
      idRegisto: clienteId,
      descricao: `Nº de cliente atribuído automaticamente (${clienteNumero}) na emissão da fatura ${numeroFatura}.`,
      usuario: emitidaPor,
    });
  }

  return { fatura, alreadyEmitted: false, numeroFatura };
}

export class FaturamentoError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "FaturamentoError";
    this.status = status;
  }
}

export async function atualizarPagamentoStatusFatura(input: {
  faturaId: number;
  pagamentoStatus: string;
  valorPago?: number;
  emitidaPor: string;
}) {
  const { faturaId, pagamentoStatus, emitidaPor } = input;
  const valorPago = Number(input.valorPago);
  const valorPagoFinite = Number.isFinite(valorPago) && valorPago > 0 ? valorPago : null;

  const fatura = await prisma.fatura.findUnique({
    where: { id: faturaId },
    include: { ordemServicos: { include: { ordemServico: { select: { id: true, numeroOrdem: true, metadados: true } } } } },
  });
  if (!fatura) {
    throw new FaturamentoError("Fatura não encontrada.", 404);
  }
  if (fatura.cancelada) {
    throw new FaturamentoError("Fatura cancelada não pode ser atualizada.", 400);
  }

  const novoStatus = pagamentoStatus.trim();
  const ordens = fatura.ordemServicos.map((l) => l.ordemServico);
  const dataEmissao = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.fatura.update({
      where: { id: faturaId },
      data: { pagamentoStatus: novoStatus },
    });

    if (novoStatus === "Pago") {
      const jaExisteReciboPago = await tx.recibo.findFirst({
        where: { faturaId, pagamentoStatus: "Pago" },
      });
      if (!jaExisteReciboPago) {
        const numeroRecibo = await generateNumeroRecibo();
        await tx.recibo.create({
          data: {
            numeroRecibo,
            faturaId,
            valorPago: Number(fatura.valorTotal),
            pagamentoStatus: "Pago",
            dataEmissao,
            emitidaPor,
          },
        });
      }
    } else if (novoStatus === "Pago Parcialmente" && valorPagoFinite !== null) {
      await tx.recibo.create({
        data: {
          numeroRecibo: await generateNumeroRecibo(),
          faturaId,
          valorPago: valorPagoFinite,
          pagamentoStatus: "Pago Parcialmente",
          dataEmissao,
          emitidaPor,
        },
      });
    }

    for (const ordem of ordens) {
      const previousMeta = parseOrdemServicoMeta(ordem.metadados);
      let nextMeta: OrdemServicoMeta = {
        ...previousMeta,
        pagamentoStatus: novoStatus,
      };
      nextMeta = appendOrdemServicoLog(nextMeta, {
        type: "PAGAMENTO",
        message: `Estado de pagamento da fatura ${fatura.numeroFatura} atualizado para "${novoStatus}".`,
        user: emitidaPor,
      });
      await tx.ordemServico.update({
        where: { id: ordem.id },
        data: { metadados: toOrdemServicoMetaJson(nextMeta) },
      });
      await tx.ordemServicoLog.create({
        data: {
          ordemServicoId: ordem.id,
          type: "PAGAMENTO",
          message: `Estado de pagamento da fatura ${fatura.numeroFatura} atualizado para "${novoStatus}".`,
          user: emitidaPor,
        },
      });
    }

    return updated;
  });

  await logAuditoria({
    tabela: "Fatura",
    tipoOperacao: "UPDATE",
    idRegisto: fatura.id,
    descricao: `Estado de pagamento da fatura ${fatura.numeroFatura} alterado para "${novoStatus}".`,
    usuario: emitidaPor,
    dadosDepois: result,
  });

  return result;
}

export async function cancelarFatura(input: {
  faturaId: number;
  motivo?: string;
  emitidaPor: string;
}) {
  const { faturaId, motivo, emitidaPor } = input;

  const fatura = await prisma.fatura.findUnique({
    where: { id: faturaId },
    include: { ordemServicos: { include: { ordemServico: { select: { id: true, numeroOrdem: true, metadados: true } } } } },
  });
  if (!fatura) {
    throw new FaturamentoError("Fatura não encontrada.", 404);
  }
  if (fatura.cancelada) {
    return { fatura, notaCredito: await prisma.notaCredito.findFirst({ where: { faturaId } }), alreadyCancelled: true };
  }

  const ordens = fatura.ordemServicos.map((l) => l.ordemServico);
  const numeroNotaCredito = await generateNumeroNotaCredito();
  const dataEmissao = new Date();
  const motivoFinal = (motivo || "").trim() || "Anulação da fatura de referência";

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.fatura.update({
      where: { id: faturaId },
      data: {
        cancelada: true,
        dataCancelamento: dataEmissao,
        motivoCancelamento: motivoFinal,
        pagamentoStatus: "Cancelado",
      },
    });

    const notaCredito = await tx.notaCredito.create({
      data: {
        numeroNotaCredito,
        faturaId,
        valorTotal: Number(fatura.valorTotal),
        dataEmissao,
        emitidaPor,
        motivo: motivoFinal,
      },
    });

    for (const ordem of ordens) {
      const previousMeta = parseOrdemServicoMeta(ordem.metadados);
      let nextMeta: OrdemServicoMeta = {
        ...previousMeta,
        pagamentoStatus: "Cancelado",
      };
      nextMeta = appendOrdemServicoLog(nextMeta, {
        type: "CANCELAMENTO",
        message: `Fatura ${fatura.numeroFatura} anulada${motivoFinal ? ` (${motivoFinal})` : ""}. Nota de crédito ${numeroNotaCredito} emitida.`,
        user: emitidaPor,
      });
      await tx.ordemServico.update({
        where: { id: ordem.id },
        data: { metadados: toOrdemServicoMetaJson(nextMeta) },
      });
      await tx.ordemServicoLog.create({
        data: {
          ordemServicoId: ordem.id,
          type: "CANCELAMENTO",
          message: `Fatura ${fatura.numeroFatura} anulada. Nota de crédito ${numeroNotaCredito} emitida.`,
          user: emitidaPor,
        },
      });
    }

    return { updated, notaCredito };
  });

  await logAuditoria({
    tabela: "Fatura",
    tipoOperacao: "UPDATE",
    idRegisto: fatura.id,
    descricao: `Anulação da fatura ${fatura.numeroFatura}${motivoFinal ? ` (${motivoFinal})` : ""}.`,
    usuario: emitidaPor,
    dadosDepois: result.updated,
  });
  await logAuditoria({
    tabela: "NotaCredito",
    tipoOperacao: "CREATE",
    idRegisto: result.notaCredito.id,
    descricao: `Nota de crédito ${numeroNotaCredito} emitida para a fatura ${fatura.numeroFatura} (€${Number(fatura.valorTotal).toFixed(2)}).`,
    usuario: emitidaPor,
    dadosDepois: result.notaCredito,
  });

  return { fatura: result.updated, notaCredito: result.notaCredito, alreadyCancelled: false };
}
