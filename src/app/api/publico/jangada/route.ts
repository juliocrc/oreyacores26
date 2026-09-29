import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getInspectionStatus } from "@/lib/inspection-status";
import { daysUntil } from "@/lib/date-utils";

const PUBLIC_SELECT = {
  serial: true,
  brand: true,
  model: true,
  capacity: true,
  owner: true,
  dataInspecao: true,
  dataProxInspecao: true,
  ultimoCertificadoNumero: true,
  hruValidade: true,
  radarReflectorValidade: true,
  cylinderDataProxTeste: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    const serial = (req.nextUrl.searchParams.get("serial") || "").trim();
    if (!serial) {
      return NextResponse.json({ error: "Indique o serial da jangada." }, { status: 400 });
    }

    let jangada = await prisma.jangada.findFirst({
      where: { serial },
      select: { ...PUBLIC_SELECT },
    });

    if (!jangada) {
      jangada = await prisma.jangada.findFirst({
        where: { serial: { equals: serial } },
        select: { ...PUBLIC_SELECT },
      });
    }

    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const status = getInspectionStatus(jangada.dataProxInspecao);

    return NextResponse.json({
      serial: jangada.serial,
      brand: jangada.brand,
      model: jangada.model,
      capacity: jangada.capacity,
      owner: jangada.owner,
      dataInspecao: jangada.dataInspecao,
      dataProxInspecao: jangada.dataProxInspecao,
      status,
      diasParaProxima: status.daysLeft,
      ultimoCertificadoNumero: jangada.ultimoCertificadoNumero,
      hruValidade: jangada.hruValidade,
      diasHru: daysUntil(jangada.hruValidade),
      radarReflectorValidade: jangada.radarReflectorValidade,
      diasRadarReflector: daysUntil(jangada.radarReflectorValidade),
      cylinderDataProxTeste: jangada.cylinderDataProxTeste,
      diasProxTesteCilindro: daysUntil(jangada.cylinderDataProxTeste),
    });
  } catch (error) {
    console.error("[GET /api/publico/jangada]", error);
    return NextResponse.json({ error: "Erro ao consultar a jangada." }, { status: 500 });
  }
}
