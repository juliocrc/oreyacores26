import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { getAccessContext } from "@/lib/access-control";
import { buildCertificatePdfBuffer, certificatePdfFileName } from "@/lib/certificate-pdf";
import { buildInspectionCertificateInput } from "@/lib/certificate-input-from-jangada";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";
import { syncEmittedDocumentToOneDrive } from "@/lib/onedrive-sync";
import { saveExternalCertificadoToNavioFolder } from "@/lib/certificados-organizados";
import { withCertificateVerification } from "@/lib/certificate-verification";
import { logAuditoria } from "@/lib/auditoria";

export const runtime = "nodejs";

/**
 * GET ?serial=<serial> | ?jangadaId=<id>
 * Devolve o certificado PDF (carimbado) da jangada. Acessível à equipa OREY e ao
 * cliente dono da jangada (área de cliente).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serial = url.searchParams.get("serial")?.trim();
    const jangadaIdRaw = url.searchParams.get("jangadaId");
    const jangadaId = jangadaIdRaw ? Number(jangadaIdRaw) : null;

    if (!serial && (!jangadaId || !Number.isFinite(jangadaId))) {
      return NextResponse.json({ error: "Indique o serial ou a jangada." }, { status: 400 });
    }

    const jangada = await prisma.jangada.findFirst({
      where: serial ? { serial } : { id: jangadaId as number },
      include: { artigos: true, serviceStation: { select: { codigo: true } } },
    });
    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const session = await getAuthSession();
    const user = session?.user;
    const isStaff = Boolean(user?.id) && user?.role !== "CLIENTE";

    let allowed = isStaff;
    if (!allowed && user?.role === "CLIENTE" && user.clienteId != null) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: Number(user.clienteId) },
        select: { id: true, nome: true },
      });
      if (cliente) {
        const ownerMatches = Boolean(
          jangada.owner && cliente.nome &&
          jangada.owner.trim().toLowerCase() === cliente.nome.trim().toLowerCase(),
        );
        const shipMatch = jangada.shipId
          ? await prisma.navio.findFirst({
              where: { id: jangada.shipId, clienteId: cliente.id },
              select: { id: true },
            })
          : null;
        allowed = ownerMatches || Boolean(shipMatch);
      }
    }

    if (!allowed) {
      // Sem sessão, mantém-se o bypass de desenvolvimento (AUTH_BYPASS) para a equipa.
      const bypass = !user?.id ? await getAccessContext() : null;
      if (!bypass) {
        return NextResponse.json({ error: "Sem acesso a este certificado." }, { status: 403 });
      }
    }

    const lastInspecao = await prisma.inspecao.findFirst({
      where: { jangadaId: jangada.id },
      orderBy: { dataInspecao: "desc" },
      include: { artigos: true },
    });

    const navio = jangada.shipId
      ? await prisma.navio.findUnique({
          where: { id: jangada.shipId },
          select: { nome: true, serviceStation: { select: { codigo: true } } },
        })
      : null;

    const input = await withCertificateVerification(
      buildInspectionCertificateInput({
        jangada,
        lastInspecao,
        shipName: jangada.shipNameManual || navio?.nome || "",
        stampStationCode: jangada.serviceStation?.codigo || navio?.serviceStation?.codigo || null,
      }),
    );

    const buffer = buildCertificatePdfBuffer(input);
    const fileName = certificatePdfFileName(input);

    if (user?.role === "CLIENTE") {
      try {
        await logAuditoria({
          tabela: "Jangada",
          tipoOperacao: "UPDATE",
          idRegisto: jangada.id,
          usuario: user.email || String(user.id),
          descricao: `Cliente descarregou o certificado carimbado da jangada ${jangada.serial || jangada.id}.`,
          dadosDepois: { certNumber: input.certNumber, verificationHash: input.verificationHash },
        });
      } catch {
        // Auditoria é best-effort.
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/certificados/pdf]", error);
    return NextResponse.json({ error: "Não foi possível gerar o certificado em PDF." }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as InspectionCertificateInput | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados do certificado inválidos." }, { status: 400 });
    }

    const buffer = buildCertificatePdfBuffer(body);
    const fileName = certificatePdfFileName(body);

    await syncEmittedDocumentToOneDrive({ kind: "certificado", fileName, buffer });

    if (body.shipName) {
      try {
        await saveExternalCertificadoToNavioFolder(body.shipName, fileName, Buffer.from(buffer), {
          serial: body.raftSerial || undefined,
          date: body.inspectionDate ? new Date(body.inspectionDate) : undefined,
        });
      } catch (e) {
        console.warn("Erro ao guardar certificado na pasta do navio:", e);
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[POST /api/certificados/pdf]", error);
    return NextResponse.json({ error: "Não foi possível gerar o certificado em PDF." }, { status: 500 });
  }
}
