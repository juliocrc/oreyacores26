import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { buildQuadroInspectionPdfBuffer } from "@/lib/quadro-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: idStr } = await context.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const existing = await prisma.jangada.findUnique({
      where: { id },
      select: { id: true, serviceStationId: true, serial: true },
    });
    if (!existing) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

    if (!access.isAdmin && !access.allowedStationIds.includes(Number(existing.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem acesso à estação de serviço desta jangada." }, { status: 403 });
    }
    if (!access.isAdmin && !canEditPath(access.permissions, "/jangadas")) {
      return NextResponse.json({ error: "Sem permissão para editar a página de jangadas." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      stamp?: { imageDataUrl?: string | null; stationName?: string | null };
      verification?: { qr?: string | null; hash?: string | null };
    };

    // Build the inspection input from the jangada data
    const jangada = await prisma.jangada.findUnique({
      where: { id },
      include: {
        serviceStation: true,
      },
    });

    if (!jangada) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

const input = {
      numeroObra: jangada.numeroObra ?? undefined,
      certNumber: jangada.ultimoCertificadoNumero ?? undefined,
      inspectionDate: jangada.dataInspecao ?? undefined,
      nextInspectionDate: jangada.dataProxInspecao ?? undefined,
      shipName: jangada.shipNameManual ?? undefined,
      brand: jangada.brand,
      raftModel: jangada.model,
      raftCapacity: jangada.capacity,
      raftSerial: jangada.serial,
      manufactureDate: jangada.dataFabrico ?? undefined,
      packType: jangada.packType,
      cylinderSerial: jangada.cylinderSerial ?? undefined,
      cylinderCo2: jangada.cylinderCo2 ?? undefined,
      cylinderN2: jangada.cylinderN2 ?? undefined,
      cylinderTara: jangada.cylinderTara ?? undefined,
      cylinderPesoBruto: jangada.cylinderPesoBruto ?? undefined,
      cylinderSistema: jangada.cylinderSistema ?? undefined,
      cylinderHydroTestDate: jangada.cylinderDataTeste ?? undefined,
      hruReference: jangada.hruReferencia ?? undefined,
      hruSerial: jangada.hruSerial ?? undefined,
      hruExpiry: jangada.hruValidade ?? undefined,
      radarReflector: jangada.radarReflector ?? undefined,
      radarReflectorExpiry: jangada.radarReflectorValidade ?? undefined,
      technician: "Técnico",
      clientName: jangada.owner,
      status: "Concluída",
      checklist: {},
    };

    const { buffer } = await buildQuadroInspectionPdfBuffer(input, {
      stamp: body.stamp,
      verification: body.verification,
    });

    const fileName = `Quadro_Assinado_${input.raftSerial || id}_${Date.now()}.pdf`;

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[POST /api/jangadas/[id]/quadro-assinado]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar quadro assinado." },
      { status: 500 }
    );
  }
}