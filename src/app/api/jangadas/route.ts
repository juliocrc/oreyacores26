import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canonicalizeAzoresIsland } from "@/lib/azores-islands";
import type { Prisma } from "@prisma/client";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { formatTechnicalBulletinShortLabel, getApplicableServiceBulletinsForRaft } from "@/modules/rafts/serviceBulletins";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { deleteJangadaById } from "@/lib/jangada-delete";
import { canonicalizeDateFields } from "@/lib/date-display";
import {
  canonicalizeCylinderSistema,
  canonicalizeRaftBrand,
  canonicalizeRaftModel,
  normalizeUpperText,
} from "@/lib/text-normalization";
import { isKnownPackTypeName } from "@/lib/custom-pack-types";
import { parsePageParams, paginatedResponse } from "@/lib/pagination";

// Debug bypass removed — restore normal authentication behaviour.
const HRU_REFERENCE_ARTIGO = "20701002";

function parseServiceStationMeta(raw?: string | null) {
  const text = String(raw || "").trim();
  if (!text) return {} as { scheduledAt?: string; startedAt?: string; finishedAt?: string; deliveredAt?: string };

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      return {
        scheduledAt: typeof parsed.scheduledAt === "string" ? parsed.scheduledAt : undefined,
        startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : undefined,
        finishedAt: typeof parsed.finishedAt === "string" ? parsed.finishedAt : undefined,
        deliveredAt: typeof parsed.deliveredAt === "string" ? parsed.deliveredAt : undefined,
      };
    }
  } catch {
    // legacy text-only note
  }

  return {} as { scheduledAt?: string; startedAt?: string; finishedAt?: string; deliveredAt?: string };
}

function addFiveYears(value?: string) {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  const date = new Date(parsed);
  date.setFullYear(date.getFullYear() + 5);
  return date.toISOString().slice(0, 10);
}

function normalizeIsoDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function addYearsToIsoDate(value: string, years: number) {
  const normalized = normalizeIsoDate(value);
  if (!normalized) return "";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function parseHruApplicability(value: unknown): boolean | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (["SIM", "YES", "TRUE", "1"].includes(raw)) return true;
  if (["NAO", "NÃO", "NO", "FALSE", "0"].includes(raw)) return false;
  return null;
}

function applyHruBusinessRulesForCreate(rawInput: Record<string, unknown>) {
  const explicitApplicability = Object.prototype.hasOwnProperty.call(rawInput || {}, "hruAplicavel")
    ? parseHruApplicability(rawInput.hruAplicavel)
    : null;

  const hruReferencia = String(rawInput?.hruReferencia ?? "").trim();
  const hruDataInstalacaoRaw = String(rawInput?.hruDataInstalacao ?? "").trim();
  const hruDataInstalacao = normalizeIsoDate(hruDataInstalacaoRaw);

  const hasAnyHruInput = Boolean(
    explicitApplicability !== null ||
    hruReferencia ||
    hruDataInstalacaoRaw ||
    String(rawInput?.hruValidade ?? "").trim()
  );

  if (!hasAnyHruInput) {
    const fallbackReferencia = String(rawInput?.hruReferencia ?? "").trim();
    const fallbackInstalacao = normalizeIsoDate(rawInput?.hruDataInstalacao);
    const fallbackValidadeRaw = String(rawInput?.hruValidade ?? "").trim();
    const fallbackValidade = normalizeIsoDate(fallbackValidadeRaw);

    return {
      error: null as string | null,
      hruReferencia: fallbackReferencia || null,
      hruDataInstalacao: fallbackInstalacao || null,
      hruValidade: fallbackValidade || null,
    };
  }

  const isApplicable = explicitApplicability ?? Boolean(hruReferencia || hruDataInstalacaoRaw);

  if (!isApplicable) {
    return {
      error: null as string | null,
      hruReferencia: null,
      hruDataInstalacao: null,
      hruValidade: null,
    };
  }

  const hruReferenciaFinal = hruReferencia || HRU_REFERENCE_ARTIGO;

  if (!hruDataInstalacao) {
    return { error: "HRU aplicável: informe uma data de instalação válida." };
  }

  return {
    error: null as string | null,
    hruReferencia: hruReferenciaFinal,
    hruDataInstalacao,
    hruValidade: addYearsToIsoDate(hruDataInstalacao, 2),
  };
}

