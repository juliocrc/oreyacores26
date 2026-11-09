import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildCarimbadoCertificatePdf } from "@/lib/certificate-carimbado-pdf";
import { syncEmittedDocumentToOneDrive } from "@/lib/onedrive-sync";
import { logAuditoria } from "@/lib/auditoria";
import { resolveSavedInspectionDocument, InspectionDocumentError } from '@/lib/saved-inspection-documents';

export const runtime = "nodejs";

/**
 * POST /api/navios/[id]/certificados-carimbados
 * Gera os certificados (PDF, com carimbo OREY) de todas as jangadas do navio e
 * devolve-os em base64 para o cliente os gravar na pasta do navio.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID de navio inválido." }, { status: 400 });
    }

    const syncToOneDrive =
      new URL(req.url).searchParams.get("syncOneDrive") === "1";

    const navio = await prisma.navio.findUnique({
      where: { id },
      select: {
        id: true,
        serviceStationId: true,
        nome: true,
        bandeira: true,
        imo: true,
        callSignal: true,
        cliente: { select: { nome: true } },
        serviceStation: { select: { codigo: true, nome: true } },
      },
    });
    if (!navio) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
    if (!access.isAdmin && !access.allowedStationIds.includes(Number(navio.serviceStationId || 0))) {
      return NextResponse.json({ error: 'Sem acesso à estação deste navio.' }, { status: 403 });
    }

    const jangadas = await prisma.jangada.findMany({
      where: { shipId: id },
      orderBy: [{ serial: "asc" }, { id: "asc" }],
      include: { artigos: true },
    });

    if (!jangadas.length) {
      return NextResponse.json(
        { error: "Este navio não tem jangadas associadas para certificar." },
        { status: 400 },
      );
    }

    const shipName = navio.nome || "";
    const seen = new Set<string>();
    const files: Array<{ filename: string; base64: string }> = [];

    // Validate every saved source before emitting or syncing any file.
    const sources = [];
    for (const jangada of jangadas) {
      const lastInspecao = await prisma.inspecao.findFirst({
        where: { jangadaId: jangada.id },
        orderBy: [{ dataInspecao: "desc" }, { id: 'desc' }],
        include: { artigos: true },
      });

      if (!lastInspecao) {
        throw new InspectionDocumentError(`Guarde a inspeção da jangada ${jangada.serial || jangada.id} antes de emitir os certificados.`, 409);
      }
      sources.push({ jangada, source: await resolveSavedInspectionDocument({ jangadaId: jangada.id, inspecaoId: lastInspecao.id }) });
    }

    for (const { jangada, source } of sources) {
      const { buffer, fileName: baseFileName } = await buildCarimbadoCertificatePdf(source);

      let filename = baseFileName;
      if (seen.has(filename)) {
        const serial = String(jangada.serial || jangada.id).replace(/[^\w.-]+/g, "-");
        filename = filename.replace(/\.pdf$/i, ` (${serial}).pdf`);
      }
      seen.add(filename);

      if (syncToOneDrive) {
        try {
          await syncEmittedDocumentToOneDrive({ kind: "externo", shipName, fileName: filename, buffer });
        } catch (syncErr) {
          console.warn("[certificados-carimbados] Erro ao sincronizar OneDrive:", syncErr);
        }
      }

      files.push({ filename, base64: buffer.toString("base64") });
    }

    try {
      await logAuditoria({
        tabela: "Navio",
        tipoOperacao: "UPDATE",
        idRegisto: id,
        usuario: access.email || String(access.userId) || "sistema",
        descricao: `Emissão de ${files.length} certificado(s) carimbado(s) do navio ${shipName || id}.`,
        dadosDepois: { certificates: files.map((file) => file.filename) },
      });
    } catch {
      // Auditoria é best-effort.
    }

    return NextResponse.json({ shipName, files });
  } catch (error) {
    if (error instanceof InspectionDocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[POST /api/navios/[id]/certificados-carimbados]", error);
    return NextResponse.json({ error: "Não foi possível gerar os certificados." }, { status: 500 });
  }
}
