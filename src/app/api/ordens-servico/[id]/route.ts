import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { getIvaRate } from "@/lib/iva";
import { syncNextInspectionAgenda, parseFlexibleDate } from "@/lib/agenda-sync";
import type { Prisma } from "@prisma/client";
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  mapOrderStatusToWorkflowStatus,
  normalizeOrdemPrioridade,
  normalizeOrdemStatus,
  normalizeOrdemTipo,
  normalizeWorkflowStatus,
  parseOrdemServicoMeta,
  replaceOrdemServicoJangadas,
  resolveWorkflowStatus,
  syncPedidoAssistenciaFromOrdem,
  toOrdemServicoMetaJson,
  generateNumeroOrdem,
  type OrdemWorkflowStatus,
} from "@/lib/ordens-servico";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { getAccessContext } from "@/lib/access-control";
import { canonicalOrderNumber, syncOrderNumber, OrderNumberConflictError } from '@/lib/order-number';
import { hasQuoteFinancialChange, normalizeQuoteLines, normalizeQuoteStatus, quoteNumber, QuoteInputError, roundQuoteMoney } from "@/lib/ordem-quote-input";

function stationScope(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  if (access.isAdmin) return {};
  if (access.allowedStationIds.length) return { serviceStationId: { in: access.allowedStationIds } };
  return access.stationId ? { serviceStationId: access.stationId } : { serviceStationId: { in: [] } };
}

function quoteErrorResponse(error: unknown) {
   if (error instanceof OrderNumberConflictError || (error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'Conflito no numero de obra.' }, { status: 409 });
   if ((error as { code?: string })?.code === 'P2034') return NextResponse.json({ error: 'A OT foi alterada. Recarregue e tente novamente.' }, { status: 409 });
   if (error instanceof QuoteInputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
    return NextResponse.json({ error: "Esta OT foi alterada por outro utilizador. Recarregue a pagina e tente novamente." }, { status: 409 });
  }
  return null;
}

function prepareQuoteInput(body: Record<string, unknown>, before: Prisma.OrdemServicoGetPayload<object>) {
  const previousMeta = parseOrdemServicoMeta(before.metadados);
  if ("metadados" in body && (!body.metadados || typeof body.metadados !== "object" || Array.isArray(body.metadados))) {
    throw new QuoteInputError("Metadados deve ser um objeto.");
  }
  const incoming = (body.metadados || {}) as Record<string, unknown>;
  for (const field of ["faturaId", "faturaNumero", "faturaEmitidaEm", "faturaEmitidaPor", "pagamentoStatus"]) {
    if (field in incoming && incoming[field] !== previousMeta[field as keyof typeof previousMeta]) {
      throw new QuoteInputError("As referencias de faturacao so podem ser alteradas no modulo de faturacao.");
    }
  }
  const meta = { ...previousMeta, ...incoming };
  const changed = hasQuoteFinancialChange(body, before, previousMeta);
  // An unchanged metadata snapshot must not rewrite legacy lines or invoice values.
  const hasLines = ("linhas" in body || "linhas" in incoming) && changed;
  if (hasLines) {
    const lines = normalizeQuoteLines("linhas" in body ? body.linhas : incoming.linhas, previousMeta.linhas);
    if ("linhas" in body && "linhas" in incoming && JSON.stringify(lines) !== JSON.stringify(normalizeQuoteLines(incoming.linhas, previousMeta.linhas))) {
      throw new QuoteInputError("Linhas divergentes no pedido.");
    }
    meta.linhas = lines;
  }
  const valorPecas = hasLines
    ? roundQuoteMoney(meta.linhas!.reduce((sum, line) => sum + (line.total || 0), 0))
    : "valorPecas" in body ? roundQuoteMoney(quoteNumber(body.valorPecas)) : before.valorPecas;
  const valorMaoObra = "valorMaoObra" in body ? roundQuoteMoney(quoteNumber(body.valorMaoObra)) : before.valorMaoObra;
  const valorDesconto = "valorDesconto" in body ? roundQuoteMoney(quoteNumber(body.valorDesconto)) : before.valorDesconto;
  for (const field of ["isIsentoIva", "isPesca"]) {
    if (field in body && typeof body[field] !== "boolean") throw new QuoteInputError("Indicador fiscal invalido.");
  }
  const isPesca = "isPesca" in body ? body.isPesca as boolean : before.isPesca;
  const isIsentoIva = "isIsentoIva" in body ? body.isIsentoIva as boolean : before.isIsentoIva;
  const codigoIsencaoIva = "codigoIsencaoIva" in body ? String(body.codigoIsencaoIva ?? "").trim() || null : before.codigoIsencaoIva;
  const subtotal = roundQuoteMoney(Math.max(0, valorPecas + valorMaoObra - valorDesconto));
  const iva = isIsentoIva ? 0 : roundQuoteMoney(subtotal * getIvaRate());
  const valorTotal = changed ? roundQuoteMoney(subtotal + iva) : before.valorTotal;
  if (changed) meta.totais = { subtotal, iva, totalComIva: valorTotal };
  else meta.totais = previousMeta.totais;
  let updatedAt: Date | undefined;
  if ("updatedAt" in body) {
    updatedAt = new Date(String(body.updatedAt));
    if (!Number.isFinite(updatedAt.getTime())) throw new QuoteInputError("updatedAt invalido.");
  }
  const orcamentoStatus = "orcamentoStatus" in body ? normalizeQuoteStatus(body.orcamentoStatus) : undefined;
  return { meta, updatedAt, data: { valorPecas, valorMaoObra, valorDesconto, valorTotal, isPesca, isIsentoIva, codigoIsencaoIva: isIsentoIva ? codigoIsencaoIva : null, orcamentoStatus } };
}

