import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";
import { calcularSaldoFatura, validarPagamentoStatus, FaturamentoError } from "@/lib/faturamento";
import { invoiceWorkReferences } from "@/lib/invoice-number";
import { invoiceDisplay } from "@/lib/invoice-official";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });

    const url = new URL(req.url);
    const clienteId = Number(url.searchParams.get("clienteId") || 0);
    const pagamentoStatus = url.searchParams.get("pagamentoStatus")?.trim() || null;
    const dataInicio = url.searchParams.get("dataInicio")?.trim() || null;
    const dataFim = url.searchParams.get("dataFim")?.trim() || null;
    const incluirCanceladas = url.searchParams.get("incluirCanceladas") === "true";
    if (url.searchParams.has("clienteId") && (!Number.isSafeInteger(clienteId) || clienteId <= 0)) {
      return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
    }
    if ([dataInicio, dataFim].some(date => date && !Number.isFinite(new Date(date).getTime())) ||
      (dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim))) {
      return NextResponse.json({ error: "Intervalo de datas inválido." }, { status: 400 });
    }

    const where: Record<string, unknown> = {};
    if (Number.isFinite(clienteId) && clienteId > 0) where.clienteId = clienteId;
    if (!incluirCanceladas) where.cancelada = false;
    if (pagamentoStatus) where.pagamentoStatus = validarPagamentoStatus(pagamentoStatus);
    if (dataInicio) where.dataEmissao = { ...(where.dataEmissao as Record<string, unknown> || {}), gte: new Date(dataInicio) };
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      where.dataEmissao = { ...(where.dataEmissao as Record<string, unknown> || {}), lte: fim };
    }

    const faturas = await prisma.fatura.findMany({
      where,
      orderBy: [{ dataEmissao: "desc" }, { id: "desc" }],
      include: {
        cliente: { select: { id: true, nome: true, numeroCliente: true, nif: true, ilha: true } },
        ordemServicos: {
          include: {
            ordemServico: {
              select: {
                id: true,
                numeroOrdem: true,
                dataConclusao: true,
                jangada: { select: { brand: true, model: true, serial: true, owner: true, shipNameManual: true } },
                serviceStation: { select: { nome: true } },
              },
            },
          },
        },
        notaCredito: true,
        recibos: { orderBy: { dataEmissao: "desc" } },
      },
    });

    const totalPendente = Math.round(faturas.reduce((sum, f) => sum + calcularSaldoFatura(f).valorPendente, 0) * 100) / 100;

    return NextResponse.json({
      total: faturas.length,
      totalPendente,
      faturas: faturas.map((f) => ({
        id: f.id,
        numeroFatura: f.numeroFatura,
        ...invoiceDisplay(f),
        updatedAt: f.updatedAt,
        ...invoiceWorkReferences(f.metadados),
        cliente: f.cliente
          ? { id: f.cliente.id, nome: f.cliente.nome, numeroCliente: f.cliente.numeroCliente, ilha: (getCanonicalNavioLocationLabel(f.cliente.ilha) || f.cliente.ilha) || null }
          : null,
        valorSubtotal: f.valorSubtotal,
        valorIva: f.valorIva,
        valorTotal: f.valorTotal,
        ...calcularSaldoFatura(f),
        isIsentoIva: f.isIsentoIva,
        pagamentoStatus: f.pagamentoStatus,
        dataEmissao: f.dataEmissao,
        emitidaPor: f.emitidaPor,
        cancelada: f.cancelada,
        dataCancelamento: f.dataCancelamento,
        motivoCancelamento: f.motivoCancelamento,
        ordemServicos: f.ordemServicos.map((l) => ({
          id: l.ordemServico.id,
          numeroOrdem: l.ordemServico.numeroOrdem,
          dataConclusao: l.ordemServico.dataConclusao,
          serviceStation: l.ordemServico.serviceStation?.nome || null,
          jangada: l.ordemServico.jangada
            ? {
                label: `${l.ordemServico.jangada.brand || ""} ${l.ordemServico.jangada.model || ""} (${l.ordemServico.jangada.serial || ""})`,
                owner: l.ordemServico.jangada.owner,
                shipNameManual: l.ordemServico.jangada.shipNameManual,
              }
            : null,
        })),
        notaCredito: f.notaCredito
          ? { numeroNotaCredito: f.notaCredito.numeroNotaCredito, dataEmissao: f.notaCredito.dataEmissao }
          : null,
        numeroRecibo: f.recibos[0]?.numeroRecibo ?? null,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof FaturamentoError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro ao listar faturas:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao listar faturas." },
      { status: 500 }
    );
  }
}
