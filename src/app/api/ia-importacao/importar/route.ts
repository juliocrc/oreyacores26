import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { isKnownPackTypeName } from "@/lib/custom-pack-types";
import { normalizeArtigoValidade } from "@/lib/date-utils";
import { toCanonicalDateStr } from "@/lib/date-display";
import {
  canonicalizeCylinderSistema,
  canonicalizeRaftBrand,
  canonicalizeRaftModel,
} from "@/lib/text-normalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteBody = {
  stationId?: unknown;
  fields?: Record<string, unknown>;
  artigos?: unknown;
  fileName?: unknown;
  fileType?: unknown;
  documentKind?: unknown;
  extracted?: unknown;
  corrected?: unknown;
};

type NormalizedArtigo = {
  name: string;
  quantidade: number;
  validade: Date | null;
  referencia: string | null;
  codigoFabricante: string | null;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMonthYear(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";

  const mmYyyy = raw.match(/^(\d{1,2})[/-](\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${mmYyyy[2]}`;
  }

  const yyyyMm = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (yyyyMm) {
    const month = Number(yyyyMm[2]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${yyyyMm[1]}`;
  }

  return "";
}

function normalizeCapacity(value: unknown): number {
  const parsed = Number(text(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(200, Math.floor(parsed));
}

function normalizeArtigos(raw: unknown): NormalizedArtigo[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const name = text(entry.name);
      if (!name) return null;

      const quantidadeRaw = Number(text(entry.quantidade));
      const quantidade = Number.isFinite(quantidadeRaw)
        ? Math.max(1, Math.round(quantidadeRaw))
        : 1;
      const validadeRaw = text(entry.validade);

      return {
        name,
        quantidade,
        validade: validadeRaw ? normalizeArtigoValidade(validadeRaw) : null,
        referencia: text(entry.referencia) || null,
        codigoFabricante: text(entry.codigoFabricante) || null,
      };
    })
    .filter((item): item is NormalizedArtigo => item !== null);
}

async function findShipByName(shipName: string) {
  if (!shipName) return null;
  const candidates = await prisma.navio.findMany({
    where: { nome: { contains: shipName } },
    select: { id: true, nome: true },
    take: 10,
  });
  const wanted = shipName.trim().toLowerCase();
  return candidates.find((candidate) => candidate.nome.trim().toLowerCase() === wanted) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    if (!access.isAdmin && !canEditPath(access.permissions, "/jangadas")) {
      return NextResponse.json({ error: "Sem permissão para importar jangadas." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as RouteBody;
    const stationId = Number(body.stationId);
    if (!Number.isFinite(stationId) || stationId <= 0) {
      return NextResponse.json({ error: "Selecione a estação de serviço de destino." }, { status: 400 });
    }

    if (
      !access.isAdmin &&
      access.stationId !== stationId &&
      !access.allowedStationIds.includes(stationId)
    ) {
      return NextResponse.json({ error: "Sem acesso à estação de serviço selecionada." }, { status: 403 });
    }

    const station = await prisma.serviceStation.findUnique({
      where: { id: stationId },
      select: { id: true, nome: true, codigo: true, ativo: true },
    });
    if (!station || !station.ativo) {
      return NextResponse.json({ error: "Estação de serviço inválida ou inativa." }, { status: 400 });
    }

    const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
    const serial = text(fields.raftSerial);
    const brand = canonicalizeRaftBrand(text(fields.brand));
    const model = canonicalizeRaftModel(
      text(fields.model),
      brand,
      fields.emergencyPackType,
      serial,
    );

    if (!serial) return NextResponse.json({ error: "O número de série é obrigatório." }, { status: 400 });
    if (!brand) return NextResponse.json({ error: "A marca é obrigatória." }, { status: 400 });
    if (!model) return NextResponse.json({ error: "O modelo é obrigatório." }, { status: 400 });

    const packType = text(fields.emergencyPackType);
    if (packType && !(await isKnownPackTypeName(packType, { includeInactiveCustom: true }))) {
      return NextResponse.json({ error: `Tipo de pack inválido: ${packType}.` }, { status: 400 });
    }

    const shipName = text(fields.shipName);
    const owner = text(fields.ownerName);
    const dataFabrico = normalizeMonthYear(fields.dataFabrico);
    const dataInspecao = toCanonicalDateStr(text(fields.dataInspecao));
    const dataProxInspecao = toCanonicalDateStr(text(fields.dataProxInspecao));
    const capacity = normalizeCapacity(fields.capacity);
    const matchedShip = await findShipByName(shipName);
    const artigos = normalizeArtigos(body.artigos);

    const createData = {
      serviceStationId: station.id,
      serial,
      brand,
      model,
      capacity,
      owner,
      shipId: matchedShip?.id ?? null,
      shipNameManual: matchedShip?.nome ?? (shipName || null),
      dataFabrico,
      packType,
      dataInspecao: dataInspecao || null,
      dataProxInspecao: dataProxInspecao || null,
      ultimoCertificadoNumero: text(fields.certificadoNumero) || null,
      fabricType: text(fields.fabricType) || null,
      cylinderSerial: text(fields.cylinderSerial) || null,
      cylinderCo2: text(fields.cylinderCo2) || null,
      cylinderN2: text(fields.cylinderN2) || null,
      cylinderTara: text(fields.cylinderTara) || null,
      cylinderPesoBruto: text(fields.cylinderPesoBruto) || null,
      cylinderSistema: canonicalizeCylinderSistema(text(fields.cylinderSistema)) || null,
    };

    const updateData: Record<string, unknown> = {
      serviceStationId: station.id,
      serial,
      brand,
      model,
    };
    if (capacity > 0) updateData.capacity = capacity;
    if (owner) updateData.owner = owner;
    if (shipName) {
      updateData.shipId = matchedShip?.id ?? null;
      updateData.shipNameManual = matchedShip?.nome ?? shipName;
    }
    if (dataFabrico) updateData.dataFabrico = dataFabrico;
    if (packType) updateData.packType = packType;
    if (dataInspecao) updateData.dataInspecao = dataInspecao;
    if (dataProxInspecao) updateData.dataProxInspecao = dataProxInspecao;
    if (text(fields.certificadoNumero)) {
      updateData.ultimoCertificadoNumero = text(fields.certificadoNumero);
    }
    for (const [field, value] of [
      ["fabricType", fields.fabricType],
      ["cylinderSerial", fields.cylinderSerial],
      ["cylinderCo2", fields.cylinderCo2],
      ["cylinderN2", fields.cylinderN2],
      ["cylinderTara", fields.cylinderTara],
      ["cylinderPesoBruto", fields.cylinderPesoBruto],
      ["cylinderSistema", fields.cylinderSistema],
    ] as const) {
      const normalized = text(value);
      if (normalized) {
        updateData[field] =
          field === "cylinderSistema" ? canonicalizeCylinderSistema(normalized) : normalized;
      }
    }

    const existing = await prisma.jangada.findUnique({
      where: { serial },
      select: { id: true, serviceStationId: true },
    });

    if (
      existing &&
      !access.isAdmin &&
      existing.serviceStationId &&
      !access.allowedStationIds.includes(existing.serviceStationId)
    ) {
      return NextResponse.json(
        { error: "A jangada existe numa estação de serviço sem acesso para esta conta." },
        { status: 403 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const jangada = existing
        ? await tx.jangada.update({ where: { id: existing.id }, data: updateData })
        : await tx.jangada.create({ data: createData });

      if (Array.isArray(body.artigos)) {
        await tx.artigoJangada.deleteMany({
          where: { jangadaId: jangada.id, inspecaoId: null },
        });
        if (artigos.length > 0) {
          await tx.artigoJangada.createMany({
            data: artigos.map((artigo) => ({ ...artigo, jangadaId: jangada.id })),
          });
        }
      }

      return { jangada, created: !existing };
    });

    if (body.extracted && typeof body.extracted === "object") {
      try {
        const safe = (value: unknown) => JSON.stringify(value ?? {}).slice(0, 200_000);
        await prisma.importacaoIaExemplo.create({
          data: {
            fileName: text(body.fileName) || "documento",
            fileType: text(body.fileType) || "unknown",
            documentKind: text(body.documentKind) || null,
            extractedJson: safe(body.extracted),
            correctedJson: safe(body.corrected ?? { fields, artigos }),
            jangadaId: result.jangada.id,
            shipId: matchedShip?.id ?? null,
            createdBy: access.email || String(access.userId),
          },
        });
      } catch (error) {
        console.error("[ia-importacao/importar] falha ao guardar exemplo de treino:", error);
      }
    }

    return NextResponse.json({
      ok: true,
      jangadaId: result.jangada.id,
      created: result.created,
      station: { id: station.id, nome: station.nome, codigo: station.codigo },
      shipMatched: Boolean(matchedShip),
      artigosAplicados: Array.isArray(body.artigos) ? artigos.length : 0,
    });
  } catch (error) {
    console.error("[POST /api/ia-importacao/importar]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao importar os dados." },
      { status: 500 },
    );
  }
}
