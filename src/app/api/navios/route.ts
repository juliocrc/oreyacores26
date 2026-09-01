import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getAccessContext } from "@/lib/access-control";
import { extrairPortoDeMatricula } from "@/utils/portosRegisto";
import { logAuditoria } from "@/lib/auditoria";
import { isValidImo, isValidMmsi } from "@/lib/validators";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { parseCoordinate } from "@/lib/coordinates";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { APP_CONFIG, normalizeStationMatchToken } from "@/lib/app-config";
import { getResolvedClienteIslandForNavio, normalizeManualNavioIsland } from "@/lib/navio-island-resolution";
import { inferAzoresIslandFromPort, isInvalidIslandValue, canonicalizeAzoresIsland } from "@/lib/azores-islands";
import { normalizeNavioDisplayName } from '@/lib/navio-name-normalization';

function isMissingNavioComprimentoMetrosColumn(error: unknown) {
  const message = String(error || "");
  return message.includes("Navio.comprimentoMetros") || message.includes("column `comprimentoMetros` does not exist");
}

function isMissingDatabaseColumnError(error: unknown) {
  const message = String(error || "").toLowerCase();
  return (
    message.includes("does not exist in the current database")
    || (message.includes("column") && message.includes("does not exist"))
    || message.includes("unknown field")
  );
}

async function findNaviosWithResilientSelect(
  where: Prisma.NavioWhereInput,
  options?: { orderBy?: Prisma.NavioOrderByWithRelationInput | Prisma.NavioOrderByWithRelationInput[]; skip?: number; take?: number }
) {
  const { orderBy, skip, take } = options || {};
  try {
    return await prisma.navio.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        serviceStationId: true,
        nome: true,
        matricula: true,
        portoRegisto: true,
        ilha: true,
        tipoPesca: true,
        tipoNavio: true,
        comprimentoMetros: true,
        zonaNavegacao: true,
        proprietario: true,
        bandeira: true,
        mmsi: true,
        imo: true,
        callSignal: true,
        lat: true,
        lng: true,
        territorioGrupo: true,
        estadoNavio: true,
        dataEstado: true,
        clienteId: true,
        cliente: {
          select: {
            id: true,
            nome: true,
            ilha: true,
            nif: true,
            morada: true,
            codigoPostal: true,
            localidade: true,
          },
        },
        serviceStation: {
          select: {
            id: true,
            codigo: true,
            nome: true,
            regiaoOperacional: true,
            territorioTipo: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingDatabaseColumnError(error)) throw error;

    const navios = await prisma.navio.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        serviceStationId: true,
        nome: true,
        matricula: true,
        portoRegisto: true,
        ilha: true,
        tipoPesca: true,
        tipoNavio: true,
        proprietario: true,
        bandeira: true,
        mmsi: true,
        imo: true,
        callSignal: true,
        lat: true,
        lng: true,
        territorioGrupo: true,
        estadoNavio: true,
        dataEstado: true,
        clienteId: true,
        cliente: {
          select: {
            id: true,
            nome: true,
            ilha: true,
            nif: true,
            morada: true,
            codigoPostal: true,
            localidade: true,
          },
        },
      },
    });

    return navios.map((navio) => ({
      ...navio,
      comprimentoMetros: null,
      zonaNavegacao: null,
      serviceStation: null,
    }));
  }
}

async function resolveScopedStationIdsForApp(access: Awaited<ReturnType<typeof getAccessContext>>, req: NextRequest) {
  if (!access) return [] as number[];

  const activeStationId = resolveActiveServiceStationId(req, access);
  if (activeStationId) return [activeStationId];

  if (!access.isAdmin) {
    return access.allowedStationIds.length ? access.allowedStationIds : [-1];
  }

  if (APP_CONFIG.theme === 'deluxe') {
    const stations = await prisma.serviceStation.findMany({
      where: { ativo: true },
      select: { id: true },
    });
    return stations.map((station) => station.id);
  }

  const targetToken = normalizeStationMatchToken(APP_CONFIG.defaultServiceStationCode);
  if (!targetToken) return [] as number[];

  const stations = await prisma.serviceStation.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, nome: true, regiaoOperacional: true },
  });

  return stations
    .filter((station) => (
      normalizeStationMatchToken(station.codigo) === targetToken
      || normalizeStationMatchToken(station.nome) === targetToken
      || normalizeStationMatchToken(station.regiaoOperacional) === targetToken
    ))
    .map((station) => station.id);
}

