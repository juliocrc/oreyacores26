import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { getAccessContext } from "@/lib/access-control";
import { buildCarimbadoCertificatePdf } from "@/lib/certificate-carimbado-pdf";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";
import { verifyCertificatePdfToken } from "@/lib/certificate-pdf-token";
import { logAuditoria } from "@/lib/auditoria";
import { getInspectionSnapshot } from "@/lib/inspection-snapshots";
import { normalizeInspectionChecklistValues } from "@/lib/inspection-checklist-store";
import { toDateKey } from "@/lib/date-utils";
import { POST as emitCarimbado } from '@/app/api/jangadas/[id]/certificado-carimbado/route';

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

    if ((inspecaoIdRaw !== null && (!Number.isSafeInteger(inspecaoId) || Number(inspecaoId) <= 0)) ||
        (jangadaIdRaw !== null && (!Number.isSafeInteger(jangadaId) || Number(jangadaId) <= 0))) {
      return NextResponse.json({ error: "ID de inspeção ou jangada inválido." }, { status: 400 });
    }

    if (!serialParam && (!jangadaId || !Number.isFinite(jangadaId)) && (!inspecaoId || !Number.isFinite(inspecaoId))) {
      return NextResponse.json({ error: "Indique o serial, a jangada ou a inspeção." }, { status: 400 });
    }

    const selectedInspection = inspecaoId
      ? await prisma.inspecao.findUnique({ where: { id: inspecaoId }, include: { artigos: true } })
      : null;
    if (inspecaoId && !selectedInspection?.jangadaId) {
      return NextResponse.json({ error: "Inspeção da jangada não encontrada." }, { status: 404 });
    }

    const targetJangadaId = selectedInspection?.jangadaId ?? jangadaId;

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
    if ((jangadaId != null && jangada.id !== jangadaId) ||
        (selectedInspection && selectedInspection.jangadaId !== jangada.id)) {
      return NextResponse.json({ error: "A inspeção não pertence à jangada indicada." }, { status: 400 });
    }

    const session = await getAuthSession();
    const user = session?.user;
    const isStaff = Boolean(user?.id) && user?.role !== "CLIENTE";

    // Acesso público por token assinado (sem sessão), vinculado a este serial.
    const tokenAllows = verifyCertificatePdfToken(publicToken, jangada.serial || "");

    const access = user?.role !== "CLIENTE" && (isStaff || !user?.id) ? await getAccessContext() : null;
    let allowed = Boolean(access) || tokenAllows;
    const requiresClientOwnership = !tokenAllows && user?.role === "CLIENTE";
    const clienteId = Number(user?.clienteId);
    if (!allowed && requiresClientOwnership && user?.id && Number.isSafeInteger(clienteId) && clienteId > 0 && jangada.shipId) {
      const shipMatch = await prisma.navio.findFirst({
        where: { id: jangada.shipId, clienteId },
        select: { id: true },
      });
      allowed = Boolean(shipMatch);
    }

    if (!allowed) {
      return NextResponse.json({ error: "Sem acesso a este certificado." }, { status: 403 });
    }

    const lastInspecao = selectedInspection ?? await prisma.inspecao.findFirst({
      where: { jangadaId: jangada.id },
      orderBy: { dataInspecao: "desc" },
      include: { artigos: true },
    });
    if (!lastInspecao) {
      return NextResponse.json({ error: 'Guarde a inspeção antes de emitir o certificado.' }, { status: 409 });
    }
    if (requiresClientOwnership && lastInspecao?.navioId != null && lastInspecao.navioId !== jangada.shipId) {
      return NextResponse.json({ error: "Sem acesso a este certificado." }, { status: 403 });
    }

    const navio = jangada.shipId
      ? await prisma.navio.findUnique({
          where: { id: jangada.shipId },
          select: {
            serviceStationId: true,
            nome: true,
            bandeira: true,
            imo: true,
            callSignal: true,
            serviceStation: { select: { codigo: true, nome: true } },
          },
        })
      : null;

    const station = jangada.serviceStation || navio?.serviceStation || null;
    const currentStationId = jangada.serviceStationId ?? navio?.serviceStationId;
    if (access && !access.isAdmin && !access.allowedStationIds.includes(Number(currentStationId || 0))) {
      return NextResponse.json({ error: "Sem acesso à estação desta jangada." }, { status: 403 });
    }

    let historicalParams: Parameters<typeof buildCarimbadoCertificatePdf>[0] | null = null;
    if (selectedInspection) {
      const snapshot = await getInspectionSnapshot(selectedInspection.certificadoNumero);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
          snapshot.id !== jangada.id || snapshot.serial !== jangada.serial ||
          (selectedInspection.jangadaSerial && snapshot.serial !== selectedInspection.jangadaSerial) ||
          snapshot.ultimoCertificadoNumero !== selectedInspection.certificadoNumero ||
          (selectedInspection.navioId != null && snapshot.shipId !== selectedInspection.navioId) ||
          (snapshot.shipDetails?.id != null && snapshot.shipDetails.id !== snapshot.shipId) ||
          !selectedInspection.dataInspecao || Number.isNaN(new Date(selectedInspection.dataInspecao).getTime()) ||
          toDateKey(snapshot.dataInspecao) !== toDateKey(selectedInspection.dataInspecao) ||
          !Array.isArray(snapshot.artigos) || snapshot.artigos.some((artigo: unknown) => !artigo || typeof artigo !== "object" || Array.isArray(artigo))) {
        return NextResponse.json({ error: "Dados históricos indisponíveis ou inconsistentes para esta inspeção. Não é possível reconstruir fielmente o dossier." }, { status: 409 });
      }
      if (requiresClientOwnership && (snapshot.shipId !== jangada.shipId ||
          (snapshot.shipDetails?.clienteId != null && snapshot.shipDetails.clienteId !== clienteId))) {
        return NextResponse.json({ error: "Sem acesso a este certificado." }, { status: 403 });
      }
      // Never fill historical technical/ship data from the current raft or ship.
      const historicalStationId = snapshot.serviceStationId ?? snapshot.shipDetails?.serviceStationId;
      if (!Number.isSafeInteger(historicalStationId) || historicalStationId <= 0) {
        return NextResponse.json({ error: "Estação histórica indisponível para esta inspeção." }, { status: 409 });
      }
      if (access && !access.isAdmin && !access.allowedStationIds.includes(historicalStationId)) {
        return NextResponse.json({ error: "Sem acesso à estação desta inspeção." }, { status: 403 });
      }
      const historicalStation = await prisma.serviceStation.findUnique({
        where: { id: historicalStationId }, select: { codigo: true, nome: true },
      });
      if (!historicalStation) {
        return NextResponse.json({ error: "Estação histórica indisponível para esta inspeção." }, { status: 409 });
      }
      historicalParams = {
        jangada: {
          ...snapshot,
          artigos: snapshot.artigos.filter((artigo: { inspecaoId?: number | null }) =>
            artigo.inspecaoId == null || artigo.inspecaoId === selectedInspection.id),
          dataInspecao: selectedInspection.dataInspecao,
          dataProxInspecao: selectedInspection.dataProxInspecao ?? snapshot.dataProxInspecao ?? "",
          inspectionChecklistValues: {
            ...normalizeInspectionChecklistValues(snapshot.inspectionChecklistValues),
            ...normalizeInspectionChecklistValues(selectedInspection.checklistSnapshot),
          },
        },
        lastInspecao: selectedInspection,
        ship: snapshot.shipDetails ?? null,
        shipName: selectedInspection.navioNome || snapshot.shipNameManual || "",
        station: historicalStation,
        preserveSavedChecklist: true,
      };
    }

    const { buffer, input, fileName } = await buildCarimbadoCertificatePdf(historicalParams ?? {
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

    const body = (await request.json().catch(() => null)) as (InspectionCertificateInput & { jangadaId?: number; inspecaoId?: unknown }) | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados do certificado inválidos." }, { status: 400 });
    }
    if (body.inspecaoId == null) {
      return NextResponse.json({ error: 'Guarde a inspeção antes de emitir o certificado.' }, { status: 400 });
    }
    return emitCarimbado(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: String(body.jangadaId ?? '') }),
    });
  } catch (error) {
    console.error("[POST /api/certificados/pdf]", error);
    return NextResponse.json({ error: "Não foi possível gerar o certificado em PDF." }, { status: 500 });
  }
}
