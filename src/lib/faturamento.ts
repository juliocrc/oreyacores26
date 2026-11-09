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
import { billingRecipient } from "@/lib/billing-recipient";
import { invoiceNumberFromWork, invoiceWorkReferences } from "@/lib/invoice-number";
import { invoiceDisplay } from "@/lib/invoice-official";

export type OrdemFaturavel = {
  id: number;
  numeroOrdem: string;
  status: string;
  orcamentoStatus: string;
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
  orcamentoStatus: true,
  clienteId: true,
  shipId: true,
  isIsentoIva: true,
  codigoIsencaoIva: true,
  valorPecas: true,
  valorMaoObra: true,
  valorDesconto: true,
  metadados: true,
  updatedAt: true,
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
  const frozen = fat?.metadados ? JSON.parse(fat.metadados) : {};
  const ordens = fat?.ordemServicos?.map((l) => {
    const snapshot = frozen.ordensSnapshot?.find((order: { id: number }) => order.id === l.ordemServico.id);
    return snapshot ? { ...l.ordemServico, ...snapshot } as typeof l.ordemServico : l.ordemServico;
  }) ?? [];
  const primary = ordens[0] ?? null;

  const cliente = frozen.destinatario ? { ...fat?.cliente, ...frozen.destinatario } : fat?.cliente ?? primary?.cliente ?? null;
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
    ...(fat ? invoiceDisplay(fat) : {}),
    ...invoiceWorkReferences(fat?.metadados),
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

export type EmitirFaturaResultado = ReturnType<typeof invoiceWorkReferences> & (
  | { fatura: unknown; alreadyEmitted: true; numeroFatura: string }
  | { fatura: unknown; alreadyEmitted: false; numeroFatura: string });

export function validarPagamentoStatus(value: string) {
  const status = value.trim();
  if (!["Pendente", "Pago Parcialmente", "Pago", "Vencido"].includes(status)) {
    throw new FaturamentoError("Estado de pagamento inválido.", 400);
  }
  return status;
}

export function calcularSaldoFatura(fatura: { valorTotal: number; cancelada: boolean; pagamentoStatus?: string; recibos: Array<{ valorPago: number }> }) {
  const totalCentimos = Math.round(Number(fatura.valorTotal) * 100);
  const pagoCentimos = fatura.recibos.reduce((sum, r) => sum + Math.round(Number(r.valorPago) * 100), 0);
  if (!Number.isSafeInteger(totalCentimos) || totalCentimos < 0 || !Number.isSafeInteger(pagoCentimos) ||
    fatura.recibos.some(recibo => !Number.isFinite(Number(recibo.valorPago)) || Number(recibo.valorPago) < 0)) {
    throw new FaturamentoError("Valores financeiros inválidos. É necessária reconciliação.", 409);
  }
  const valorPago = pagoCentimos / 100;
  // Legacy issuance could persist Pago without a receipt. Do not collect it again.
  const pagamentoHistoricoSemRecibo = fatura.pagamentoStatus === "Pago" &&
    pagoCentimos < totalCentimos;
  return { valorPago, valorPendente: fatura.cancelada || pagamentoHistoricoSemRecibo ? 0 : Math.max(0, totalCentimos - pagoCentimos) / 100, pagamentoHistoricoSemRecibo };
}

function conflitoFinanceiro(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2002")) {
    throw new FaturamentoError("Conflito na operação financeira. Consulte o estado atual antes de voltar a submeter.", 409);
  }
  throw error;
}

