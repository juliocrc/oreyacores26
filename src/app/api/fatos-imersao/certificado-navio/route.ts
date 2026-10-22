import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { generateNavioFatosImersaoCertificateDocx } from "@/lib/fato-imersao-certificate-template";
import { normalizeMonthInput } from "@/lib/fato-date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function formatPtDate(value?: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date) return value.toLocaleDateString("pt-PT");
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return String(value);
}

function inspectionStatus(input: {
  certificadoResultado?: string | null;
  verificacaoResultado?: string | null;
  estado?: string | null;
}): string {
  const result = input.certificadoResultado || input.verificacaoResultado;
  if (result) {
    return result.trim().toLowerCase().startsWith("aprov") ? "OK" : "NOT OK";
  }
  const estado = (input.estado || "").trim().toLowerCase();
  if (!estado) return "";
  return estado === "ativo" ? "OK" : "NOT OK";
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const shipId = Number(new URL(req.url).searchParams.get("shipId"));
    if (!Number.isFinite(shipId) || shipId <= 0) {
      return NextResponse.json({ error: "Navio inválido." }, { status: 400 });
    }

    const navio = await prisma.navio.findUnique({
      where: { id: shipId },
      select: {
        id: true,
        nome: true,
        matricula: true,
        proprietario: true,
        bandeira: true,
        imo: true,
        portoRegisto: true,
        serviceStationId: true,
        cliente: { select: { nome: true } },
      },
    });
    if (!navio) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });

    if (!access.isAdmin) {
      if (access.stationId && navio.serviceStationId && navio.serviceStationId !== access.stationId) {
        return NextResponse.json({ error: "Navio fora da estação de serviço ativa." }, { status: 403 });
      }
      if (
        !access.stationId &&
        access.allowedStationIds.length > 0 &&
        navio.serviceStationId &&
        !access.allowedStationIds.includes(navio.serviceStationId)
      ) {
        return NextResponse.json({ error: "Navio fora das estações permitidas." }, { status: 403 });
      }
    }

    const fatos = await prisma.fatoImersao.findMany({
      where: { shipId },
      orderBy: { serial: "asc" },
      include: {
        certificado: true,
        verificacoes: { orderBy: { dataVerificacao: "desc" }, take: 1 },
      },
    });
    if (fatos.length === 0) {
      return NextResponse.json({ error: "Este navio não tem fatos de imersão associados." }, { status: 404 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    const stationId = navio.serviceStationId || activeStationId;
    const station = stationId
      ? await prisma.serviceStation.findUnique({ where: { id: stationId }, select: { nome: true, localizacao: true } })
      : null;

    const rows = fatos.map((fato) => ({
      marca: fato.marca || "",
      modelo: fato.modelo || "",
      serial: fato.serial || "",
      dataFabrico: normalizeMonthInput(fato.dataFabrico) || fato.dataFabrico || "",
      status: inspectionStatus({
        certificadoResultado: fato.certificado?.resultado,
        verificacaoResultado: fato.verificacoes[0]?.resultadoGeral,
        estado: fato.estado,
      }),
    }));

    const nextDates = fatos
      .flatMap((fato) => [
        fato.dataProxInspecao,
        fato.certificado?.dataValidade ? fato.certificado.dataValidade.toISOString().slice(0, 10) : null,
      ])
      .filter((value): value is string => Boolean(value))
      .sort();

    const buffer = await generateNavioFatosImersaoCertificateDocx({
      shipName: navio.nome,
      shipOwner: navio.proprietario || navio.cliente?.nome || "",
      imoNumber: navio.imo || "",
      flag: navio.bandeira || "",
      portOfCall: navio.portoRegisto || "",
      serviceStation: station?.nome || "",
      inspectionPlaceAndDate: `${station?.localizacao || station?.nome || "Ponta Delgada"}, ${new Date().toLocaleDateString("pt-PT")}`,
      nextInspectionDate: formatPtDate(nextDates[0]),
      rows,
    });

    const safeName = (navio.matricula || navio.nome || String(navio.id)).replace(/[^a-zA-Z0-9._-]+/g, "_");

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="certificado-fatos-imersao-${safeName}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/fatos-imersao/certificado-navio]", error);
    return NextResponse.json({ error: "Erro ao gerar o certificado dos fatos de imersão." }, { status: 500 });
  }
}
