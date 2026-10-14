import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildCertificatePdfBuffer, certificatePdfFileName } from "@/lib/certificate-pdf";
import { buildInspectionCertificateInput } from "@/lib/certificate-input-from-jangada";

export const runtime = "nodejs";

/**
 * POST /api/navios/[id]/certificados-carimbados
 * Gera os certificados (PDF, com carimbo OREY) de todas as jangadas do navio e
 * devolve-os em base64 para o cliente os gravar na pasta do navio.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID de navio inválido." }, { status: 400 });
    }

    const navio = await prisma.navio.findUnique({
      where: { id },
      select: { id: true, nome: true, cliente: { select: { nome: true } } },
    });
    if (!navio) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });

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

    for (const jangada of jangadas) {
      const lastInspecao = await prisma.inspecao.findFirst({
        where: { jangadaId: jangada.id },
        orderBy: { dataInspecao: "desc" },
        include: { artigos: true },
      });

      const input = buildInspectionCertificateInput({
        jangada,
        lastInspecao,
        shipName,
        ownerName: navio.cliente?.nome || jangada.owner || "",
      });

      const buffer = buildCertificatePdfBuffer(input);
      let filename = certificatePdfFileName(input);
      if (seen.has(filename)) {
        const serial = String(jangada.serial || jangada.id).replace(/[^\w.-]+/g, "-");
        filename = filename.replace(/\.pdf$/i, ` (${serial}).pdf`);
      }
      seen.add(filename);

      files.push({ filename, base64: buffer.toString("base64") });
    }

    return NextResponse.json({ shipName, files });
  } catch (error) {
    console.error("[POST /api/navios/[id]/certificados-carimbados]", error);
    return NextResponse.json({ error: "Não foi possível gerar os certificados." }, { status: 500 });
  }
}