export async function emitirFatura(input: {
  ordemServicoIds: number[];
  pagamentoStatus?: string;
  emitidaPor: string;
  updatedAt?: string;
}): Promise<EmitirFaturaResultado> {
  const ids = [...new Set(input.ordemServicoIds)]
    .filter((id) => Number.isFinite(id) && id > 0)
    .map(Number);

  if (ids.length === 0) {
    throw new FaturamentoError("Nenhuma ordem de serviço indicada para faturação.", 400);
  }

  const pagamentoStatus = validarPagamentoStatus(input.pagamentoStatus ?? "Pendente");
  if (pagamentoStatus === "Pago Parcialmente") {
    throw new FaturamentoError("Emita a fatura pendente e registe um pagamento parcial com valor explícito.", 400);
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const ordens = await tx.ordemServico.findMany({
      where: { id: { in: ids } },
      select: ORDEM_FATURAVEL_SELECT,
    });

    if (ordens.length !== ids.length) {
      throw new FaturamentoError("Algumas ordens de serviço não foram encontradas.", 404);
    }

    const agrupado = ordens.length > 1;
    const ordensAindaNaoFaturadas = ordens;

    const linksExistentes = await tx.faturaOrdemServico.findMany({
      where: { ordemServicoId: { in: ids } },
      include: { fatura: { include: { ordemServicos: true } } },
    });
    if (linksExistentes.length > 0) {
      const existing = linksExistentes[0].fatura;
      if (existing.cancelada || linksExistentes.length !== ids.length ||
        linksExistentes.some((link) => link.faturaId !== existing.id) ||
        existing.ordemServicos.length !== ids.length ||
        existing.ordemServicos.some((link) => !ids.includes(link.ordemServicoId))) {
        throw new FaturamentoError("A seleção contém ordens já faturadas noutra composição ou fatura cancelada.", 409);
      }
      return { fatura: existing, alreadyEmitted: true, numeroFatura: existing.numeroFatura, ...invoiceWorkReferences(existing.metadados) };
    }

    if (ordens.some((order) => order.orcamentoStatus !== "Aprovado")) {
      throw new FaturamentoError("Apenas ordens com orçamento aprovado podem ser faturadas.", 400);
    }
    if (input.updatedAt && (ordens.length !== 1 ||
      !Number.isFinite(new Date(input.updatedAt).getTime()) || ordens[0].updatedAt.getTime() !== new Date(input.updatedAt).getTime())) {
      throw new FaturamentoError("A ordem foi alterada. Atualize antes de registar a fatura.", 409);
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
    if (agrupado && clienteId === null) {
      throw new FaturamentoError("A faturação agrupada exige um cliente identificado.", 400);
    }
    const primeiraOrdem = ordensAindaNaoFaturadas[0];
    const cliente = clienteId ? await tx.cliente.findUnique({ where: { id: clienteId } }) : null;
    const destinatarios = ordensAindaNaoFaturadas.map(order => billingRecipient(cliente,
      (parseOrdemServicoMeta(order.metadados) as { destinatarioFaturacao?: unknown }).destinatarioFaturacao));
    if (destinatarios.some(value => !value.nome || !value.nif || !value.morada)) {
      throw new FaturamentoError("Preencha nome, NIF e morada do destinatario antes de registar a fatura.", 400);
    }
    for (const order of ordensAindaNaoFaturadas) {
      const lines = parseOrdemServicoMeta(order.metadados).linhas;
      if (Array.isArray(lines) && (!lines.length || lines.some(line => !line.descricao?.trim() ||
        !Number.isFinite(line.quantidade) || Number(line.quantidade) <= 0 ||
        !Number.isFinite(line.unitPrice) || Number(line.unitPrice) < 0))) {
        throw new FaturamentoError("Artigos invalidos: indique descricao, quantidade positiva e preco valido.", 400);
      }
    }
    if (agrupado && destinatarios.some(value => JSON.stringify(value) !== JSON.stringify(destinatarios[0]))) {
      throw new FaturamentoError("As ordens agrupadas devem ter o mesmo destinatario de faturacao.", 400);
    }
    if (agrupado && ordensAindaNaoFaturadas.some((order) =>
      order.isIsentoIva !== primeiraOrdem.isIsentoIva ||
      (order.codigoIsencaoIva ?? null) !== (primeiraOrdem.codigoIsencaoIva ?? null))) {
      throw new FaturamentoError("As ordens agrupadas devem ter o mesmo regime e código de isenção de IVA.", 400);
    }

    let subtotalTotal = 0;
    let ivaTotal = 0;
    let valorTotal = 0;
    for (const o of ordensAindaNaoFaturadas) {
      const { subtotal, iva, total } = calcularTotaisOrdem(o);
      subtotalTotal += subtotal;
      ivaTotal += iva;
      valorTotal += total;
    }
    subtotalTotal = Math.round(subtotalTotal * 100) / 100;
    ivaTotal = Math.round(ivaTotal * 100) / 100;
    valorTotal = Math.round(valorTotal * 100) / 100;

    if (!Number.isFinite(valorTotal) || valorTotal < 0) {
      throw new FaturamentoError("Valores das ordens inválidos para faturação.", 400);
    }

    const emitidaPor = input.emitidaPor || "sistema";
    const numerosObra = [...new Set(ordensAindaNaoFaturadas.map(order => order.numeroOrdem.trim().toUpperCase()).filter(Boolean))].sort();
    const numeroObra = numerosObra.length === 1 ? numerosObra[0] : null;
    // Distinct grouped works have no stable primary: retain the generic series.
    const numeroDerivado = numeroObra && ordensAindaNaoFaturadas.every(order => order.numeroOrdem.trim().toUpperCase() === numeroObra)
      ? invoiceNumberFromWork(numeroObra) : null;
    const numeroFatura = numeroDerivado ?? await generateNumeroFatura();
    if (numeroDerivado && await tx.fatura.findUnique({ where: { numeroFatura } })) {
      throw new FaturamentoError(`O numero ${numeroFatura} ja foi emitido, mesmo que anulado. Nao pode ser reutilizado.`, 409);
    }
    const shipId = ordensAindaNaoFaturadas[0]?.shipId ?? null;

    const dataEmissao = new Date();

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
          numeroObra,
          numerosObra,
          numeroOrdens: ordensAindaNaoFaturadas.map((o) => o.numeroOrdem || `#${o.id}`),
          destinatario: destinatarios[0],
          ordensSnapshot: ordensAindaNaoFaturadas.map(order => ({ id: order.id, numeroOrdem: order.numeroOrdem,
            numeroObra: order.numeroOrdem.trim().toUpperCase(), metadados: order.metadados,
            valorPecas: order.valorPecas, valorMaoObra: order.valorMaoObra, valorDesconto: order.valorDesconto })),
        }),
      },
    });

    if (pagamentoStatus === "Pago") {
      if (Math.round(valorTotal * 100) <= 0) throw new FaturamentoError("Não é possível registar um pagamento de valor zero.", 400);
      await tx.recibo.create({
        data: { numeroRecibo: await generateNumeroRecibo(), faturaId: created.id, valorPago: valorTotal, pagamentoStatus: "Pago", dataEmissao, emitidaPor },
      });
    }

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

    return { fatura: created, alreadyEmitted: false, numeroFatura, numeroObra, numerosObra };
  }, { isolationLevel: "Serializable" }).catch(conflitoFinanceiro);

  if (resultado.alreadyEmitted) return resultado;
  const fatura = resultado.fatura;
  await logAuditoria({
    tabela: "Fatura",
    tipoOperacao: "CREATE",
    idRegisto: fatura.id,
    descricao: `Emissão da fatura ${resultado.numeroFatura} (total €${Number(fatura.valorTotal).toFixed(2)})`,
    usuario: input.emitidaPor,
    dadosDepois: fatura,
  });

  const clienteNumero = fatura.clienteId ? await ensureClienteNumero(fatura.clienteId) : null;
  if (clienteNumero && fatura.clienteId) {
    await logAuditoria({
      tabela: "Cliente",
      tipoOperacao: "UPDATE",
      idRegisto: fatura.clienteId,
      descricao: `Nº de cliente atribuído automaticamente (${clienteNumero}) na emissão da fatura ${resultado.numeroFatura}.`,
      usuario: input.emitidaPor,
    });
  }

  return resultado;
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
  const novoStatus = validarPagamentoStatus(pagamentoStatus);
  // valorPago is an incremental receipt amount, never a replacement total.
  const valorPago = input.valorPago;
  if (valorPago !== undefined && (!Number.isFinite(valorPago) || Math.round(valorPago * 100) <= 0)) {
    throw new FaturamentoError("O valor do pagamento deve ser positivo.", 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const fatura = await tx.fatura.findUnique({
      where: { id: faturaId },
      include: { recibos: { orderBy: { dataEmissao: "desc" } }, ordemServicos: { include: { ordemServico: { select: { id: true, numeroOrdem: true, metadados: true } } } } },
    });
    if (!fatura) {
      throw new FaturamentoError("Fatura não encontrada.", 404);
    }
    if (fatura.cancelada) {
      throw new FaturamentoError("Fatura cancelada não pode ser atualizada.", 400);
    }

    const ordens = fatura.ordemServicos.map((l) => l.ordemServico);
    const dataEmissao = new Date();
    const saldo = calcularSaldoFatura(fatura);
    if (saldo.valorPago > Number(fatura.valorTotal)) {
      throw new FaturamentoError("Os recibos existentes excedem o total da fatura. É necessária reconciliação.", 409);
    }
    if (saldo.pagamentoHistoricoSemRecibo) {
      if (novoStatus === "Pago" && valorPago === undefined) {
        return { ...fatura, ...saldo, numeroRecibo: fatura.recibos[0]?.numeroRecibo ?? null };
      }
      throw new FaturamentoError("Fatura historicamente paga com recibos em falta. É necessária reconciliação antes de alterar pagamentos.", 409);
    }
    if (novoStatus === "Pago" && saldo.valorPago > 0 && saldo.valorPendente === 0 && valorPago === undefined) {
      return { ...fatura, ...saldo, numeroRecibo: fatura.recibos[0]?.numeroRecibo ?? null };
    }
    if (novoStatus === "Pago Parcialmente" && valorPago === undefined) {
      throw new FaturamentoError("Indique o valor incremental do pagamento parcial.", 400);
    }
    if (valorPago !== undefined && novoStatus !== "Pago" && novoStatus !== "Pago Parcialmente") {
      throw new FaturamentoError("Este estado não permite registar pagamentos.", 400);
    }
    const montante = novoStatus === "Pago" ? (valorPago ?? saldo.valorPendente) : (valorPago ?? 0);
    const centimos = Math.round(montante * 100);
    const pendenteCentimos = Math.round(saldo.valorPendente * 100);
    if (centimos > pendenteCentimos || (novoStatus === "Pago" && (centimos <= 0 || centimos !== pendenteCentimos)) ||
      (novoStatus === "Pago Parcialmente" && centimos >= pendenteCentimos)) {
      throw new FaturamentoError("Valor incompatível com o saldo pendente da fatura.", 400);
    }
    if ((novoStatus === "Pendente" && saldo.valorPago > 0) || (novoStatus === "Vencido" && saldo.valorPendente === 0)) {
      throw new FaturamentoError("Estado incompatível com os recibos existentes.", 400);
    }

    const updated = await tx.fatura.update({
      where: { id: faturaId },
      data: { pagamentoStatus: novoStatus },
    });

    let numeroRecibo = fatura.recibos[0]?.numeroRecibo ?? null;
    if (centimos > 0) {
      numeroRecibo = await generateNumeroRecibo();
      await tx.recibo.create({
        data: {
          numeroRecibo,
          faturaId,
          valorPago: centimos / 100,
          pagamentoStatus: novoStatus,
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

    return { ...updated, numeroRecibo, valorPago: Math.round((saldo.valorPago + centimos / 100) * 100) / 100, valorPendente: (pendenteCentimos - centimos) / 100, pagamentoHistoricoSemRecibo: false };
  }, { isolationLevel: "Serializable" }).catch(conflitoFinanceiro);

  await logAuditoria({
    tabela: "Fatura",
    tipoOperacao: "UPDATE",
    idRegisto: result.id,
    descricao: `Estado de pagamento da fatura ${result.numeroFatura} alterado para "${novoStatus}".`,
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

  const result = await prisma.$transaction(async (tx) => {
    const fatura = await tx.fatura.findUnique({
      where: { id: faturaId },
      include: { notaCredito: true, recibos: true, ordemServicos: { include: { ordemServico: { select: { id: true, numeroOrdem: true, metadados: true } } } } },
    });
    if (!fatura) {
      throw new FaturamentoError("Fatura não encontrada.", 404);
    }
    if (fatura.cancelada) {
      return { fatura, notaCredito: fatura.notaCredito, alreadyCancelled: true, ...calcularSaldoFatura(fatura) };
    }

    const ordens = fatura.ordemServicos.map((l) => l.ordemServico);
    const numeroNotaCredito = await generateNumeroNotaCredito();
    const dataEmissao = new Date();
    const motivoFinal = (motivo || "").trim() || "Anulação da fatura de referência";

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

    return { fatura: updated, notaCredito, alreadyCancelled: false, ...calcularSaldoFatura({ ...fatura, cancelada: true }) };
  }, { isolationLevel: "Serializable" }).catch(conflitoFinanceiro);

  if (result.alreadyCancelled) return result;

  await logAuditoria({
    tabela: "Fatura",
    tipoOperacao: "UPDATE",
    idRegisto: result.fatura.id,
    descricao: `Anulação da fatura ${result.fatura.numeroFatura}.`,
    usuario: emitidaPor,
    dadosDepois: result.fatura,
  });
  await logAuditoria({
    tabela: "NotaCredito",
    tipoOperacao: "CREATE",
    idRegisto: result.notaCredito!.id,
    descricao: `Nota de crédito ${result.notaCredito!.numeroNotaCredito} emitida para a fatura ${result.fatura.numeroFatura} (€${Number(result.fatura.valorTotal).toFixed(2)}).`,
    usuario: emitidaPor,
    dadosDepois: result.notaCredito,
  });

  return result;
}
