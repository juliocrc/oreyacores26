import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { getAccessContext } from "@/lib/access-control";
import { buildCertificatePdfBuffer, certificatePdfFileName } from "@/lib/certificate-pdf";
import { buildCarimbadoCertificatePdf } from "@/lib/certificate-carimbado-pdf";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";
import { syncEmittedDocumentToOneDrive } from "@/lib/onedrive-sync";
import { saveExternalCertificadoToNavioFolder } from "@/lib/certificados-organizados";
import { verifyCertificatePdfToken } from "@/lib/certificate-pdf-token";
import { logAuditoria } from "@/lib/auditoria";

export const runtime = "nodejs";

/**
 * GET ?serial=<serial> | ?jangadaId=<id> | ?inspecaoId=<id>
 * Devolve o certificado PDF (carimbado) da jangada. Acessível à equipa OREY e ao
 * cliente dono da jangada (área de cliente), ou a quem apresente um token público
 * assinado e não expirado (`?t=`) para o mesmo serial.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serialParam = url.searchParams.get("serial")?.trim();
    const jangadaIdRaw = url.searchParams.get("jangadaId");
    const jangadaId = jangadaIdRaw ? Number(jangadaIdRaw) : null;
    const inspecaoIdRaw = url.searchParams.get("inspecaoId");
    const inspecaoId = inspecaoIdRaw ? Number(inspecaoIdRaw) : null;
    const publicToken = url.searchParams.get("t");

    if (!serialParam && (!jangadaId || !Number.isFinite(jangadaId)) && (!inspecaoId || !Number.isFinite(inspecaoId))) {
      return NextResponse.json({ error: "Indique o serial, a jangada ou a inspeção." }, { status: 400 });
    }

    let jangadaIdFromInspecao: number | null = null;
    if (inspecaoId && Number.isFinite(inspecaoId)) {
      const ins = await prisma.inspecao.findUnique({ where: { id: inspecaoId }, select: { jangadaId: true } });
      if (ins?.jangadaId) jangadaIdFromInspecao = ins.jangadaId;
    }

    const targetJangadaId = jangadaIdFromInspecao ?? (jangadaId && Number.isFinite(jangadaId) ? jangadaId : null);

    if (!serialParam && targetJangadaId == null) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const jangada = await prisma.jangada.findFirst({
      where: serialParam ? { serial: serialParam } : { id: targetJangadaId as number },
      include: { artigos: true, serviceStation: { select: { codigo: true, nome: true } } },
    });
    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const session = await getAuthSession();
    const user = session?.user;
    const isStaff = Boolean(user?.id) && user?.role !== "CLIENTE";

    // Acesso público por token assinado (sem sessão), vinculado a este serial.
    const tokenAllows = verifyCertificatePdfToken(publicToken, jangada.serial || "");

    let allowed = isStaff || tokenAllows;
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
          select: {
            nome: true,
            bandeira: true,
            imo: true,
            callSignal: true,
            serviceStation: { select: { codigo: true, nome: true } },
          },
        })
      : null;

    const station = jangada.serviceStation || navio?.serviceStation || null;

    const { buffer, input, fileName } = await buildCarimbadoCertificatePdf({
      jangada,
      lastInspecao,
      ship: navio,
      shipName: jangada.shipNameManual || navio?.nome || "",
      station,
    });

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

    const body = (await request.json().catch(() => null)) as (InspectionCertificateInput & { jangadaId?: number }) | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados do certificado inválidos." }, { status: 400 });
    }

    // Reconstrói a partir do template OREY quando conhecemos a jangada.
    const jangadaId = Number.isFinite(body.jangadaId) ? Number(body.jangadaId) : null;
    if (jangadaId) {
      const jangada = await prisma.jangada.findUnique({
        where: { id: jangadaId },
        include: { artigos: true, serviceStation: { select: { codigo: true, nome: true } } },
      });
      if (jangada) {
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
        const station = jangada.serviceStation || navio?.serviceStation || null;
        const built = await buildCarimbadoCertificatePdf({
          jangada,
          lastInspecao,
          ship: navio,
          shipName: jangada.shipNameManual || navio?.nome || body.shipName || "",
          ownerName: navio?.cliente?.nome || jangada.owner || "",
          station,
        });
        await syncEmittedDocumentToOneDrive({ kind: "certificado", fileName: built.fileName, buffer: built.buffer });
        if (built.input.shipName) {
          try {
            await saveExternalCertificadoToNavioFolder(built.input.shipName, built.fileName, Buffer.from(built.buffer), {
              serial: built.input.raftSerial || undefined,
              date: built.input.inspectionDate ? new Date(built.input.inspectionDate) : undefined,
            });
          } catch (e) {
            console.warn("Erro ao guardar certificado na pasta do navio:", e);
          }
        }
        return new NextResponse(new Uint8Array(built.buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${built.fileName}"`,
            "Cache-Control": "no-store",
          },
        });
      }
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