const ORDEM_INCLUDE = {
  jangada: {
    select: {
      id: true,
      serial: true,
      brand: true,
      model: true,
      owner: true,
      shipId: true,
      shipNameManual: true,
      numeroObra: true,
      dataInspecao: true,
      dataProxInspecao: true,
    },
  },
  ordemJangadas: {
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    include: {
      jangada: {
        select: {
          id: true,
          serial: true,
          brand: true,
          model: true,
          owner: true,
          shipId: true,
          shipNameManual: true,
          numeroObra: true,
          dataInspecao: true,
          dataProxInspecao: true,
        },
      },
    },
  },
  cliente: {
    select: {
      id: true,
      nome: true,
      ilha: true,
      numeroCliente: true,
    },
  },
  tecnico: {
    select: {
      id: true,
      nome: true,
      email: true,
      ativo: true,
    },
  },
  inspecao: {
    select: {
      id: true,
      certificadoNumero: true,
      dataInspecao: true,
      dataProxInspecao: true,
      status: true,
      testeWP: true,
      testeNAP: true,
      testeFS: true,
      testeGI: true,
      testeDL: true,
      testeWPUnidadePressao: true,
      testeWPInstrumento: true,
      testeWPHoraInicio: true,
      testeWPHoraFim: true,
      testeWPTemperaturaInicial: true,
      testeWPTemperaturaFinal: true,
      testeWPCamaraSuperiorInicio: true,
      testeWPCamaraSuperiorFim: true,
      testeWPCamaraInferiorInicio: true,
      testeWPCamaraInferiorFim: true,
      oficinaTemperatura: true,
      oficinaHumidade: true,
      orcamento: true,
    },
  },
  serviceStationQueues: {
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      status: true,
      dataChegada: true,
      dataPrevistaEntrega: true,
    },
  },
  serviceStation: {
    select: {
      id: true,
      codigo: true,
      nome: true,
    },
  },
  checklistItems: {
    orderBy: [{ id: "asc" }],
    select: {
      id: true,
      phase: true,
      category: true,
      label: true,
      done: true,
      barcode: true,
      scannedAt: true,
      photoUrl: true,
      notes: true,
      isDefect: true,
      originalDiagramRef: true,
      updatedAt: true,
      updatedBy: true,
      updatedById: true,
      updatedByTecnico: {
        select: { nome: true },
      },
    },
  },
  logs: {
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      at: true,
      type: true,
      message: true,
      user: true,
      tecnico: {
        select: { nome: true },
      },
    },
  },
} satisfies Prisma.OrdemServicoInclude;

type OrdemServicoRow = Prisma.OrdemServicoGetPayload<{ include: typeof ORDEM_INCLUDE }>;

type JangadaBrief = {
  id: number;
  serial: string;
  brand: string | null;
  model: string | null;
  owner: string | null;
  shipNameManual: string | null;
};