function applyHruBusinessRulesForUpdate(args: {
  rawInput: Record<string, unknown>;
  updateData: Record<string, unknown>;
  current?: { hruReferencia?: string | null; hruDataInstalacao?: string | null; hruValidade?: string | null } | null;
}) {
  const { rawInput, updateData, current } = args;

  const hasAnyHruInput = ["hruAplicavel", "hruReferencia", "hruDataInstalacao", "hruValidade"].some((field) =>
    Object.prototype.hasOwnProperty.call(rawInput || {}, field)
  );

  if (!hasAnyHruInput) return { error: null as string | null };

  const explicitApplicability = Object.prototype.hasOwnProperty.call(rawInput || {}, "hruAplicavel")
    ? parseHruApplicability(rawInput.hruAplicavel)
    : null;

  const resolveField = (field: "hruReferencia" | "hruDataInstalacao" | "hruValidade") => {
    if (Object.prototype.hasOwnProperty.call(updateData, field)) {
      return String(updateData[field] ?? "").trim();
    }
    return String(current?.[field] ?? "").trim();
  };

  const hruReferencia = resolveField("hruReferencia");
  const hruDataInstalacaoRaw = resolveField("hruDataInstalacao");
  const hruDataInstalacao = normalizeIsoDate(hruDataInstalacaoRaw);

  const isApplicable = explicitApplicability ?? Boolean(hruReferencia || hruDataInstalacaoRaw);

  if (!isApplicable) {
    updateData.hruReferencia = "";
    updateData.hruDataInstalacao = "";
    updateData.hruValidade = "";
    return { error: null as string | null };
  }

  const hruReferenciaFinal = hruReferencia || HRU_REFERENCE_ARTIGO;

  if (!hruDataInstalacao) {
    return { error: "HRU aplicável: informe uma data de instalação válida." };
  }

  updateData.hruReferencia = hruReferenciaFinal;
  updateData.hruDataInstalacao = hruDataInstalacao;
  updateData.hruValidade = addYearsToIsoDate(hruDataInstalacao, 2);

  return { error: null as string | null };
}