function resolveClienteId(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "clienteId")) return undefined;
  if (body?.clienteId === null || body?.clienteId === "") return null;

  const parsed = Number(body?.clienteId);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return null;
}

function resolveOptionalPositiveFloat(body: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;

  const rawValue = body?.[key];
  if (rawValue === null || rawValue === "") return null;

  const normalized = String(rawValue).trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveOptionalPositiveInt(body: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;

  const rawValue = body?.[key];
  if (rawValue === null || rawValue === "") return null;

  const normalized = String(rawValue).trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function sanitizeNavioPayload(body: Record<string, unknown>) {
  const bandeiraValue = typeof body?.bandeira === "string" ? body.bandeira.trim() : "";
  const lat = Object.prototype.hasOwnProperty.call(body || {}, "lat") ? parseCoordinate(body?.lat, "lat") : undefined;
  const lng = Object.prototype.hasOwnProperty.call(body || {}, "lng") ? parseCoordinate(body?.lng, "lng") : undefined;
  const comprimentoMetros = resolveOptionalPositiveFloat(body, "comprimentoMetros");
  const lotacao = resolveOptionalPositiveInt(body, "lotacao");
  const payload: Record<string, unknown> = {
    nome: typeof body?.nome === "string" ? normalizeNavioDisplayName(body.nome) : undefined,
    matricula: typeof body?.matricula === "string" ? body.matricula.trim() : undefined,
    // Normalize ilha: trim and treat empty strings as undefined so later logic can decide
    ilha: typeof body?.ilha === "string" ? (body.ilha.trim() || undefined) : undefined,
    tipoPesca: typeof body?.tipoPesca === "string" ? body.tipoPesca.trim() : undefined,
    tipoNavio: typeof body?.tipoNavio === "string" ? body.tipoNavio.trim() : undefined,
    comprimentoMetros,
    lotacao,
    zonaNavegacao: typeof body?.zonaNavegacao === "string" ? (body.zonaNavegacao.trim() || null) : undefined,
    proprietario: typeof body?.proprietario === "string" ? body.proprietario.trim() : undefined,
    portoRegisto: typeof body?.portoRegisto === "string" ? body.portoRegisto.trim() : undefined,
    bandeira: bandeiraValue || "Portugal",
    mmsi: typeof body?.mmsi === "string" ? body.mmsi.trim() : undefined,
    imo: typeof body?.imo === "string" ? body.imo.trim() : undefined,
    callSignal: typeof body?.callSignal === "string" ? body.callSignal.trim() : undefined,
    lat,
    lng,
    clienteId: resolveClienteId(body),
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  if (!payload.portoRegisto && payload.matricula) {
    const portoInferido = extrairPortoDeMatricula(payload.matricula as string);
    if (portoInferido) payload.portoRegisto = portoInferido;
  }

  return payload;
}

async function applyResolvedIslandToNavioPayload(
  payload: Record<string, unknown>,
  options?: { effectiveClienteId?: number | null; fallbackIlha?: string | null }
) {
  const effectiveClienteId = options?.effectiveClienteId !== undefined
    ? options.effectiveClienteId
    : (typeof payload.clienteId === "number" ? payload.clienteId : undefined);

  if (typeof effectiveClienteId === "number" && Number.isFinite(effectiveClienteId) && effectiveClienteId > 0) {
    const { cliente, island } = await getResolvedClienteIslandForNavio(effectiveClienteId);
    if (!cliente) {
      throw new Error("Cliente associado não encontrado.");
    }

    payload.clienteId = effectiveClienteId;
    // Prefer resolved cliente island (already canonicalized), otherwise try manual or fallback.
    // Only assign an island if it's a canonical Azores island.
    const candidate = island ?? normalizeManualNavioIsland(payload.ilha) ?? options?.fallbackIlha ?? payload.ilha ?? undefined;
    payload.ilha = candidate && canonicalizeAzoresIsland(candidate) ? canonicalizeAzoresIsland(candidate) : undefined;
    return payload;
  }

  // If portoRegisto is present, try to infer island from the port name (helpful for continental ports -> null)
  if (payload.portoRegisto) {
    const inferred = inferAzoresIslandFromPort(payload.portoRegisto);
    if (inferred) {
      payload.ilha = inferred;
      return payload;
    }
  }

  // Manual island entry: only accept canonical Azores islands; otherwise leave undefined
  const normalizedManualIsland = normalizeManualNavioIsland(payload.ilha);
  if (normalizedManualIsland !== null && canonicalizeAzoresIsland(normalizedManualIsland)) {
    payload.ilha = canonicalizeAzoresIsland(normalizedManualIsland);
  } else {
    payload.ilha = undefined;
  }

  return payload;
}

const andWithNavioWhere = (base: Prisma.NavioWhereInput, extra: Prisma.NavioWhereInput): Prisma.NavioWhereInput => ({
  AND: [{ ...base }, extra],
});

function categorizeTipoPesca(raw: string | null): "local" | "costeira" | "maritimo" | "outras" {
  const v = String(raw || "").trim().toLowerCase();
  if (v.includes("pesca local") || v === "local") return "local";
  if (v.includes("pesca costeira") || v.includes("costeira")) return "costeira";
  if (v.includes("marítimo") || v.includes("maritimo") || v.includes("turística") || v.includes("turistica")) return "maritimo";
  return "outras";
}

async function computeNavioStats(where: Prisma.NavioWhereInput) {
  const [total, comCliente, semCliente, semMatricula, comPortoRegisto, byIlha, byTipo] = await Promise.all([
    prisma.navio.count({ where }),
    prisma.navio.count({ where: andWithNavioWhere(where, { clienteId: { not: null } }) }),
    prisma.navio.count({ where: andWithNavioWhere(where, { clienteId: null }) }),
    prisma.navio.count({ where: andWithNavioWhere(where, { matricula: "" }) }),
    prisma.navio.count({ where: andWithNavioWhere(where, { portoRegisto: { not: "" } }) }),
    prisma.navio.groupBy({ by: ["ilha"], where, _count: { _all: true } }),
    prisma.navio.groupBy({ by: ["tipoPesca"], where, _count: { _all: true } }),
  ]);

  const ilhaCounts = new Map<string, number>();
  let semIlha = 0;
  for (const group of byIlha) {
    const ilha = String(group.ilha || "").trim();
    const count = group._count._all;
    if (!ilha) {
      semIlha += count;
    } else {
      ilhaCounts.set(ilha, (ilhaCounts.get(ilha) || 0) + count);
    }
  }
  const ilhasAtivas = ilhaCounts.size;
  const topIlhaEntry = Array.from(ilhaCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "pt", { sensitivity: "base" });
  })[0];

  const tipoCounts: Record<"local" | "costeira" | "maritimo" | "outras", number> = {
    local: 0,
    costeira: 0,
    maritimo: 0,
    outras: 0,
  };
  for (const group of byTipo) {
    const cat = categorizeTipoPesca(group.tipoPesca);
    tipoCounts[cat] += group._count._all;
  }

  return {
    total,
    comCliente,
    semCliente,
    semMatricula,
    comPortoRegisto,
    semIlha,
    ilhasAtivas,
    topIlha: topIlhaEntry ? { nome: topIlhaEntry[0], total: topIlhaEntry[1] } : null,
    pescaLocal: tipoCounts.local,
    pescaCosteira: tipoCounts.costeira,
    maritimoTuristica: tipoCounts.maritimo,
    outrasTipologias: tipoCounts.outras,
  };
}

function serializeNavio(n: Record<string, unknown>) {
  return {
    ...n,
    bandeira: (n.bandeira as string | null | undefined) || "Portugal",
    portoRegisto: (n.portoRegisto as string | null | undefined)
      || extrairPortoDeMatricula((n.matricula as string | null | undefined) || "")
      || null,
  };
}

// DELETE em lote: recebe { ids: number[] }
export async function DELETE(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Sem permissão para eliminar navios." }, { status: 403 });

    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Envie um array de IDs para exclusão em lote." }, { status: 400 });
    }

    const existentes = await prisma.navio.findMany({ where: { id: { in: ids } } });
    await prisma.navio.deleteMany({ where: { id: { in: ids } } });
    await Promise.all(
      existentes.map((item) =>
        logAuditoria({
          tabela: "Navio",
          tipoOperacao: "DELETE",
          idRegisto: item.id,
          descricao: `Exclusão em lote do navio ${item.nome}`,
          dadosAntes: item,
        })
      )
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao eliminar navios" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const scopeAll = searchParams.get("scope") === "all";
    const id = searchParams.get("id");

    if (id) {
      const navio = await prisma.navio.findUnique({
        where: { id: Number(id) },
        select: {
          id: true,
          serviceStationId: true,
          nome: true,
          matricula: true,
          portoRegisto: true,
          ilha: true,
          tipoPesca: true,
          tipoNavio: true,
          proprietario: true,
          bandeira: true,
          mmsi: true,
          imo: true,
          callSignal: true,
          lat: true,
          lng: true,
          clienteId: true,
          cliente: true,
        },
      });

      if (!navio) {
        return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
      }

      if (!access.isAdmin && !access.allowedStationIds.includes(Number(navio.serviceStationId || 0))) {
        return NextResponse.json({ error: "Sem permissão para aceder a este navio." }, { status: 403 });
      }

      const jangadas = await prisma.jangada.findMany({ where: { shipId: navio.id } });
      const portoInferido = navio.portoRegisto || extrairPortoDeMatricula(navio.matricula || "") || null;
      return NextResponse.json({ ...navio, portoRegisto: portoInferido, jangadas });
    }

    const where: Prisma.NavioWhereInput = {};
    const scopedStationIds = scopeAll && access.isAdmin ? [] : await resolveScopedStationIdsForApp(access, req);
    if (scopedStationIds.length === 1) {
      where.OR = access.isAdmin
        ? [{ serviceStationId: scopedStationIds[0] }, { serviceStationId: null }]
        : [{ serviceStationId: scopedStationIds[0] }];
    } else if (scopedStationIds.length > 1) {
      where.OR = access.isAdmin
        ? [{ serviceStationId: { in: scopedStationIds } }, { serviceStationId: null }]
        : [{ serviceStationId: { in: scopedStationIds } }];
    }
    const scopeWhere: Prisma.NavioWhereInput = { ...where };
    const nomeParam = searchParams.get("nome"); if (nomeParam) where.nome = { contains: nomeParam, mode: "insensitive" };
    const matriculaParam = searchParams.get("matricula"); if (matriculaParam) where.matricula = { contains: matriculaParam, mode: "insensitive" };
    const ilhaParam = searchParams.get("ilha"); if (ilhaParam) where.ilha = { contains: ilhaParam, mode: "insensitive" };
    const serviceStationIdParam = searchParams.get("serviceStationId");
    if (serviceStationIdParam) {
      const parsedStationId = Number(serviceStationIdParam);
      if (Number.isFinite(parsedStationId) && parsedStationId > 0) {
        delete where.OR;
        where.serviceStationId = parsedStationId;
      }
    }
    const tipoPescaParam = searchParams.get("tipoPesca"); if (tipoPescaParam) where.tipoPesca = { contains: tipoPescaParam, mode: "insensitive" };
    const tipoNavioParam = searchParams.get("tipoNavio"); if (tipoNavioParam) where.tipoNavio = { contains: tipoNavioParam, mode: "insensitive" };
    const clienteIdParam = searchParams.get("clienteId");
    if (clienteIdParam !== null) {
      const normalized = clienteIdParam.trim().toLowerCase();
      if (normalized === "" || normalized === "null" || normalized === "none" || normalized === "sem-cliente") {
        where.clienteId = null;
      } else {
        const parsed = Number(clienteIdParam);
        if (!Number.isFinite(parsed)) {
          return NextResponse.json({ error: 'clienteId inválido' }, { status: 400 });
        }
        where.clienteId = parsed;
      }
    }
    const qParam = searchParams.get("q");
    if (qParam) {
      where.AND = [{
        OR: [
          { nome: { contains: qParam, mode: "insensitive" } },
          { matricula: { contains: qParam, mode: "insensitive" } },
          { cfr: { contains: qParam, mode: "insensitive" } },
          { mmsi: { contains: qParam, mode: "insensitive" } },
          { imo: { contains: qParam, mode: "insensitive" } },
          { callSignal: { contains: qParam, mode: "insensitive" } },
          { portoRegisto: { contains: qParam, mode: "insensitive" } },
        ],
      }];
    }
    const territorioParam = searchParams.get("territorio");
    if (territorioParam) where.territorioGrupo = { equals: territorioParam, mode: "insensitive" };
    const portoParam = searchParams.get("porto");
    if (portoParam) where.portoRegisto = { equals: portoParam, mode: "insensitive" };
    const clienteParam = searchParams.get("cliente");
    if (clienteParam) where.cliente = { is: { nome: { equals: clienteParam, mode: "insensitive" } } };
    const estadoParam = searchParams.get("estado");
    if (estadoParam) where.estadoNavio = { equals: estadoParam, mode: "insensitive" };

    const limiteParam = searchParams.get("limite");
    const paginaParam = searchParams.get("pagina");
    if (limiteParam !== null || paginaParam !== null) {
      const porPagina = Math.min(Math.max(Number(limiteParam) || 100, 1), 500);
      const pagina = Math.max(Number(paginaParam) || 1, 1);
      const [total, items, stats, portosGroups, clientesRows] = await Promise.all([
        prisma.navio.count({ where }),
        findNaviosWithResilientSelect(where, {
          orderBy: [{ nome: "asc" }],
          skip: (pagina - 1) * porPagina,
          take: porPagina,
        }),
        computeNavioStats(scopeWhere),
        prisma.navio.groupBy({ by: ["portoRegisto"], where: scopeWhere, _count: { _all: true } }),
        prisma.cliente.findMany({ where: { navios: { some: scopeWhere } }, select: { nome: true }, orderBy: { nome: "asc" } }),
      ]);
      const portos = Array.from(new Set(
        portosGroups.map((g) => g.portoRegisto).filter((p): p is string => Boolean(p))
      )).sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
      const clientes = Array.from(new Set(
        clientesRows.map((c) => c.nome).filter((n): n is string => Boolean(n))
      )).sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
      return NextResponse.json({
        items: items.map((n) => serializeNavio(n as unknown as Record<string, unknown>)),
        total,
        pagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
        porPagina,
        stats,
        portos,
        clientes,
      });
    }

    const navios = await findNaviosWithResilientSelect(where);

    return NextResponse.json(
      navios.map((n) => serializeNavio(n as unknown as Record<string, unknown>))
    );
  } catch (error) {
    console.error('Error loading navios:', error);
    return buildDatabaseErrorResponse(error, 'Erro ao carregar navios.');
  }
}

