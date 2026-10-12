import { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { logAuditoria } from "@/lib/auditoria";
import { beginApiRequest, captureApiError, finishApiRequest, withRequestId } from '@/lib/observability';

export async function PATCH(req: NextRequest) {
  const context = beginApiRequest(req, 'inspecoes-signatures');
  const respond = (body: unknown, init?: ResponseInit, extra?: Record<string, unknown>) => {
    const response = NextResponse.json(body, init);
    finishApiRequest(context, response.status, extra);
    return withRequestId(response, context);
  };

  try {
    const access = await getAccessContext();
    if (!access) {
      return respond({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const inspecaoId = Number(body?.inspecaoId);
    const jangadaId = Number(body?.jangadaId);

    if (!Number.isFinite(inspecaoId) || inspecaoId <= 0) {
      return respond({ error: "Parâmetro inspecaoId obrigatório." }, { status: 400 });
    }

    const signatureBase64 = typeof body?.signatureBase64 === 'string' && body.signatureBase64
      ? body.signatureBase64
      : null;
    const clienteAssinaturaBase64 = typeof body?.clienteAssinaturaBase64 === 'string' && body.clienteAssinaturaBase64
      ? body.clienteAssinaturaBase64
      : null;
    const clienteNomeAssinatura = typeof body?.clienteNomeAssinatura === 'string' && body.clienteNomeAssinatura
      ? body.clienteNomeAssinatura
      : null;

    const updated = await prisma.inspecao.update({
      where: { id: inspecaoId },
      data: {
        signatureBase64,
        clienteAssinaturaBase64,
        clienteNomeAssinatura,
      },
      select: { id: true, certificadoNumero: true, jangadaId: true },
    });

    // Espelha a assinatura do técnico na ficha da jangada (como o save final faz).
    if (updated.jangadaId) {
      const targetRaftId = Number.isFinite(jangadaId) && jangadaId > 0 ? jangadaId : updated.jangadaId;
      await prisma.jangada.update({
        where: { id: targetRaftId },
        data: { signatureBase64 },
      }).catch(() => {});
    }

    await logAuditoria({
      tabela: "Inspecao",
      tipoOperacao: "UPDATE",
      idRegisto: inspecaoId,
      descricao: `Assinaturas do certificado atualizadas${updated.certificadoNumero ? ` (${updated.certificadoNumero})` : ""} — técnica e/ou do armador.`,
      usuario: access.email || "sistema",
    }).catch(() => {});

    return respond({ success: true, id: updated.id });
  } catch (error) {
    captureApiError(context, error);
    const response = NextResponse.json({ error: 'Erro ao gravar assinaturas' }, { status: 400 });
    finishApiRequest(context, response.status);
    return withRequestId(response, context);
  }
}