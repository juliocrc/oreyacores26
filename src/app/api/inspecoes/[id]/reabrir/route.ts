import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { logAuditoria } from "@/lib/auditoria";
import { evaluateInspectionEdit, isInspectionLocked } from "@/lib/inspecao-lock";

/**
 * Reabertura de uma inspeção finalizada.
 *
 * É um acto deliberado e isolado, não uma gravação disfarçada: primeiro o
 * administrador abre o documento (com justificação escrita), e só depois
 * passa a poder corrigir o conteúdo. Assim fica registado no histórico quem
 * abriu, quando e porquê — que é o que dá valor legal ao certificado.
 *
 * A inspeção volta a ser carimbada no fim da próxima gravação finalizada.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const inspecaoId = Number(rawId);
    if (!inspecaoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const decisao = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      justificacao: body?.justificacao,
      isAdmin: access.isAdmin,
      certificadoNumero: null,
    });

    if (!decisao.permitido) {
      return NextResponse.json(
        { error: decisao.mensagem, motivo: decisao.motivo },
        { status: 403 }
      );
    }

    const existente = await prisma.inspecao.findUnique({
      where: { id: inspecaoId },
      select: { id: true, certificadoNumero: true, integrityHash: true, integrityTimestamp: true, status: true },
    });

    if (!existente) return NextResponse.json({ error: "Inspeção não encontrada" }, { status: 404 });

    if (!isInspectionLocked(existente)) {
      return NextResponse.json(
        { error: "Esta inspeção não está finalizada, pelo que não precisa de ser reaberta." },
        { status: 409 }
      );
    }

    const justificacao = String(body?.justificacao || "").trim();

    // Guarda-se o carimbo anterior na auditoria antes de o remover: é a
    // prova de qual era o estado do documento no momento da abertura.
    await logAuditoria({
      tabela: "Inspecao",
      tipoOperacao: "REABRIR",
      idRegisto: inspecaoId,
      descricao:
        `Inspeção finalizada reaberta` +
        `${existente.certificadoNumero ? ` (certificado ${existente.certificadoNumero})` : ""}. ` +
        `Justificação: ${justificacao}`,
      usuario: access.email,
      dadosAntes: {
        certificadoNumero: existente.certificadoNumero,
        status: existente.status,
        integrityHash: existente.integrityHash,
        integrityTimestamp: existente.integrityTimestamp,
      },
      dadosDepois: {
        reaberturaJustificacao: justificacao,
        carimboAnteriorPreservado: existente.integrityHash,
      },
    });

    await prisma.inspecao.update({
      where: { id: inspecaoId },
      data: { integrityHash: null, integrityTimestamp: null },
    });

    return NextResponse.json({
      success: true,
      reaberta: true,
      certificadoNumero: existente.certificadoNumero,
    });
  } catch (err: unknown) {
    return buildDatabaseErrorResponse(err, err instanceof Error ? err.message : "Erro ao reabrir inspeção");
  }
}
