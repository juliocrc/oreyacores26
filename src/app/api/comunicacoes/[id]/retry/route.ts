import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { enviarComunicacao } from "@/lib/communications";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id } = await params;
    const comunicacaoId = Number(id);

    const original = await prisma.comunicacao.findUnique({ where: { id: comunicacaoId } });
    if (!original) return NextResponse.json({ error: "Comunicação não encontrada." }, { status: 404 });

    if (original.status === "enviado" || original.status === "recebido" || original.status === "rascunho") {
      return NextResponse.json({ error: `A comunicação está "${original.status}" e não precisa de reenvio.` }, { status: 400 });
    }

    const result = await enviarComunicacao({
      tipo: (original.tipo || "WHATSAPP") as "SMS" | "WHATSAPP" | "EMAIL",
      mensagem: original.mensagem,
      assunto: original.assunto || undefined,
      destinatario: original.destinatario || undefined,
      ref: {
        refTipo: original.refTipo || undefined,
        refId: original.refId,
        clienteId: original.clienteId,
        jangadaId: original.jangadaId,
        ordemServicoId: original.ordemServicoId,
      },
      enviadoPor: original.enviadoPor || `retry-${access.userId}`,
    });

    if (result.ok) {
      // Registrar o reenvio mantendo o mesmo registo (incrementar tentativas)
      const actualizado = await prisma.comunicacao.update({
        where: { id: comunicacaoId },
        data: {
          status: "enviado",
          erro: null,
          providerId: result.providerId ?? original.providerId,
          tentativas: { increment: 1 },
          proximaTentativa: null,
          enviadoEm: new Date(),
        },
      });
      return NextResponse.json({ ok: true, comunicacao: actualizado });
    }

    // Falhou novamente — incrementar tentativas e guardar erro
    const actualizado = await prisma.comunicacao.update({
      where: { id: comunicacaoId },
      data: {
        status: "falhou",
        erro: result.erro || "Falha no reenvio.",
        tentativas: { increment: 1 },
      },
    });
    return NextResponse.json({ ok: false, erro: result.erro }, { status: 400 });

  } catch (error) {
    console.error("[POST /api/comunicacoes/[id]/retry]", error);
    return NextResponse.json({ error: "Erro ao reenviar comunicação." }, { status: 500 });
  }
}