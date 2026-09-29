import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const where: Prisma.CertificadoValidadeWhereInput = {};
  const certificadoId = searchParams.get("certificadoId"); if (certificadoId) where.certificadoId = Number(certificadoId);
  const item = searchParams.get("item"); if (item) where.item = { contains: item };
  const validade = searchParams.get("validade"); if (validade) where.validade = { contains: validade };
  const rowNumber = searchParams.get("rowNumber"); if (rowNumber) where.rowNumber = Number(rowNumber);

  const validades = await prisma.certificadoValidade.findMany({
    where,
    include: { certificado: true }
  });
  return NextResponse.json(validades);
}