// Permite criar navios individualmente ou em massa via POST
export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Sem permissão para criar navios." }, { status: 403 });

    const body = await req.json();
    if (Array.isArray(body)) {
      const rows = [] as Record<string, unknown>[];
      for (const row of body) {
        const payload = sanitizeNavioPayload(row) as Record<string, unknown>;
        rows.push(await applyResolvedIslandToNavioPayload(payload));
      }

      const created = await prisma.navio.createMany({ data: rows as Prisma.NavioCreateManyInput[] });
      return NextResponse.json({ count: created.count });
    }

    const data = await applyResolvedIslandToNavioPayload(sanitizeNavioPayload(body) as Record<string, unknown>);
    if (data.nome) {
      const normalizeTextForComparison = (str: string) => {
        return str
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ');
      };

      const isInvalidOrMissingMatricula = (mat: string | null | undefined) => {
        if (!mat) return true;
        const normalized = mat.trim().toUpperCase();
        return (
          normalized === '' ||
          normalized === 'N/D' ||
          normalized === 'ND' ||
          normalized === 'N.D.' ||
          normalized === 'N/A' ||
          normalized === 'NA' ||
          normalized === 'SEM MATRICULA' ||
          normalized === 'SEM MATRÍCULA'
        );
      };

      const targetNormalizedName = normalizeTextForComparison(String(data.nome));
      const targetMatricula = String(data.matricula ?? '');

      const allNavios = await prisma.navio.findMany({
        select: { id: true, nome: true, matricula: true },
      });

      const conflictingNavio = allNavios.find(n => {
        const existingNormalizedName = normalizeTextForComparison(n.nome);
        if (existingNormalizedName !== targetNormalizedName) return false;

        const matTargetMissing = isInvalidOrMissingMatricula(targetMatricula);
        const matExistingMissing = isInvalidOrMissingMatricula(n.matricula);

        if (matTargetMissing || matExistingMissing) return true;

        const normMatTarget = targetMatricula.trim().toUpperCase().replace(/[-\s]/g, '');
        const normMatExisting = n.matricula.trim().toUpperCase().replace(/[-\s]/g, '');

        return normMatTarget === normMatExisting;
      });

      if (conflictingNavio) {
        return NextResponse.json({
          error: `Já existe um navio com o nome "${conflictingNavio.nome}" com matrícula idêntica ou em falta ("${conflictingNavio.matricula || 'N/D'}").`
        }, { status: 400 });
      }
    }
    if (!data.nome) {
      return NextResponse.json({ error: "Campo obrigatório: nome." }, { status: 400 });
    }

    data.matricula = data.matricula || "";
    data.ilha = data.ilha || "";
    data.tipoPesca = data.tipoPesca || "";

    const activeStationId = resolveActiveServiceStationId(req, access);
    if (activeStationId) {
      data.serviceStationId = activeStationId;
    }

    const mmsiValue = typeof data.mmsi === "string" ? data.mmsi : null;
    const imoValue = typeof data.imo === "string" ? data.imo : null;

    if (!isValidMmsi(mmsiValue)) {
      return NextResponse.json({ error: "MMSI inválido. Deve ter 9 dígitos." }, { status: 400 });
    }

    if (!isValidImo(imoValue)) {
      return NextResponse.json({ error: "IMO inválido. Deve ter 7 dígitos." }, { status: 400 });
    }

    let created;

    try {
      created = await prisma.navio.create({
        data: data as Prisma.NavioUncheckedCreateInput,
        select: {
          id: true,
          nome: true,
          matricula: true,
          ilha: true,
          tipoPesca: true,
          tipoNavio: true,
          comprimentoMetros: true,
          lotacao: true,
          proprietario: true,
          bandeira: true,
          mmsi: true,
          imo: true,
          callSignal: true,
          lat: true,
          lng: true,
          clienteId: true,
        },
      });
    } catch (error) {
      if (!isMissingNavioComprimentoMetrosColumn(error)) throw error;

      const fallbackData = { ...data } as Record<string, unknown>;
      delete fallbackData.comprimentoMetros;

      created = await prisma.navio.create({
        data: fallbackData as Prisma.NavioUncheckedCreateInput,
        select: {
          id: true,
          nome: true,
          matricula: true,
          ilha: true,
          tipoPesca: true,
          tipoNavio: true,
          proprietario: true,
          bandeira: true,
          mmsi: true,
          imo: true,
          callSignal: true,
          lat: true,
          lng: true,
          clienteId: true,
        },
      });

      created = { ...created, comprimentoMetros: null };    }

    await logAuditoria({
      tabela: "Navio",
      tipoOperacao: "CREATE",
      idRegisto: created.id,
      descricao: `Criação do navio ${created.nome}`,
      dadosDepois: created,
    });

    return NextResponse.json(created);
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao criar navio");
  }
}

