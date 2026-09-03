import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { enviarComunicacao } from "@/lib/communications";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const falhadas = await prisma.comunicacao.findMany({
      where: { status: { in: ["falhou", "pendente"] }, tipo: "WHATSAPP" },
      orderBy: { enviadoEm: "asc" },
      take: 50,
    });

    if (falhadas.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma comunicação com falha para reenviar.", okCount: 0, failCount: 0 });
    }

    let okCount = 0;
    let failCount = 0;

    for (const c of falhadas) {
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
      });

      if (result.ok) {
        await prisma.comunicacao.update({
          where: { id: c.id },
          data: {
            status: "enviado",
            erro: null,
            providerId: result.providerId ?? c.providerId,
            tentativas: { increment: 1 },
            proximaTentativa: null,
            enviadoEm: new Date(),
          },
        });
        okCount++;
      } else {
        await prisma.comunicacao.update({
          where: { id: c.id },
          data: {
            status: "falhou",
            erro: result.erro || "Falha no reenvio.",
            tentativas: { increment: 1 },
          },
        });
        failCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `${okCount} reenviada(s), ${failCount} falha(s).`,
      okCount,
      failCount,
    });
  } catch (error) {
    console.error("[POST /api/comunicacoes/bulk-retry]", error);
    return NextResponse.json({ error: "Erro ao reenviar comunicações em lote." }, { status: 500 });
  }
}
