import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildCarimbadoCertificatePdf } from "@/lib/certificate-carimbado-pdf";
import { saveExternalCertificadoToNavioFolder } from "@/lib/certificados-organizados";
import { logAuditoria } from "@/lib/auditoria";

export const runtime = "nodejs";

/**
 * POST /api/jangadas/[id]/certificado-carimbado
 *
 * Gera o certificado PDF (carimbado, com hash de verificação) da jangada a partir
 * dos dados já gravados (ficha + última inspeção), grava-o na pasta do navio
 * (e sincroniza com o OneDrive quando configurado) e devolve o ficheiro para o
 * browser abrir automaticamente.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID de jangada inválido." }, { status: 400 });
    }

    const jangada = await prisma.jangada.findUnique({
      where: { id },
      include: { artigos: true, serviceStation: { select: { codigo: true, nome: true } } },
    });
    if (!jangada) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

    const lastInspecao = await prisma.inspecao.findFirst({
      where: { jangadaId: jangada.id },
      orderBy: { dataInspecao: "desc" },
      include: { artigos: true },
    });

    const navio = jangada.shipId
      ? await prisma.navio.findUnique({
          where: { id: jangada.shipId },
          select: {
            nome: true,
            bandeira: true,
            imo: true,
            callSignal: true,
            cliente: { select: { nome: true } },
            serviceStation: { select: { codigo: true, nome: true } },
          },
        })
      : null;

    const shipName = jangada.shipNameManual || navio?.nome || "";
    const station = jangada.serviceStation || navio?.serviceStation || null;

    const { buffer, input, fileName } = await buildCarimbadoCertificatePdf({
      jangada,
      lastInspecao,
      ship: navio,
      shipName,
      ownerName: navio?.cliente?.nome || jangada.owner || "",
      station,
    });

    // Grava na pasta do navio (e sincroniza OneDrive, quando configurado).
    let savedPath: string | undefined;
    try {
      const saved = await saveExternalCertificadoToNavioFolder(
        shipName || "Sem navio",
        fileName,
        Buffer.from(buffer),
        {
          serial: jangada.serial || undefined,
          date: lastInspecao?.dataInspecao ? new Date(lastInspecao.dataInspecao) : undefined,
        },
      );
      savedPath = saved.relativePath;
    } catch (saveErr) {
      console.warn("[certificado-carimbado] Erro ao gravar na pasta do navio:", saveErr);
    }

    try {
      await logAuditoria({
        tabela: "Jangada",
        tipoOperacao: "UPDATE",
        idRegisto: jangada.id,
        usuario: access.email || String(access.userId) || "sistema",
        descricao: `Emissão do certificado carimbado da jangada ${jangada.serial || jangada.id}.`,
        dadosDepois: { certNumber: input.certNumber, verificationHash: input.verificationHash, savedPath },
      });
    } catch {
      // Auditoria é best-effort.
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
        ...(savedPath ? { "X-Orey-Saved-Path": savedPath } : {}),
      },
    });
  } catch (error) {
    console.error("[POST /api/jangadas/[id]/certificado-carimbado]", error);
    return NextResponse.json({ error: "Não foi possível gerar o certificado carimbado." }, { status: 500 });
  }
}
