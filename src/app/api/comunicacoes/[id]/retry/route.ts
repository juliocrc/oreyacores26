import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { enviarComunicacao } from "@/lib/communications";
import { canUseEmailSenderProfiles } from "@/lib/email-sender-access";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const body = await _req.json().catch(() => ({}));
    if (body?.senderAccount !== undefined) {
      return NextResponse.json({ error: "Selecao de conta indisponivel no reenvio." }, { status: canUseEmailSenderProfiles(access.email) ? 400 : 403 });
    }

    const { id } = await params;
    const comunicacaoId = Number(id);
    if (!Number.isSafeInteger(comunicacaoId) || comunicacaoId <= 0) {
      return NextResponse.json({ error: "ID invalido." }, { status: 400 });
    }

    const original = await prisma.comunicacao.findUnique({ where: { id: comunicacaoId } });
    if (!original) return NextResponse.json({ error: "Comunicação não encontrada." }, { status: 404 });

    if (["infinireach-audio", "openwa-audio"].includes(original.canal || "")) {
      return NextResponse.json({ error: "Audio WhatsApp nao pode ser reenviado como texto." }, { status: 400 });
    }

    if (original.canal?.startsWith("twilio") || (original.canal === "openwa" && original.status === "pendente")) {
      return NextResponse.json({ error: "Reenvio bloqueado: fornecedor removido ou envio OpenWA por confirmar.", uncertain: original.canal === "openwa" }, { status: 409 });
    }

    if (!["SMS", "WHATSAPP", "EMAIL"].includes(original.tipo) ||
        !["falhou", "pendente"].includes(original.status) ||
        (original.status === "pendente" && original.providerId)) {
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
    }, { comunicacaoId });

    if (result.ok) {
      // Registrar o reenvio mantendo o mesmo registo (incrementar tentativas)
      const actualizado = await prisma.comunicacao.update({
        where: { id: comunicacaoId },
        data: {
          status: result.status || (result.whatsappUrl ? "pendente" : "enviado"),
          erro: null,
          providerId: result.providerId ?? null,
          tentativas: { increment: 1 },
          proximaTentativa: null,
          enviadoEm: new Date(),
        },
      });
      return NextResponse.json({ ok: true, comunicacao: actualizado, whatsappUrl: result.whatsappUrl });
    }

    // Falhou novamente — incrementar tentativas e guardar erro
    await prisma.comunicacao.update({
      where: { id: comunicacaoId },
      data: {
        status: result.uncertain ? "pendente" : result.closed ? original.status : "falhou",
        erro: result.erro || "Falha no reenvio.",
        tentativas: { increment: 1 },
      },
    });
    return NextResponse.json({ ok: false, error: result.erro, erro: result.erro, status: result.closed ? "closed" : result.status, closed: result.closed, uncertain: result.uncertain, whatsappUrl: result.whatsappUrl }, { status: result.closed || result.uncertain ? 409 : 400 });

  } catch (error) {
    console.error("[POST /api/comunicacoes/[id]/retry] Falha ao processar reenvio.");
    return NextResponse.json({ error: "Erro ao reenviar comunicação." }, { status: 500 });
  }
}
