import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { invoiceDisplay } from "@/lib/invoice-official";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const { id: rawId } = await context.params;
    const clienteId = Number(rawId);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: "ID de cliente inválido." }, { status: 400 });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true, numeroCliente: true, nif: true },
    });
    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const faturas = await prisma.fatura.findMany({
      where: { clienteId },
      orderBy: [{ dataEmissao: "desc" }, { id: "desc" }],
      include: {
        ordemServicos: {
          include: {
            ordemServico: {
              select: {
                id: true,
                numeroOrdem: true,
                status: true,
                valorTotal: true,
                dataConclusao: true,
                jangada: {
                  select: { id: true, serial: true, brand: true, model: true, shipNameManual: true },
                },
              },
            },
          },
        },
        notaCredito: true,
        recibos: { orderBy: { dataEmissao: "desc" } },
      },
    });

    return NextResponse.json({
      cliente,
      total: faturas.length,
      totalFaturado: faturas
        .filter((f) => !f.cancelada)
        .reduce((sum, f) => sum + (f.valorTotal || 0), 0),
      faturas: faturas.map((f) => {
        const ordemServicos = f.ordemServicos.map((l) => l.ordemServico);
        return {
          id: f.id,
          numeroFatura: f.numeroFatura,
          ...(access.isAdmin ? { ...invoiceDisplay(f), updatedAt: f.updatedAt } : {}),
          ordemServicoId: ordemServicos[0]?.id ?? null,
          ordemServicos: ordemServicos.map((o) => ({
            id: o.id,
            numeroOrdem: o.numeroOrdem,
            status: o.status,
            valorTotal: o.valorTotal,
            jangada: o.jangada
              ? `${o.jangada.brand || ""} ${o.jangada.model || ""} (${o.jangada.serial || ""})`
              : null,
          })),
          numeroOrdem: ordemServicos.map((o) => o.numeroOrdem).join(", ") || null,
          ordemServicoStatus: ordemServicos[0]?.status || null,
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
          notaCredito: f.notaCredito
            ? { numeroNotaCredito: f.notaCredito.numeroNotaCredito, dataEmissao: f.notaCredito.dataEmissao }
            : null,
          numeroRecibo: f.recibos[0]?.numeroRecibo ?? null,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("Erro ao obter faturas do cliente:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao consultar faturas." },
      { status: 500 }
    );
  }
}