function parseIdFromRequest(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const rawId = segments[segments.length - 1];
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function findFaturaAtiva(ordemServicoId: number) {
  const link = await prisma.faturaOrdemServico.findFirst({
    where: { ordemServicoId, fatura: { cancelada: false } },
    select: { fatura: { select: { id: true, numeroFatura: true } } },
  });
  return link?.fatura ?? null;
}

function parseOptionalDate(value: unknown) {
  const parsed = parseFlexibleDate(String(value || "").trim());
  return parsed || null;
}

function parseOptionalPositiveInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

async function resolveTecnicoPayload(tecnicoIdValue: unknown, tecnicoResponsavelValue: unknown) {
  const tecnicoId = parseOptionalPositiveInt(tecnicoIdValue);
  if (!tecnicoId) {
    return {
      tecnicoId: null as number | null,
      tecnicoResponsavel: String(tecnicoResponsavelValue || "").trim() || null,
    };
  }

  const tecnico = await prisma.tecnico.findUnique({
    where: { id: tecnicoId },
    select: { id: true, nome: true, ativo: true },
  });

  if (!tecnico || !tecnico.ativo) {
    return null;
  }

  return {
    tecnicoId: tecnico.id,
    tecnicoResponsavel: tecnico.nome,
  };
}

type ChecklistPersistRow = {
  id?: string;
  phase?: string;
  category?: string;
  label?: string;
  done?: boolean;
  barcode?: string;
  scannedAt?: string;
  photoUrl?: string;
  notes?: string;
  isDefect?: boolean;
  originalDiagramRef?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedById?: number;
};

function normalizeChecklistForPersistence(meta: Record<string, unknown>) {
  const rows = Array.isArray(meta.checklistItems) ? meta.checklistItems : [];
  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as ChecklistPersistRow;
      const label = String(row.label || "").trim();
      if (!label) return null;
      const phaseRaw = String(row.phase || "pre").trim().toLowerCase();
      const phase = ["pre", "intervencao", "validacao"].includes(phaseRaw) ? phaseRaw : "pre";
      const parsedUpdatedAt = row.updatedAt ? new Date(String(row.updatedAt)) : null;
      const parsedScannedAt = row.scannedAt ? new Date(String(row.scannedAt)) : null;
      return {
        phase,
        category: row.category ? String(row.category).trim() || null : null,
        label,
        done: Boolean(row.done),
        barcode: row.barcode ? String(row.barcode).trim() || null : null,
        scannedAt: parsedScannedAt && !Number.isNaN(parsedScannedAt.getTime()) ? parsedScannedAt : null,
        photoUrl: row.photoUrl ? String(row.photoUrl).trim() || null : null,
        notes: row.notes ? String(row.notes).trim() || null : null,
        isDefect: Boolean(row.isDefect),
        originalDiagramRef: row.originalDiagramRef ? String(row.originalDiagramRef).trim() || null : null,
        updatedAt: parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime()) ? parsedUpdatedAt : new Date(),
        updatedBy: String(row.updatedBy || "").trim() || null,
        updatedById: Number.isFinite(Number(row.updatedById)) ? Number(row.updatedById) : null,
      };
    })
    .filter(Boolean);
}

