import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { logAuditoria } from "@/lib/auditoria";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || session.user.role !== "CLIENTE" || !session.user.clienteId) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const clienteId = Number(session.user.clienteId);
    const body = await req.json().catch(() => ({}));
    const ordemId = Number(body?.ordemId);
    const acao = String(body?.acao || "").toLowerCase();

    if (!Number.isFinite(ordemId) || (acao !== "aprovar" && acao !== "rejeitar")) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    const ordem = await prisma.ordemServico.findFirst({
      where: { id: ordemId, clienteId, orcamentoStatus: "Emitido" },
      select: { id: true, numeroOrdem: true, orcamentoStatus: true },
    });

    if (!ordem) {
      return NextResponse.json({ error: "Orçamento não encontrado ou não está pendente de aprovação." }, { status: 404 });
    }

    const novoStatus = acao === "aprovar" ? "Aprovado" : "Rejeitado";

    await prisma.ordemServico.update({
      where: { id: ordemId },
      data: { orcamentoStatus: novoStatus, updatedAt: new Date() },
    });

    if (novoStatus === "Aprovado") {
      const reservas = await prisma.movimentacaoStock.findMany({
        where: { ordemServicoId: ordemId, tipo: "reserva" },
      });

      for (const resv of reservas) {
        const st = await prisma.stock.findUnique({ where: { id: resv.stockId } });
        if (!st) continue;
        const novaQtde = Math.max(0, st.quantidade - resv.quantidade);
        const novaReserva = Math.max(0, (st.quantidadeReservada || 0) - resv.quantidade);
        await prisma.stock.update({
          where: { id: st.id },
          data: { quantidade: novaQtde, quantidadeReservada: novaReserva },
        });
        await prisma.movimentacaoStock.create({
          data: {
            stockId: st.id,
            tipo: "saida",
            quantidade: resv.quantidade,
            quantidadeAntes: st.quantidade,
            quantidadeDepois: novaQtde,
            motivo: `Consumo por orçamento aprovado pelo cliente (OT ${ordem.numeroOrdem})`,
            usuario: session.user.email || "cliente",
            ordemServicoId: ordemId,
          },
        });
      }
    }

    await logAuditoria({
      tabela: "OrdemServico",
      tipoOperacao: "UPDATE",
      idRegisto: ordemId,
      descricao: `Orçamento OT ${ordem.numeroOrdem} marcado como ${novoStatus} pelo cliente.`,
      usuario: session.user.email || "cliente",
    });

    return NextResponse.json({ ok: true, orcamentoStatus: novoStatus });
  } catch (error) {
    console.error("[portal/orcamento-action] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
