import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildInspectionCertificateInput } from "@/lib/certificate-input-from-jangada";
import { computeCertificateVerificationHash } from "@/lib/certificate-verification";

export const runtime = "nodejs";

/**
 * GET /api/publico/certificado?serial=<serial>&h=<hash>
 * Verificação pública de um certificado. Compara o hash guardado no PDF com o
 * hash calculado a partir dos dados atuais do sistema. Não expõe dados sensíveis.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serial = url.searchParams.get("serial")?.trim();
    const hash = url.searchParams.get("h")?.trim();

    if (!serial) {
      return NextResponse.json({ error: "Indique o serial da jangada." }, { status: 400 });
    }

    const jangada = await prisma.jangada.findFirst({
      where: { serial },
      include: { artigos: true },
    });
    if (!jangada) {
      return NextResponse.json({ valid: false, error: "Certificado não encontrado." }, { status: 404 });
    }

    const lastInspecao = await prisma.inspecao.findFirst({
      where: { jangadaId: jangada.id },
      orderBy: { dataInspecao: "desc" },
      include: { artigos: true },
    });

    const navio = jangada.shipId
      ? await prisma.navio.findUnique({
          where: { id: jangada.shipId },
          select: { nome: true },
        })
      : null;

    const input = buildInspectionCertificateInput({
      jangada,
      lastInspecao,
      shipName: jangada.shipNameManual || navio?.nome || "",
      stamp: false,
    });

    const computed = computeCertificateVerificationHash(input);

    return NextResponse.json({
      valid: hash ? computed === hash : null,
      hash: computed,
      certificate: {
        certNumber: input.certNumber || null,
        serial: input.raftSerial || null,
        inspectionDate: input.inspectionDate || null,
        shipName: input.shipName || null,
        technician: input.technician || null,
        status: input.status || null,
        aprovacaoWp: (input.checklist as Record<string, unknown> | undefined)?.aprovacao_wp ?? null,
      },
    });
  } catch (error) {
    console.error("[GET /api/publico/certificado]", error);
    return NextResponse.json({ error: "Não foi possível verificar o certificado." }, { status: 500 });
  }
}