function validateClosureRequirements(meta: Record<string, unknown>) {
  const reasons: string[] = [];

  const checklistItems = Array.isArray(meta.checklistItems) ? meta.checklistItems : [];
  const hasChecklist = checklistItems.length > 0;
  const checklistDone = hasChecklist && checklistItems.every((item) => Boolean((item as Record<string, unknown>)?.done));
  if (!hasChecklist) reasons.push("Checklist técnica inexistente.");
  if (hasChecklist && !checklistDone) reasons.push("Checklist técnica por concluir.");

  const timeEntries = Array.isArray(meta.timeEntries) ? meta.timeEntries : [];
  if (timeEntries.length === 0) {
    reasons.push("Sem registos de tempo na OT.");
  } else {
    const hasActiveTime = timeEntries.some((entry) => {
      const row = entry as Record<string, unknown>;
      return !row?.endedAt;
    });
    if (hasActiveTime) reasons.push("Existe registo de tempo em curso (não terminado).");
  }

  const materials = Array.isArray(meta.materials) ? meta.materials : [];
  const materialsPending = materials.some((entry) => {
    const row = entry as Record<string, unknown>;
    const previsto = Number(row?.quantidadePrevista || 0);
    const consumido = Boolean(row?.consumido);
    return previsto > 0 && !consumido;
  });
  if (materialsPending) reasons.push("Existem materiais com consumo pendente.");

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

async function buildLatestInspectionContext(jangadas: JangadaBrief[]) {
  const normalizedJangadas = Array.isArray(jangadas)
    ? jangadas.filter((jangada) => Number.isFinite(Number(jangada?.id)) && Number(jangada.id) > 0)
    : [];

  if (normalizedJangadas.length === 0) {
    return [];
  }

  const jangadaIds = normalizedJangadas.map((jangada) => Number(jangada.id));
  const inspections = await prisma.inspecao.findMany({
    where: {
      jangadaId: { in: jangadaIds },
    },
    orderBy: [{ dataInspecao: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      jangadaId: true,
      certificadoNumero: true,
      dataInspecao: true,
      dataProxInspecao: true,
      status: true,
      testeWP: true,
      testeNAP: true,
      testeFS: true,
      testeGI: true,
      testeDL: true,
      testeWPUnidadePressao: true,
      testeWPCamaraSuperiorInicio: true,
      testeWPCamaraSuperiorFim: true,
      testeWPCamaraInferiorInicio: true,
      testeWPCamaraInferiorFim: true,
      oficinaTemperatura: true,
      oficinaHumidade: true,
      artigos: {
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          name: true,
          quantidade: true,
          referencia: true,
          codigoFabricante: true,
          validade: true,
          createdAt: true,
        },
      },
    },
  });

  const latestInspectionByJangada = new Map<number, (typeof inspections)[number]>();
  for (const inspection of inspections) {
    const jangadaId = Number(inspection.jangadaId);
    if (!Number.isFinite(jangadaId) || jangadaId <= 0 || latestInspectionByJangada.has(jangadaId)) {
      continue;
    }
    latestInspectionByJangada.set(jangadaId, inspection);
  }

  return normalizedJangadas.map((jangada) => {
    const inspection = latestInspectionByJangada.get(Number(jangada.id)) || null;
    const hasReprovado = (value: string | null) => {
      const v = String(value || "").trim().toUpperCase();
      return v === "REPROVOU" || v === "REPROVADO";
    };
    const testesReprovados = inspection ? [
      hasReprovado(inspection.testeWP) ? "WP" : null,
      hasReprovado(inspection.testeNAP) ? "NAP" : null,
      hasReprovado(inspection.testeFS) ? "FS" : null,
      hasReprovado(inspection.testeGI) ? "GI" : null,
      hasReprovado(inspection.testeDL) ? "DL" : null,
    ].filter(Boolean) : [];

    return {
      jangadaId: Number(jangada.id),
      serial: jangada.serial || "",
      brand: jangada.brand || null,
      model: jangada.model || null,
      owner: jangada.owner || null,
      shipNameManual: jangada.shipNameManual || null,
      testesReprovados,
      ultimaInspecao: inspection
        ? {
            id: inspection.id,
            certificadoNumero: inspection.certificadoNumero,
            dataInspecao: inspection.dataInspecao,
            dataProxInspecao: inspection.dataProxInspecao,
            status: inspection.status,
            testes: {
              WP: inspection.testeWP || null,
              NAP: inspection.testeNAP || null,
              FS: inspection.testeFS || null,
              GI: inspection.testeGI || null,
              DL: inspection.testeDL || null,
            },
            testeWPDetalhes: {
              unidadePressao: inspection.testeWPUnidadePressao || null,
              camaraSuperiorInicio: inspection.testeWPCamaraSuperiorInicio || null,
              camaraSuperiorFim: inspection.testeWPCamaraSuperiorFim || null,
              camaraInferiorInicio: inspection.testeWPCamaraInferiorInicio || null,
              camaraInferiorFim: inspection.testeWPCamaraInferiorFim || null,
            },
            condicoesOficina: {
              temperatura: inspection.oficinaTemperatura || null,
              humidade: inspection.oficinaHumidade || null,
            },
            artigosSubstituidos: Array.isArray(inspection.artigos)
              ? inspection.artigos.map((item) => ({
                  id: item.id,
                  name: item.name,
                  quantidade: item.quantidade,
                  referencia: item.referencia,
                  codigoFabricante: item.codigoFabricante,
                  validade: item.validade?.toISOString?.() || null,
                  createdAt: item.createdAt?.toISOString?.() || null,
                }))
              : [],
          }
        : null,
    };
  });
}

function serializeOrder(row: OrdemServicoRow) {
  const meta = parseOrdemServicoMeta(row.metadados);
  const queue = Array.isArray(row.serviceStationQueues) ? row.serviceStationQueues[0] : null;
  const jangadas = (() => {
    const linked = Array.isArray(row.ordemJangadas)
      ? row.ordemJangadas.map((link) => link?.jangada).filter(Boolean)
      : [];
    const combined = [...linked, row.jangada].filter(Boolean);
    const seen = new Set<number>();
    return combined.filter((jangada): jangada is NonNullable<typeof jangada> => {
      const id = Number(jangada?.id);
      if (!Number.isFinite(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  })();
  const primaryJangada = jangadas[0] || row.jangada || null;
  const checklistItems = Array.isArray(row.checklistItems)
    ? row.checklistItems.map((item) => ({
        id: String(item.id),
        phase: item.phase,
        category: item.category || null,
        label: item.label,
        done: Boolean(item.done),
        barcode: item.barcode || null,
        scannedAt: item.scannedAt?.toISOString?.() || null,
        photoUrl: item.photoUrl || null,
        notes: item.notes || null,
        isDefect: Boolean(item.isDefect),
        originalDiagramRef: item.originalDiagramRef || null,
        updatedAt: item.updatedAt?.toISOString?.() || null,
        updatedBy: item.updatedBy || item.updatedByTecnico?.nome || null,
        updatedById: item.updatedById ?? null,
      }))
    : [];
  const logs = Array.isArray(row.logs)
    ? row.logs.map((entry) => ({
        id: String(entry.id),
        at: entry.at?.toISOString?.() || null,
        type: entry.type || "EVENT",
        message: entry.message || "",
        user: entry.user || entry.tecnico?.nome || "sistema",
      }))
    : [];

  if (checklistItems.length > 0) {
    (meta as Record<string, unknown>).checklistItems = checklistItems;
  }
  if (logs.length > 0) {
    (meta as Record<string, unknown>).logs = logs;
  }
  const workflowStatus = resolveWorkflowStatus({ meta, orderStatus: row.status });

  return {
    id: row.id,
    numeroOrdem: row.numeroOrdem,
    grupoNumeroOrdem: meta.grupoNumeroOrdem || null,
    tipo: row.tipo,
    prioridade: row.prioridade,
    status: row.status,
    workflowStatus,
    descricao: row.descricao || "",
    tecnicoId: row.tecnicoId ?? row.tecnico?.id ?? null,
    tecnicoResponsavel: row.tecnicoResponsavel || "",
    tecnico: row.tecnico ? {
      id: row.tecnico.id,
      nome: row.tecnico.nome,
      email: row.tecnico.email,
      ativo: row.tecnico.ativo,
    } : null,
    slaHoras: row.slaHoras ?? null,
    dataPlaneadaInicio: row.dataPlaneadaInicio?.toISOString() || null,
    dataPlaneadaFim: row.dataPlaneadaFim?.toISOString() || null,
    dataAbertura: row.dataAbertura?.toISOString() || null,
    dataPrevista: row.dataPrevista?.toISOString() || null,
    dataInicio: row.dataInicio?.toISOString() || null,
    dataConclusao: row.dataConclusao?.toISOString() || null,
    durationMinutes: row.durationMinutes || 0,
    orcamentoStatus: row.orcamentoStatus,
    isPesca: row.isPesca,
    isIsentoIva: row.isIsentoIva,
    codigoIsencaoIva: row.codigoIsencaoIva,
    valorPecas: row.valorPecas,
    valorMaoObra: row.valorMaoObra,
    valorDesconto: row.valorDesconto,
    valorTotal: row.valorTotal,
    metadados: meta,
    jangadaId: primaryJangada?.id || row.jangadaId,
    shipId: primaryJangada?.shipId ?? row.shipId ?? meta.shipId ?? null,
    clienteId: row.clienteId || null,
    inspecaoId: row.inspecaoId || null,
    jangada: primaryJangada,
    jangadas,
    cliente: row.cliente,
    inspecao: row.inspecao,
    serviceStation: queue ? {
      id: row.serviceStation?.id ?? null,
      codigo: row.serviceStation?.codigo ?? null,
      nome: row.serviceStation?.nome ?? null,
      queueId: queue.id,
      status: queue.status,
      dataChegada: queue.dataChegada?.toISOString() || null,
      dataPrevistaEntrega: queue.dataPrevistaEntrega?.toISOString() || null,
    } : (row.serviceStation ? {
      id: row.serviceStation.id,
      codigo: row.serviceStation.codigo,
      nome: row.serviceStation.nome,
      queueId: null,
      status: null,
      dataChegada: null,
      dataPrevistaEntrega: null,
    } : null),
    createdAt: row.createdAt?.toISOString() || null,
    updatedAt: row.updatedAt?.toISOString() || null,
  };
}

async function fetchOrder(id: number, scope: ReturnType<typeof stationScope> = {}) {
  const row = await prisma.ordemServico.findUnique({
    where: { ...scope, id },
    include: ORDEM_INCLUDE,
  });

  if (!row) return null;

  const serialized = serializeOrder(row);
  serialized.numeroOrdem = await canonicalOrderNumber(prisma, row);
  if (serialized.grupoNumeroOrdem === row.numeroOrdem) serialized.grupoNumeroOrdem = serialized.numeroOrdem;
  if (serialized.metadados.grupoNumeroOrdem === row.numeroOrdem) serialized.metadados.grupoNumeroOrdem = serialized.numeroOrdem;
  const jangadaInspectionContext = await buildLatestInspectionContext(serialized.jangadas || []);
  return {
    ...serialized,
    jangadaInspectionContext,
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    const id = parseIdFromRequest(req);
    if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const row = await fetchOrder(id, stationScope(access));
    if (!row) return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });

    return NextResponse.json(row);
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao obter ordem de serviço.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    const id = parseIdFromRequest(req);
    if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const before = await prisma.ordemServico.findUnique({ where: { id, ...stationScope(access) } });
    if (!before) return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });

    const body = (await req.json().catch(() => { throw new QuoteInputError("JSON invalido."); })) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new QuoteInputError("Pedido invalido.");
    if (!access.isAdmin && (hasQuoteFinancialChange(body, before, parseOrdemServicoMeta(before.metadados)) || ("orcamentoStatus" in body && normalizeQuoteStatus(body.orcamentoStatus) !== before.orcamentoStatus))) {
      return NextResponse.json({ error: "Sem permissao para alterar o orcamento." }, { status: 403 });
    }
    const quote = prepareQuoteInput(body, before);

    const faturaAtiva = await findFaturaAtiva(id);
    if (faturaAtiva && (hasQuoteFinancialChange(body, before, parseOrdemServicoMeta(before.metadados), true) || (quote.data.orcamentoStatus && quote.data.orcamentoStatus !== before.orcamentoStatus))) {
      return NextResponse.json(
        { error: `A OT já foi faturada (${faturaAtiva.numeroFatura}). Não é permitido alterar valores, materiais, linhas ou isenção de IVA após a faturação.` },
        { status: 400 }
      );
    }

    // A análise e edição do orçamento (incluindo valores/materiais) é feita no
    // módulo de Orçamentos (/orcamentos); apenas a faturação ativa bloqueia alterações.

    const nextStatus = Object.prototype.hasOwnProperty.call(body, "status") ? normalizeOrdemStatus(body.status) : before.status;
    if ("status" in body && nextStatus === "pendente" && String(body.status).trim().toLowerCase() !== "pendente") throw new QuoteInputError("Estado da ordem invalido.");
    if ("workflowStatus" in body && !normalizeWorkflowStatus(body.workflowStatus)) throw new QuoteInputError("Etapa operacional invalida.");
    const hasTecnicoPayload = Object.prototype.hasOwnProperty.call(body, "tecnicoId") || Object.prototype.hasOwnProperty.call(body, "tecnicoResponsavel");
    const resolvedTecnicoPayload = hasTecnicoPayload
      ? await resolveTecnicoPayload(body.tecnicoId, body.tecnicoResponsavel)
      : {
          tecnicoId: before.tecnicoId,
          tecnicoResponsavel: before.tecnicoResponsavel,
        };
    if (hasTecnicoPayload && !resolvedTecnicoPayload) {
      return NextResponse.json({ error: "Técnico inválido ou inativo." }, { status: 400 });
    }
    const nextTecnicoId = resolvedTecnicoPayload?.tecnicoId ?? null;
    const nextTecnico = resolvedTecnicoPayload?.tecnicoResponsavel ?? null;

    let nextMeta = quote.meta;
    const nextWorkflowStatus = resolveWorkflowStatus({
      meta: {
        ...nextMeta,
        workflowStatus: Object.prototype.hasOwnProperty.call(body, "workflowStatus") ? (body.workflowStatus as OrdemWorkflowStatus | undefined) : nextStatus !== before.status ? mapOrderStatusToWorkflowStatus(nextStatus) ?? undefined : nextMeta.workflowStatus,
      },
      orderStatus: nextStatus,
    }) || mapOrderStatusToWorkflowStatus(nextStatus) || "orcamento_em_preparacao";
    nextMeta = appendWorkflowTransition(nextMeta, nextWorkflowStatus, {
      origin: "order",
      message: `Workflow da OT atualizado para ${nextWorkflowStatus}.`,
      user: nextTecnico || "sistema",
    });

    if (nextStatus !== before.status) {
      nextMeta = appendOrdemServicoLog(nextMeta, {
        type: "STATUS",
        message: `Estado alterado de ${before.status} para ${nextStatus}.`,
        user: "sistema",
      });
    }

    if ((nextTecnico || "") !== (before.tecnicoResponsavel || "")) {
      nextMeta = appendOrdemServicoLog(nextMeta, {
        type: "ASSIGN",
        message: `Técnico responsável atualizado para ${nextTecnico || "(sem técnico)"}.`,
        user: "sistema",
      });
    }

    let finalNumeroOrdem = before.numeroOrdem;
    let convertedNumberLog = null;
    if (Object.prototype.hasOwnProperty.call(body, "numeroOrdem") && String(body.numeroOrdem || "").trim()) {
      finalNumeroOrdem = String(body.numeroOrdem || "").trim();
    } else if (!before.inspecaoId && before.numeroOrdem.startsWith("OS-") && nextStatus === "em_progresso") {
      finalNumeroOrdem = await generateNumeroOrdem(before.dataPrevista || before.dataPlaneadaInicio || new Date());
      convertedNumberLog = `Número de ordem convertido de ${before.numeroOrdem} para ${finalNumeroOrdem} devido ao início da inspeção.`;
    }

    if (convertedNumberLog) {
      nextMeta = appendOrdemServicoLog(nextMeta, {
        type: "STATUS",
        message: convertedNumberLog,
        user: "sistema",
      });
    }

    if (nextStatus === "concluida" && before.status !== "concluida") {
      const closureValidation = validateClosureRequirements(nextMeta as Record<string, unknown>);
      if (!closureValidation.ok) {
        console.warn("Pré-requisitos de fecho não cumpridos (ignorado):", closureValidation.reasons);
      }
    }

        const checklistRows = normalizeChecklistForPersistence(nextMeta as Record<string, unknown>);
    const checklistProvided = Array.isArray((nextMeta as Record<string, unknown>).checklistItems);
    const nextJangadaIds = Array.isArray(body.jangadaIds) ? body.jangadaIds.map((value) => Number(value)) : null;

    const logRowsToCreate: Array<{ type: string; message: string; user: string }> = [];
    if (quote.data.orcamentoStatus && quote.data.orcamentoStatus !== before.orcamentoStatus) {
      logRowsToCreate.push({ type: "ORCAMENTO", message: `Orcamento: ${before.orcamentoStatus} -> ${quote.data.orcamentoStatus}.`, user: access.email });
    }
    if (nextStatus !== before.status) {
      logRowsToCreate.push({
        type: "STATUS",
        message: `Estado alterado de ${before.status} para ${nextStatus}.`,
        user: "sistema",
      });
    }
    if ((nextTecnico || "") !== (before.tecnicoResponsavel || "")) {
      logRowsToCreate.push({
        type: "ASSIGN",
        message: `Técnico responsável atualizado para ${nextTecnico || "(sem técnico)"}.`,
        user: "sistema",
      });
    }
    if (convertedNumberLog) {
      logRowsToCreate.push({
        type: "STATUS",
        message: convertedNumberLog,
        user: "sistema",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let resolvedShipId = before.shipId;
      let resolvedPrimaryJangadaId = before.jangadaId;
      let resolvedServiceStationId = before.serviceStationId;
      if (nextJangadaIds) {
        if (nextJangadaIds.length === 0) {
          throw new Error("A OT tem de manter pelo menos uma jangada associada.");
        }
        const linkContext = await replaceOrdemServicoJangadas(tx as typeof prisma, id, nextJangadaIds);
        resolvedShipId = linkContext.shipId;
        resolvedPrimaryJangadaId = linkContext.primaryJangadaId || before.jangadaId;
        resolvedServiceStationId = linkContext.serviceStationId ?? before.serviceStationId;
        if (!access.isAdmin && !(access.allowedStationIds.length ? access.allowedStationIds : access.stationId ? [access.stationId] : []).includes(resolvedServiceStationId as number)) throw new QuoteInputError('Sem acesso a estacao de destino.');
        if (before.inspecaoId && resolvedPrimaryJangadaId !== before.jangadaId) throw new QuoteInputError('A jangada da inspecao ligada nao pode ser substituida.');
      }

      const canonical = await canonicalOrderNumber(tx, { ...before, jangadaId: resolvedPrimaryJangadaId, shipId: resolvedShipId, serviceStationId: resolvedServiceStationId });
      if ('numeroOrdem' in body && finalNumeroOrdem !== canonical && before.inspecaoId) throw new OrderNumberConflictError('A referencia deve coincidir com a inspecao ligada.');
      if (before.inspecaoId) finalNumeroOrdem = canonical;
      if (nextMeta.grupoNumeroOrdem === before.numeroOrdem) nextMeta.grupoNumeroOrdem = finalNumeroOrdem;

      const order = await tx.ordemServico.update({
        where: { id, ...stationScope(access), updatedAt: quote.updatedAt ?? before.updatedAt },
        data: {
          numeroOrdem: finalNumeroOrdem,
          tipo: Object.prototype.hasOwnProperty.call(body, "tipo") ? normalizeOrdemTipo(body.tipo) : undefined,
          prioridade: Object.prototype.hasOwnProperty.call(body, "prioridade") ? normalizeOrdemPrioridade(body.prioridade) : undefined,
          status: nextStatus,
          descricao: Object.prototype.hasOwnProperty.call(body, "descricao") ? String(body.descricao || "").trim() || null : undefined,
          tecnicoId: hasTecnicoPayload ? nextTecnicoId : undefined,
          tecnicoResponsavel: hasTecnicoPayload ? nextTecnico : undefined,
          slaHoras: Object.prototype.hasOwnProperty.call(body, "slaHoras") ? (Number.isFinite(Number(body.slaHoras)) && Number(body.slaHoras) > 0 ? Math.floor(Number(body.slaHoras)) : null) : undefined,
          dataPlaneadaInicio: Object.prototype.hasOwnProperty.call(body, "dataPlaneadaInicio") ? parseOptionalDate(body.dataPlaneadaInicio) : undefined,
          dataPlaneadaFim: Object.prototype.hasOwnProperty.call(body, "dataPlaneadaFim") ? parseOptionalDate(body.dataPlaneadaFim) : undefined,
          dataPrevista: Object.prototype.hasOwnProperty.call(body, "dataPrevista") ? parseOptionalDate(body.dataPrevista) : undefined,
          dataInicio: Object.prototype.hasOwnProperty.call(body, "dataInicio") ? parseOptionalDate(body.dataInicio) : (nextStatus === "em_progresso" && !before.dataInicio ? new Date() : undefined),
          dataConclusao: Object.prototype.hasOwnProperty.call(body, "dataConclusao") ? parseOptionalDate(body.dataConclusao) : (nextStatus === "concluida" ? before.dataConclusao || new Date() : undefined),
          durationMinutes: Object.prototype.hasOwnProperty.call(body, "durationMinutes") ? Math.max(0, Number(body.durationMinutes || 0)) : undefined,
          serviceStationId: nextJangadaIds ? resolvedServiceStationId : undefined,
          jangadaId: nextJangadaIds ? resolvedPrimaryJangadaId : undefined,
                    shipId: nextJangadaIds ? resolvedShipId : undefined,
          ...quote.data,
          metadados: toOrdemServicoMetaJson(nextMeta),
        },
      });

      if (checklistProvided) {
        await tx.ordemServicoChecklistItem.deleteMany({ where: { ordemServicoId: id } });
        if (checklistRows.length > 0) {
          await tx.ordemServicoChecklistItem.createMany({
            data: checklistRows.map((item) => ({
              ordemServicoId: id,
              phase: item!.phase,
              category: item!.category,
              label: item!.label,
              done: item!.done,
              barcode: item!.barcode,
              scannedAt: item!.scannedAt,
              photoUrl: item!.photoUrl,
              notes: item!.notes,
              isDefect: item!.isDefect,
              originalDiagramRef: item!.originalDiagramRef,
              updatedAt: item!.updatedAt,
              updatedBy: item!.updatedBy,
              updatedById: item!.updatedById,
            })),
          });
        }
      }

      if (logRowsToCreate.length > 0) {
        await tx.ordemServicoLog.createMany({
          data: logRowsToCreate.map((entry) => ({
            ordemServicoId: id,
            type: entry.type,
            message: entry.message,
            user: entry.user,
          })),
        });
      }

      return order;
    });

    if (nextStatus === "concluida" && before.status !== "concluida") {
      try {
        const orderForAgenda = await fetchOrder(id);
        const jangadas = Array.isArray(orderForAgenda?.jangadas) && orderForAgenda.jangadas.length > 0
          ? orderForAgenda.jangadas
          : (orderForAgenda?.jangada ? [orderForAgenda.jangada] : []);

        for (const jangada of jangadas) {
          if (!jangada?.id) continue;
          await syncNextInspectionAgenda({
            jangadaId: jangada.id,
            tecnico: updated.tecnicoResponsavel || undefined,
          });
        }
      } catch (agendaError) {
        console.error("Falha ao sincronizar próxima inspeção após conclusão da OT:", agendaError);
      }
    }

    await syncPedidoAssistenciaFromOrdem(id);

    await logAuditoria({
      tabela: "OrdemServico",
      tipoOperacao: "UPDATE",
      idRegisto: id,
      descricao: `Atualização da OT ${updated.numeroOrdem} (status=${updated.status})`,
      dadosAntes: before,
      dadosDepois: updated,
    });

    const row = await fetchOrder(id);
    return NextResponse.json(row);
  } catch (error) {
    const response = quoteErrorResponse(error);
    if (response) return response;
    console.error("[PUT /api/ordens-servico]", error);
    return buildDatabaseErrorResponse(error, "Erro ao atualizar ordem de serviço.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = parseIdFromRequest(req);
    if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Sem permissão para eliminar ordens de serviço." }, { status: 403 });

    const before = await prisma.ordemServico.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });

    await prisma.serviceStationQueue.updateMany({
      where: { ordemServicoId: id },
      data: { ordemServicoId: null },
    });

    await prisma.ordemServico.delete({ where: { id } });

    await logAuditoria({
      tabela: "OrdemServico",
      tipoOperacao: "DELETE",
      idRegisto: id,
      descricao: `Remoção da OT ${before.numeroOrdem}`,
      dadosAntes: before,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao apagar ordem de serviço.");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    const id = parseIdFromRequest(req);
    if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const before = await prisma.ordemServico.findUnique({ where: { id, ...stationScope(access) } });
    if (!before) return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });

    const body = (await req.json().catch(() => { throw new QuoteInputError("JSON invalido."); })) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new QuoteInputError("Pedido invalido.");
    if (!access.isAdmin) return NextResponse.json({ error: "Sem permissao para alterar o orcamento." }, { status: 403 });
    const quote = prepareQuoteInput(body, before);

    const faturaAtiva = await findFaturaAtiva(id);
    if (faturaAtiva && (hasQuoteFinancialChange(body, before, parseOrdemServicoMeta(before.metadados), true) || (quote.data.orcamentoStatus && quote.data.orcamentoStatus !== before.orcamentoStatus))) {
      return NextResponse.json(
        { error: `A OT já foi faturada (${faturaAtiva.numeroFatura}). Não é permitido alterar valores, materiais, linhas ou isenção de IVA após a faturação.` },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.ordemServico.update({
        where: { id, ...stationScope(access), updatedAt: quote.updatedAt ?? before.updatedAt },
        data: { ...quote.data, metadados: toOrdemServicoMetaJson(quote.meta) },
      });
      if (quote.data.orcamentoStatus && quote.data.orcamentoStatus !== before.orcamentoStatus) {
        await tx.ordemServicoLog.create({ data: {
          ordemServicoId: id, type: "ORCAMENTO",
          message: `Orcamento: ${before.orcamentoStatus} -> ${quote.data.orcamentoStatus}.`,
          user: access.email,
        } });
      }
      const number = await syncOrderNumber(tx, id);
      return { ...order, numeroOrdem: number.numeroOrdem };
    });

    return NextResponse.json({ ...updated, metadados: parseOrdemServicoMeta(updated.metadados) });
  } catch (error) {
    const response = quoteErrorResponse(error);
    if (response) return response;
    return buildDatabaseErrorResponse(error, "Erro ao atualizar ordem de serviço (PATCH).");
  }
}
