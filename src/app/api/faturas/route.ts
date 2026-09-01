import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const url = new URL(req.url);
    const clienteId = Number(url.searchParams.get("clienteId") || 0);
    const pagamentoStatus = url.searchParams.get("pagamentoStatus")?.trim() || null;
    const dataInicio = url.searchParams.get("dataInicio")?.trim() || null;
    const dataFim = url.searchParams.get("dataFim")?.trim() || null;
    const incluirCanceladas = url.searchParams.get("incluirCanceladas") === "true";

    const where: Record<string, unknown> = {};
    if (Number.isFinite(clienteId) && clienteId > 0) where.clienteId = clienteId;
    if (!incluirCanceladas) where.cancelada = false;
    if (pagamentoStatus) where.pagamentoStatus = pagamentoStatus;
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

    const totalPendente = faturas
      .filter((f) => !f.cancelada && (f.pagamentoStatus === "Pendente" || f.pagamentoStatus === "Pago Parcialmente"))
      .reduce((sum, f) => sum + Number(f.valorTotal || 0), 0);

    return NextResponse.json({
      total: faturas.length,
      totalPendente,
      faturas: faturas.map((f) => ({
        id: f.id,
        numeroFatura: f.numeroFatura,
        cliente: f.cliente
          ? { id: f.cliente.id, nome: f.cliente.nome, numeroCliente: f.cliente.numeroCliente, ilha: (getCanonicalNavioLocationLabel(f.cliente.ilha) || f.cliente.ilha) || null }
          : null,
        valorSubtotal: f.valorSubtotal,
        valorIva: f.valorIva,
        valorTotal: f.valorTotal,
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
    });
  } catch (error: unknown) {
    console.error("Erro ao listar faturas:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao listar faturas." },
      { status: 500 }
    );
  }
}
