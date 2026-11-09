import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { enviarComunicacao } from "@/lib/communications";
import { canUseEmailSenderProfiles } from "@/lib/email-sender-access";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const body = await _req.json().catch(() => ({}));
    if (body?.senderAccount !== undefined) {
      return NextResponse.json({ error: "Selecao de conta indisponivel no reenvio." }, { status: canUseEmailSenderProfiles(access.email) ? 400 : 403 });
    }

    const falhadas = await prisma.comunicacao.findMany({
      where: {
        tipo: "WHATSAPP",
        OR: [{ status: "falhou" }, { status: "pendente", providerId: null }],
        AND: [{ OR: [{ canal: null }, { canal: { notIn: ["infinireach-audio", "openwa-audio", "openwa", "twilio", "twilio-voice"] } }] }],
      },
      orderBy: { enviadoEm: "asc" },
      take: 50,
    });

    if (falhadas.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma comunicação com falha para reenviar.", okCount: 0, failCount: 0 });
    }

    let okCount = 0;
    let failCount = 0;
    const manualLinks: { comunicacaoId: number; whatsappUrl: string }[] = [];

    for (const c of falhadas) {
       if (["infinireach-audio", "openwa-audio", "openwa", "twilio", "twilio-voice"].includes(c.canal || "")) continue;
      const result = await enviarComunicacao({
        tipo: (c.tipo || "WHATSAPP") as "SMS" | "WHATSAPP" | "EMAIL",
        mensagem: c.mensagem,
        assunto: c.assunto || undefined,
        destinatario: c.destinatario || undefined,
        ref: {
          refTipo: c.refTipo || undefined,
          refId: c.refId,
          clienteId: c.clienteId,
          jangadaId: c.jangadaId,
          ordemServicoId: c.ordemServicoId,
        },
        enviadoPor: `bulk-retry-${access.userId}`,
      }, { comunicacaoId: c.id });

      if (result.ok) {
        await prisma.comunicacao.update({
          where: { id: c.id },
          data: {
            status: result.status || (result.whatsappUrl ? "pendente" : "enviado"),
            erro: null,
            providerId: result.providerId ?? null,
            tentativas: { increment: 1 },
            proximaTentativa: null,
            enviadoEm: new Date(),
          },
        });
        if (result.whatsappUrl) {
          manualLinks.push({ comunicacaoId: c.id, whatsappUrl: result.whatsappUrl });
        } else {
          okCount++;
        }
      } else {
        await prisma.comunicacao.update({
          where: { id: c.id },
          data: {
            status: result.uncertain ? "pendente" : result.closed ? c.status : "falhou",
            erro: result.erro || "Falha no reenvio.",
            tentativas: { increment: 1 },
          },
        });
        failCount++;
        if (result.whatsappUrl) manualLinks.push({ comunicacaoId: c.id, whatsappUrl: result.whatsappUrl });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `${okCount} reenviada(s), ${failCount} falha(s).`,
      okCount,
      failCount,
      manualCount: manualLinks.length,
      manualLinks,
    });
  } catch (error) {
    console.error("[POST /api/comunicacoes/bulk-retry] Falha ao processar reenvio.");
    return NextResponse.json({ error: "Erro ao reenviar comunicações em lote." }, { status: 500 });
  }
}
