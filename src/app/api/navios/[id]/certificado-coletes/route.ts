import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";
import { canonicalizeAzoresIsland, inferAzoresIslandFromPort } from "@/lib/azores-islands";
import { generateNavioColetesCertificateDocx } from "@/lib/colete-certificate-template";

export const runtime = "nodejs";

function formatDatePt(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatMonthYearPt(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizeStatus(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "OK";
  if (
    raw.includes("not ok")
    || raw.includes("reprov")
    || raw.includes("abat")
    || raw.includes("inutil")
    || raw.includes("danific")
    || raw.includes("fora de serviço")
  ) {
    return "NOT OK";
  }
  return "OK";
}

function normalizeBrandDisplay(value?: string | null) {
  const normalized = String(value || "").trim().toLocaleLowerCase("pt-PT");
  if (!normalized) return "";

  return normalized.replace(/(^|[\s\-/()])([\p{L}])/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("pt-PT")}`);
}

function normalizeModelDisplay(value?: string | null) {
  const normalized = String(value || "").trim().toLocaleLowerCase("pt-PT");
  if (!normalized) return "";

  const titleCased = normalized.replace(/(^|[\s\-/()])([\p{L}])/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("pt-PT")}`);

  return titleCased
    .replace(/\b(iso|solas|ce|uscg|uml|hru|co2|eu)\b/giu, (token) => token.toLocaleUpperCase("pt-PT"))
    .replace(/\b(\d+)([\p{L}]+)\b/gu, (_match, digits: string, suffix: string) => `${digits}${suffix.toLocaleUpperCase("pt-PT")}`);
}

function sanitizeFilenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function getNextInspectionDate(coletes: Array<{ dataProxInspecao: Date | string | null; certificado: { dataValidade: Date | null } | null }>) {
  const candidates = coletes
    .flatMap((colete) => [colete.dataProxInspecao, colete.certificado?.dataValidade || null])
    .map((value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((value): value is Date => value instanceof Date);

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return formatDatePt(candidates[0]);
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID de navio inválido." }, { status: 400 });
    }

    const [navio, coletes] = await Promise.all([
      prisma.navio.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          proprietario: true,
          cliente: {
            select: {
              nome: true,
            },
          },
          imo: true,
          bandeira: true,
          portoRegisto: true,
          ilha: true,
          serviceStation: {
            select: {
              nome: true,
            },
          },
        },
      }),
      prisma.colete.findMany({
        where: { shipId: id },
        orderBy: [{ serial: "asc" }, { id: "asc" }],
        select: {
          id: true,
          marca: true,
          modelo: true,
          serial: true,
          dataFabrico: true,
          estado: true,
          dataProxInspecao: true,
          certificado: {
            select: {
              resultado: true,
              dataValidade: true,
            },
          },
        },
      }),
    ]);

    if (!navio) {
      return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
    }

    if (!coletes.length) {
      return NextResponse.json({ error: "Este navio não tem coletes associados para certificar." }, { status: 400 });
    }

    const today = new Date();
    const candidatePlace = String(navio.portoRegisto || navio.ilha || APP_CONFIG.defaultRegionLabel || "").trim();
    const inspectionPlace = (canonicalizeAzoresIsland(candidatePlace) || inferAzoresIslandFromPort(candidatePlace) || candidatePlace) as string;
    const inspectionPlaceAndDate = [inspectionPlace, formatDatePt(today)].filter(Boolean).join(", ");
    const serviceStation = String(navio.serviceStation?.nome || APP_CONFIG.name || APP_CONFIG.issuerName).trim();

    const buffer = await generateNavioColetesCertificateDocx({
      shipName: String(navio.nome || "").trim(),
      shipOwner: String(navio.cliente?.nome || navio.proprietario || "").trim(),
      imoNumber: String(navio.imo || "").trim(),
      flag: String(navio.bandeira || "Portugal").trim(),
      portOfCall: String(navio.portoRegisto || canonicalizeAzoresIsland(navio.ilha) || "").trim(),
      classLabel: "",
      serviceStation,
      inspectionPlaceAndDate,
      nextInspectionDate: getNextInspectionDate(coletes),
      rows: coletes.map((colete) => ({
        marca: normalizeBrandDisplay(colete.marca),
        modelo: normalizeModelDisplay(colete.modelo),
        serial: String(colete.serial || `Colete ${colete.id}`).trim(),
        dataFabrico: formatMonthYearPt(colete.dataFabrico),
        status: normalizeStatus(colete.certificado?.resultado || colete.estado),
      })),
    });

    const todayStamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const fileName = `certificado-coletes-${sanitizeFilenamePart(navio.nome || `navio-${id}`)}-${todayStamp}.docx`;
    const responseBody = new Uint8Array(buffer);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar o certificado DOCX de coletes." },
      { status: 500 }
    );
  }
}