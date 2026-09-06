import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { logAuditoria } from "@/lib/auditoria";
import type { Prisma } from "@prisma/client";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const { id: rawId } = await context.params;
    const jangadaId = Number(rawId);
    if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
      return NextResponse.json({ error: "ID de jangada inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || "aprovar").toLowerCase(); // "aprovar" | "rejeitar"
    const novoStatus = acao === "rejeitar" ? "Rejeitado" : "Aprovado";

    // Encontrar ordem de serviço ativa ou mais recente ligada à jangada
    const ordem = await prisma.ordemServico.findFirst({
      where: {
        jangadaId,
        status: { notIn: ["concluida", "cancelada"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!ordem) {
      return NextResponse.json({ error: "Nenhuma Ordem de Serviço ativa encontrada para esta jangada." }, { status: 404 });
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      const saved = await tx.ordemServico.update({
        where: { id: ordem.id },
        data: {
          orcamentoStatus: novoStatus,
          updatedAt: new Date(),
        },
      });

      // Se aprovado, converter eventuais reservas em saídas definitivas de stock se aplicável
      if (novoStatus === "Aprovado" && ordem.inspecaoId) {
        const reservas = await tx.movimentacaoStock.findMany({
          where: { inspecaoId: ordem.inspecaoId, tipo: "reserva" },
        });

        for (const resv of reservas) {
          const st = await tx.stock.findUnique({ where: { id: resv.stockId } });
          if (!st) continue;

          // Deduzir quantidade real e libertar reserva
          const novaQtde = Math.max(0, st.quantidade - resv.quantidade);
          const novaReserva = Math.max(0, (st.quantidadeReservada || 0) - resv.quantidade);

          await tx.stock.update({
            where: { id: st.id },
            data: {
              quantidade: novaQtde,
              quantidadeReservada: novaReserva,
            },
          });

          await tx.movimentacaoStock.create({
            data: {
              stockId: st.id,
              tipo: "saida",
              quantidade: resv.quantidade,
              quantidadeAntes: st.quantidade,
              quantidadeDepois: novaQtde,
              motivo: `Consumo definitivo por orçamento aprovado (OT ${ordem.numeroOrdem})`,
              usuario: access.email || "sistema",
              ordemServicoId: ordem.id,
            },
          });
        }
      }

      // Reflectir a decisão do orçamento na checklist de inspeção associada
      if (ordem.inspecaoId) {
        const inspecao = await tx.inspecao.findUnique({
          where: { id: ordem.inspecaoId },
          select: { orcamento: true },
        });
        const inspecaoOrcamento =
          inspecao?.orcamento && typeof inspecao.orcamento === "object"
            ? (inspecao.orcamento as Record<string, unknown>)
            : null;
        if (inspecaoOrcamento) {
          const aprovacaoAtual =
            inspecaoOrcamento.aprovacaoWhatsApp &&
            typeof inspecaoOrcamento.aprovacaoWhatsApp === "object"
              ? (inspecaoOrcamento.aprovacaoWhatsApp as Record<string, unknown>)
              : {};
          await tx.inspecao.update({
            where: { id: ordem.inspecaoId },
            data: {
              orcamento: {
                ...inspecaoOrcamento,
                aprovacaoWhatsApp: {
                  ...aprovacaoAtual,
                  status: novoStatus === "Aprovado" ? "aprovado" : "rejeitado",
                  aprovadoPorUtilizador: novoStatus === "Aprovado",
                  respondidoEm: new Date().toISOString(),
                },
              } as Prisma.InputJsonValue,
              updatedAt: new Date(),
            },
          });
        }
      }

      return saved;
    });

    await logAuditoria({
      tabela: "OrdemServico",
      tipoOperacao: "UPDATE",
      idRegisto: ordem.id,
      descricao: `Orçamento da OT ${ordem.numeroOrdem} marcado como ${novoStatus} para a jangada ${jangadaId}.`,
      usuario: access.email || "sistema",
    });

    return NextResponse.json({ success: true, ordemServicoId: ordem.id, orcamentoStatus: novoStatus });
  } catch (error: unknown) {
    console.error("Erro ao aprovar/rejeitar orçamento:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno ao atualizar orçamento." }, { status: 500 });
  }
}
