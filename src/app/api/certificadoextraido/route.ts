import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const where: Prisma.CertificadoExtraidoWhereInput = {};
  const fileName = searchParams.get("fileName"); if (fileName) where.fileName = { contains: fileName };
  const certificadoNumero = searchParams.get("certificadoNumero"); if (certificadoNumero) where.certificadoNumero = { contains: certificadoNumero };
  const raftSerial = searchParams.get("raftSerial"); if (raftSerial) where.raftSerial = { contains: raftSerial };
  const shipName = searchParams.get("shipName"); if (shipName) where.shipName = { contains: shipName };
  const dataInspecao = searchParams.get("dataInspecao"); if (dataInspecao) where.dataInspecao = { contains: dataInspecao };
  const dataProxInspecao = searchParams.get("dataProxInspecao"); if (dataProxInspecao) where.dataProxInspecao = { contains: dataProxInspecao };
  const emergencyPackType = searchParams.get("emergencyPackType"); if (emergencyPackType) where.emergencyPackType = { contains: emergencyPackType };
  if (searchParams.get("isMaisRecente")) where.isMaisRecente = searchParams.get("isMaisRecente") === "true";

  const certificados = await prisma.certificadoExtraido.findMany({
    where,
    include: { jangada: true, jangadasAtivas: true, validities: true }
  });
  return NextResponse.json(certificados);
}