function normalizeMonthYear(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${year}`;
  }

  const yyyyMm = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (yyyyMm) {
    const year = Number(yyyyMm[1]);
    const month = Number(yyyyMm[2]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${year}`;
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) {
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${year}`;
  }

  return null;
}

function isLegacyAlmarModel(value: unknown) {
  return normalizeUpperText(value) === "ALMAR";
}

function normalizeBrandName(value: unknown, model?: unknown) {
  if (isLegacyAlmarModel(model)) return "ALMAR";
  return canonicalizeRaftBrand(value ?? "");
}

function normalizeRaftModel(value: unknown, brand?: unknown, packType?: unknown, serial?: unknown) {
  if (isLegacyAlmarModel(value)) return "STD";
  return canonicalizeRaftModel(value ?? "", brand, packType, serial);
}

function parseNullableId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

// DELETE em lote ou individual: recebe { ids: number[] } para lote ou ?id=1 na query url para individual
export async function DELETE(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Sem permissão para eliminar jangadas." }, { status: 403 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (id) {
       await deleteJangadaById(Number(id));
       return NextResponse.json({ success: true });
    }

    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Envie um array de IDs para exclusão em lote." }, { status: 400 });
    }

    for (const rawId of ids) {
      await deleteJangadaById(Number(rawId));
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return buildDatabaseErrorResponse(error, error instanceof Error ? error.message : "Erro ao excluir jangadas.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const canManageJangadas = access.isAdmin || canEditPath(access.permissions, "/jangadas");
    if (!canManageJangadas) return NextResponse.json({ error: "Sem permissão para criar jangadas." }, { status: 403 });

    const data = canonicalizeDateFields(await req.json(), [
      "dataFabrico",
      "dataInspecao",
      "dataProxInspecao",
      "cylinderDataTeste",
      "cylinderDataProxTeste",
      "hruDataInstalacao",
      "hruValidade",
      "radarReflectorValidade",
    ]);
      const activeStationId = resolveActiveServiceStationId(req, access);
      const enforcedServiceStationId = access.isAdmin
        ? parseNullableId(data.serviceStationId)
        : activeStationId || access.stationId || access.allowedStationIds[0] || null;

      if (!access.isAdmin && !enforcedServiceStationId) {
        return NextResponse.json({ error: "Conta sem estação de serviço associada." }, { status: 403 });
      }

      const isValidPackType = await isKnownPackTypeName(String(data?.packType || ""));
      if (!isValidPackType) {
        return NextResponse.json({ error: "Tipo de pack inválido." }, { status: 400 });
      }
      if(data.serial) {
        const existingJangada = await prisma.jangada.findUnique({ where: { serial: data.serial } });
        if (existingJangada) return NextResponse.json({ error: "Já existe uma jangada com esse número de série registada." }, { status: 400 });
      }
      const cylinderDataProxTeste = data.cylinderDataTeste ? addFiveYears(String(data.cylinderDataTeste)) : data.cylinderDataProxTeste;
      const hruRules = applyHruBusinessRulesForCreate(data || {});
      if (hruRules.error) {
        return NextResponse.json({ error: hruRules.error }, { status: 400 });
      }
    const jangada = await prisma.jangada.create({
      data: {
        serial: data.serial,
        brand: normalizeBrandName(data.brand, data.model),
        model: normalizeRaftModel(data.model, data.brand, data.packType, data.serial),
        launchType: data.launchType || null,
        painterLength: data.painterLength || null,
        maxStowageHeight: data.maxStowageHeight || null,
        capacity: data.capacity !== undefined ? (Number(data.capacity) || 0) : 0,
        owner: data.owner || "",
        dataFabrico: normalizeMonthYear(data.dataFabrico) || "",
        packType: data.packType || "",
        containerModel: data.containerModel || null,
        shipId: data.shipId ? Number(data.shipId) : null,
        shipNameManual: data.shipNameManual || null,
        cylinderDataTeste: data.cylinderDataTeste || null,
        cylinderDataProxTeste: cylinderDataProxTeste || null,
        cylinderSistema: canonicalizeCylinderSistema(data.cylinderSistema),
        cylinderTara: data.cylinderTara || null,
        cylinderPesoBruto: data.cylinderPesoBruto || null,
        cylinderCabecaDisparoRef: data.cylinderCabecaDisparoRef || null,
        cylinderCabecaDisparoSerial: data.cylinderCabecaDisparoSerial || null,
        cylinderCabecaDisparoDescricao: data.cylinderCabecaDisparoDescricao || null,
        cylinderTuboCamaraSuperiorRef: data.cylinderTuboCamaraSuperiorRef || null,
        cylinderTuboCamaraSuperiorDescricao: data.cylinderTuboCamaraSuperiorDescricao || null,
        cylinderTuboCamaraInferiorRef: data.cylinderTuboCamaraInferiorRef || null,
        cylinderTuboCamaraInferiorDescricao: data.cylinderTuboCamaraInferiorDescricao || null,
        cylinderAcessoriosCamaraSuperiorJson: data.cylinderAcessoriosCamaraSuperiorJson || null,
        cylinderAcessoriosCamaraInferiorJson: data.cylinderAcessoriosCamaraInferiorJson || null,
        valvulasAlivio: data.valvulasAlivio || null,
        valvulasAtestar: data.valvulasAtestar || null,
        hruReferencia: hruRules.hruReferencia || null,
        hruDataInstalacao: hruRules.hruDataInstalacao || null,
        hruValidade: hruRules.hruValidade || null,
        radarReflector: data.radarReflector || null,
        radarReflectorValidade: data.radarReflectorValidade || null,
        tuboIdentificacao: data.tuboIdentificacao || null,
        serviceStationId: enforcedServiceStationId,
        ...(data.artigos && { artigos: data.artigos }),
      },
    });
    return NextResponse.json(jangada, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      if (Array.isArray(target) && target.includes("serial")) {
        return NextResponse.json({ error: "Já existe uma jangada com esse número de série registada." }, { status: 409 });
      }
      return NextResponse.json({ error: "Violação de unicidade na base de dados." }, { status: 409 });
    }
    return buildDatabaseErrorResponse(error, error instanceof Error ? error.message : "Erro ao criar jangada");
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const urlObj = new URL(req.url, process.env.NEXT_PUBLIC_BASE_URL || "http://localhost");
    const { searchParams } = urlObj;
    const includeQueue = searchParams.get("includeQueue") === "true";
    const activeStationId = resolveActiveServiceStationId(req, access);
    const bypassStationScope = access.isAdmin && !activeStationId;
    const where: Prisma.JangadaWhereInput = {};
    const serialParam = searchParams.get("serial"); if (serialParam) where.serial = { contains: serialParam, mode: "insensitive" };
    const brandParam = searchParams.get("brand"); if (brandParam) where.brand = { contains: brandParam, mode: "insensitive" };
    const modelParam = searchParams.get("model"); if (modelParam) where.model = { contains: modelParam, mode: "insensitive" };
    const ownerParam = searchParams.get("owner"); if (ownerParam) where.owner = { contains: ownerParam, mode: "insensitive" };
    const shipIdParam = searchParams.get("shipId"); if (shipIdParam) where.shipId = Number(shipIdParam);
    const shipNameManualParam = searchParams.get("shipNameManual"); if (shipNameManualParam) where.shipNameManual = { contains: shipNameManualParam, mode: "insensitive" };
    const dataInspecaoParam = searchParams.get("dataInspecao"); if (dataInspecaoParam) where.dataInspecao = { contains: dataInspecaoParam, mode: "insensitive" };
    const dataProxInspecaoParam = searchParams.get("dataProxInspecao"); if (dataProxInspecaoParam) where.dataProxInspecao = { contains: dataProxInspecaoParam, mode: "insensitive" };
    if (searchParams.get("status")) where.serviceStationId = { not: null }; // placeholder for status filter
    const islandParam2 = searchParams.get("island");
    if (islandParam2) {
      const island = islandParam2;
      const shipIdsWithIsland = await prisma.navio.findMany({
        where: { ilha: { equals: island, mode: "insensitive" } },
        select: { id: true }
      });
      where.shipId = { in: shipIdsWithIsland.map(s => s.id) };
    }
    if (!bypassStationScope) {
      if (activeStationId) {
        where.serviceStationId = activeStationId;
      } else if (!access.isAdmin) {
        where.serviceStationId = { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] };
      }
    }

    const wantsPage = searchParams.has("page") || searchParams.get("paginated") === "1";
    const pageParams = parsePageParams(searchParams, { pageSize: 50, maxPageSize: 200 });

    const jangadas = await prisma.jangada.findMany({
      where,
      ...(wantsPage ? { skip: pageParams.skip, take: pageParams.take } : {}),
      select: {
        id: true,
        serial: true,
        brand: true,
        model: true,
        launchType: true,
        painterLength: true,
        maxStowageHeight: true,
        capacity: true,
        owner: true,
        dataFabrico: true,
        packType: true,
        containerModel: true,
        shipId: true,
        shipNameManual: true,
        serviceStationId: true,
        serviceStation: {
          select: {
            id: true,
            codigo: true,
            nome: true,
          },
        },
        dataInspecao: true,
        dataProxInspecao: true,
        cylinderSerial: true,
        cylinderTara: true,
        cylinderPesoBruto: true,
        cylinderCo2: true,
        cylinderN2: true,
        cylinderDataTeste: true,
        cylinderDataProxTeste: true,
        cylinderSistema: true,
        cylinderCabecaDisparoRef: true,
        cylinderCabecaDisparoSerial: true,
        cylinderCabecaDisparoDescricao: true,
        cylinderTuboCamaraSuperiorRef: true,
        cylinderTuboCamaraSuperiorDescricao: true,
        cylinderTuboCamaraInferiorRef: true,
        cylinderTuboCamaraInferiorDescricao: true,
        cylinderAcessoriosCamaraSuperiorJson: true,
        cylinderAcessoriosCamaraInferiorJson: true,
        valvulasAlivio: true,
        valvulasAtestar: true,
        hruReferencia: true,
        hruDataInstalacao: true,
        hruValidade: true,
        radarReflector: true,
        radarReflectorValidade: true,
        tuboIdentificacao: true,
        numeroObra: true,
        artigos: {
          select: {
            id: true,
            name: true,
            quantidade: true,
            validade: true,
            referencia: true,
            codigoFabricante: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        certificadoAtivoId: true,
      }
    });

    const shipIds = Array.from(
      new Set(
        jangadas
          .map((item) => item.shipId)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      )
    );

    const shipsById = shipIds.length
      ? new Map(
          (
            await prisma.navio.findMany({
              where: { id: { in: shipIds } },
              select: {
                id: true,
                nome: true,
                ilha: true,
                portoRegisto: true,
                cliente: {
                  select: {
                    id: true,
                    nome: true,
                    ilha: true,
                  },
                },
              },
            })
          ).map((ship) => [ship.id, ship])
        )
      : new Map<number, { id: number; nome: string; ilha: string | null; portoRegisto: string | null; cliente: { id: number; nome: string; ilha: string | null } | null }>();

    const jangadaIds = jangadas.map((item) => item.id);
    
    // Fetch queue data if requested
    let queueRows: Prisma.ServiceStationQueueGetPayload<{ select: { id: true; jangadaId: true; status: true; dataChegada: true; dataPrevistaEntrega: true; observacoes: true } }>[] = [];
    const latestQueueByRaft = new Map<number, (typeof queueRows)[number]>();
    if (includeQueue) {
      queueRows = jangadaIds.length
        ? await prisma.serviceStationQueue.findMany({
            where: { jangadaId: { in: jangadaIds } },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              jangadaId: true,
              status: true,
              dataChegada: true,
              dataPrevistaEntrega: true,
              observacoes: true,
            },
          })
        : [];

      for (const row of queueRows) {
        if (!latestQueueByRaft.has(row.jangadaId)) {
          latestQueueByRaft.set(row.jangadaId, row);
        }
      }
    }

    const latestInspections = jangadaIds.length
      ? await prisma.inspecao.findMany({
          where: {
            OR: [
              { jangadaId: { in: jangadaIds } },
              { jangadaSerial: { in: jangadas.map(j => j.serial).filter(Boolean) } }
            ],
            status: "Concluída",
          },
          orderBy: [{ dataInspecao: "desc" }, { id: "desc" }],
          select: {
            jangadaId: true,
            jangadaSerial: true,
            dataInspecao: true,
            dataProxInspecao: true,
          },
        })
      : [];

    const latestInspByRaftId = new Map<number, typeof latestInspections[number]>();
    const latestInspByRaftSerial = new Map<string, typeof latestInspections[number]>();
    for (const insp of latestInspections) {
      if (insp.jangadaId && !latestInspByRaftId.has(insp.jangadaId)) {
        latestInspByRaftId.set(insp.jangadaId, insp);
      }
      if (insp.jangadaSerial && !latestInspByRaftSerial.has(insp.jangadaSerial)) {
        latestInspByRaftSerial.set(insp.jangadaSerial, insp);
      }
    }

    const enriched = jangadas.map((jangada) => {
      const latestQueue = latestQueueByRaft.get(jangada.id);
      const meta = parseServiceStationMeta(latestQueue?.observacoes);
      const applicableServiceBulletins = getApplicableServiceBulletinsForRaft(jangada);

      const linkedShip = jangada.shipId ? (shipsById.get(jangada.shipId) || null) : null;

      const latestInsp = (jangada.id ? latestInspByRaftId.get(jangada.id) : null)
        || (jangada.serial ? latestInspByRaftSerial.get(jangada.serial) : null);

      const effectiveDataInspecao = latestInsp?.dataInspecao || jangada.dataInspecao;
      const effectiveDataProxInspecao = latestInsp?.dataProxInspecao || jangada.dataProxInspecao;

      return {
        ...jangada,
        dataInspecao: effectiveDataInspecao,
        dataProxInspecao: effectiveDataProxInspecao,
        linkedShipName: linkedShip?.nome || null,
        navio: linkedShip
          ? {
              nome: linkedShip.nome,
              cliente: linkedShip.cliente
                ? {
                    id: linkedShip.cliente.id,
                    nome: linkedShip.cliente.nome,
                    ilha: linkedShip.cliente.ilha,
                  }
                : undefined,
            }
          : undefined,
        brand: normalizeBrandName(jangada.brand, jangada.model),
        model: normalizeRaftModel(jangada.model, jangada.brand, jangada.packType, jangada.serial),
        cylinderSistema: canonicalizeCylinderSistema(jangada.cylinderSistema),
        status: latestQueue?.status || null,
        inQueue: !!latestQueue,
        queueStatus: latestQueue?.status || null,
        queueDataChegada: latestQueue?.dataChegada?.toISOString() || null,
        queueDataPrevistaEntrega: latestQueue?.dataPrevistaEntrega?.toISOString().slice(0, 10) || null,
        queueObservacoes: latestQueue?.observacoes || null,
        serviceStationName: jangada.serviceStation?.nome || null,
        shipName: linkedShip?.nome || jangada.shipNameManual || null,
        // Only expose an island value when it's a canonical Azores island; mainland ships should not have an island
        island: ((): string | null => {
          const shipIsland = linkedShip?.ilha ? canonicalizeAzoresIsland(linkedShip.ilha) : null;
          if (shipIsland) return shipIsland;
          const clienteIsland = linkedShip?.cliente?.ilha ? canonicalizeAzoresIsland(linkedShip!.cliente!.ilha) : null;
          return clienteIsland ?? null;
        })(),
        portoRegisto: linkedShip?.portoRegisto || null,
        ilha: ((): string | null => (linkedShip?.cliente?.ilha ? canonicalizeAzoresIsland(linkedShip!.cliente!.ilha) : null))(),
        receivedAt: latestQueue?.dataChegada?.toISOString() || null,
        expectedDeliveryDate: latestQueue?.dataPrevistaEntrega?.toISOString().slice(0, 10) || null,
        delivered: Boolean(meta.deliveredAt),
        deliveredAt: meta.deliveredAt || null,
        scheduledAt: meta.scheduledAt || null,
        startedAt: meta.startedAt || null,
        finishedAt: meta.finishedAt || null,
        applicableServiceBulletinsCount: applicableServiceBulletins.length,
        applicableServiceBulletinTitles: applicableServiceBulletins.map((bulletin) => formatTechnicalBulletinShortLabel(bulletin)),
      };
    });
    if (wantsPage) {
      const total = await prisma.jangada.count({ where });
      return NextResponse.json(
        paginatedResponse({
          items: enriched,
          total,
          page: pageParams.page,
          pageSize: pageParams.pageSize,
        })
      );
    }
    return NextResponse.json(enriched);
  } catch (error: unknown) {
    console.error("[API /jangadas] Erro ao listar jangadas:", error);
    return buildDatabaseErrorResponse(error, error instanceof Error ? error.message : "Erro ao listar jangadas.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const canManageJangadas = access.isAdmin || canEditPath(access.permissions, "/jangadas");
    if (!canManageJangadas) return NextResponse.json({ error: "Sem permissão para editar jangadas." }, { status: 403 });

    const urlObj = new URL(req.url, process.env.NEXT_PUBLIC_BASE_URL || "http://localhost");
    const id = urlObj.searchParams.get("id") || urlObj.pathname.split('/').pop();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = canonicalizeDateFields(await req.json(), [
      "dataFabrico",
      "dataInspecao",
      "dataProxInspecao",
      "cylinderDataTeste",
      "cylinderDataProxTeste",
      "hruDataInstalacao",
      "hruValidade",
      "radarReflectorValidade",
    ]);
    delete data.id;
    delete data.navio;
    delete data.certificadoAtivo;
    delete data.certificadosExtraidos;
    delete data.tsvector;
    const updateData = data;

    const existing = await prisma.jangada.findUnique({
      where: { id: Number(id) },
      select: { id: true, brand: true, model: true, packType: true, hruReferencia: true, hruDataInstalacao: true, hruValidade: true, serviceStationId: true },
    });
    if (!existing) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

    if (!access.isAdmin && !access.allowedStationIds.includes(Number(existing.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem permissão para editar esta jangada." }, { status: 403 });
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "dataFabrico")) {
      updateData.dataFabrico = normalizeMonthYear(updateData.dataFabrico) || "";
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "brand")) {
      updateData.brand = normalizeBrandName(updateData.brand, updateData.model);
    }

    const shouldRecomputeModel = ["brand", "model", "packType"].some((field) =>
      Object.prototype.hasOwnProperty.call(updateData, field)
    );

    if (shouldRecomputeModel) {
      const effectiveBrand = Object.prototype.hasOwnProperty.call(updateData, "brand") ? updateData.brand : existing.brand;
      const effectiveModel = Object.prototype.hasOwnProperty.call(updateData, "model") ? data.model : existing.model;
      const effectivePackType = Object.prototype.hasOwnProperty.call(updateData, "packType") ? updateData.packType : existing.packType;

      updateData.model = normalizeRaftModel(effectiveModel, effectiveBrand, effectivePackType);
      if (Object.prototype.hasOwnProperty.call(updateData, "model") && isLegacyAlmarModel(data.model)) {
        updateData.brand = "ALMAR";
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "packType")) {
      const nextPackType = String(updateData.packType || "");
      const isValidPackType = await isKnownPackTypeName(nextPackType, {
        includeInactiveCustom: nextPackType.trim().toUpperCase() === String(existing.packType || "").trim().toUpperCase(),
      });
      if (!isValidPackType) {
        return NextResponse.json({ error: "Tipo de pack inválido." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "cylinderSistema")) {
      updateData.cylinderSistema = canonicalizeCylinderSistema(updateData.cylinderSistema);
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "serviceStationId")) {
      const parsedServiceStationId = parseNullableId(updateData.serviceStationId);
      if (parsedServiceStationId === undefined) {
        delete updateData.serviceStationId;
      } else if (!access.isAdmin) {
        updateData.serviceStationId = access.stationId || access.allowedStationIds[0] || existing.serviceStationId;
      } else {
        updateData.serviceStationId = parsedServiceStationId;
      }
    }

    if (updateData?.cylinderDataTeste) {
      updateData.cylinderDataProxTeste = addFiveYears(String(updateData.cylinderDataTeste));
    }

    const hruRules = applyHruBusinessRulesForUpdate({
      rawInput: data || {},
      updateData,
      current: existing,
    });
    if (hruRules.error) {
      return NextResponse.json({ error: hruRules.error }, { status: 400 });
    }

    const jangada = await prisma.jangada.update({
      where: { id: Number(id) },
      data: {
        ...updateData,
        capacity: Number(updateData.capacity)
      },
    });

    return NextResponse.json({
      ...jangada,
      brand: normalizeBrandName(jangada.brand, jangada.model),
      model: normalizeRaftModel(jangada.model, jangada.brand, jangada.packType),
      cylinderSistema: canonicalizeCylinderSistema(jangada.cylinderSistema),
    });
  } catch (error: unknown) {
    return buildDatabaseErrorResponse(error, error instanceof Error ? error.message : "Erro ao atualizar jangada");
  }
}
