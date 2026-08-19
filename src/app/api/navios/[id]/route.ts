import { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { extrairPortoDeMatricula } from '@/utils/portosRegisto';
import { isValidImo, isValidMmsi } from '@/lib/validators';
import { logAuditoria } from '@/lib/auditoria';
import { parseCoordinate } from '@/lib/coordinates';
import { getResolvedClienteIslandForNavio, normalizeManualNavioIsland } from '@/lib/navio-island-resolution';
import { listAuditoriaFiles } from '@/lib/auditorias-storage';
import { normalizeNavioDisplayName } from '@/lib/navio-name-normalization';
import type { Epirb, Prisma } from '@prisma/client';

const JANGADA_EVIDENCIAS_DIR_PREFIX = 'jangadas-evidencias';

const NAVIO_LEGACY_SAFE_SELECT = {
  id: true,
  nome: true,
  matricula: true,
  ilha: true,
  tipoPesca: true,
  tipoNavio: true,
  comprimentoMetros: true,
  anoConstrucao: true,
  potenciaMotorKw: true,
  lotacao: true,
  estadoNavio: true,
  dataEstado: true,
  zonaNavegacao: true,
  proprietario: true,
  portoRegisto: true,
  cfr: true,
  bandeira: true,
  mmsi: true,
  imo: true,
  callSignal: true,
  lat: true,
  lng: true,
  clienteId: true,
  serviceStationId: true,
  ativo: true,
  cliente: true,
  serviceStation: {
    select: {
      id: true,
      codigo: true,
      nome: true,
      regiaoOperacional: true,
      territorioTipo: true,
    },
  },
} as const;

const NAVIO_FALLBACK_SELECT = {
  id: true,
  nome: true,
  matricula: true,
  ilha: true,
  tipoPesca: true,
  tipoNavio: true,
  proprietario: true,
  portoRegisto: true,
  cfr: true,
  anoConstrucao: true,
  potenciaMotorKw: true,
  lotacao: true,
  estadoNavio: true,
  dataEstado: true,
  bandeira: true,
  mmsi: true,
  imo: true,
  callSignal: true,
  lat: true,
  lng: true,
  clienteId: true,
  serviceStationId: true,
  ativo: true,
  cliente: true,
} as const;

function isMissingNavioPirotecnicosColumn(error: unknown) {
  const message = String(error || '');
  return message.includes('Navio.pirotecnicosBordoJson') || message.includes('column `pirotecnicosBordoJson` does not exist');
}

function isMissingDatabaseColumnError(error: unknown) {
  const message = String(error || '').toLowerCase();
  return (
    message.includes('does not exist in the current database')
    || (message.includes('column') && message.includes('does not exist'))
    || message.includes('unknown field')
  );
}

function withLegacyFallbackFields<T extends Record<string, unknown>>(navio: T | null) {
  if (!navio) return null;
  return {
    ...navio,
    comprimentoMetros: Object.prototype.hasOwnProperty.call(navio, 'comprimentoMetros') ? navio.comprimentoMetros : null,
    anoConstrucao: Object.prototype.hasOwnProperty.call(navio, 'anoConstrucao') ? navio.anoConstrucao : null,
    potenciaMotorKw: Object.prototype.hasOwnProperty.call(navio, 'potenciaMotorKw') ? navio.potenciaMotorKw : null,
    lotacao: Object.prototype.hasOwnProperty.call(navio, 'lotacao') ? navio.lotacao : null,
    estadoNavio: Object.prototype.hasOwnProperty.call(navio, 'estadoNavio') ? navio.estadoNavio : null,
    dataEstado: Object.prototype.hasOwnProperty.call(navio, 'dataEstado') ? navio.dataEstado : null,
    zonaNavegacao: Object.prototype.hasOwnProperty.call(navio, 'zonaNavegacao') ? navio.zonaNavegacao : null,
    pirotecnicosBordoJson: Object.prototype.hasOwnProperty.call(navio, 'pirotecnicosBordoJson') ? navio.pirotecnicosBordoJson : '',
    serviceStation: Object.prototype.hasOwnProperty.call(navio, 'serviceStation') ? navio.serviceStation : null,
  };
}

async function findNavioByIdResilient(id: number) {
  try {
    const navio = await prisma.navio.findUnique({
      where: { id },
      select: NAVIO_LEGACY_SAFE_SELECT,
    });

    return withLegacyFallbackFields(navio);
  } catch (error) {
    if (!isMissingDatabaseColumnError(error) && !isMissingNavioPirotecnicosColumn(error)) throw error;

    const navio = await prisma.navio.findUnique({
      where: { id },
      select: NAVIO_FALLBACK_SELECT,
    });

    return withLegacyFallbackFields(navio);
  }
}

function resolveClienteId(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, 'clienteId')) return undefined;
  if (body?.clienteId === null || body?.clienteId === '') return null;

  const parsed = Number(body?.clienteId);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return null;
}

function resolveOptionalPositiveFloat(body: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;

  const rawValue = body?.[key];
  if (rawValue === null || rawValue === '') return null;

  const normalized = String(rawValue).trim().replace(',', '.');
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveOptionalPositiveInt(body: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;

  const rawValue = body?.[key];
  if (rawValue === null || rawValue === '') return null;

  const normalized = String(rawValue).trim().replace(',', '.');
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

const NAVIO_ESTADOS = ['ativo', 'inativo', 'abatido', 'naufragado'] as const;

function resolveEstadoNavio(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, 'estadoNavio')) return undefined;
  const rawValue = body?.estadoNavio;
  if (rawValue === null || rawValue === '') return null;
  const normalized = String(rawValue).trim().toLowerCase();
  return (NAVIO_ESTADOS as readonly string[]).includes(normalized) ? normalized : undefined;
}

function sanitizeNavioPayload(body: Record<string, unknown>) {
  const bandeiraValue = typeof body?.bandeira === 'string' ? body.bandeira.trim() : '';
  const lat = Object.prototype.hasOwnProperty.call(body || {}, 'lat') ? parseCoordinate(body?.lat, 'lat') : undefined;
  const lng = Object.prototype.hasOwnProperty.call(body || {}, 'lng') ? parseCoordinate(body?.lng, 'lng') : undefined;
  const comprimentoMetros = resolveOptionalPositiveFloat(body, 'comprimentoMetros');
  const anoConstrucao = resolveOptionalPositiveInt(body, 'anoConstrucao');
  const potenciaMotorKw = resolveOptionalPositiveFloat(body, 'potenciaMotorKw');
  const lotacao = resolveOptionalPositiveInt(body, 'lotacao');
  const estadoNavio = resolveEstadoNavio(body);
  const dataEstadoRaw = Object.prototype.hasOwnProperty.call(body || {}, 'dataEstado') ? body?.dataEstado : undefined;
  const dataEstado = dataEstadoRaw === undefined
    ? undefined
    : (estadoNavio !== undefined && estadoNavio !== 'naufragado' ? null : (dataEstadoRaw === null || dataEstadoRaw === '' ? null : toIso(dataEstadoRaw)));
  const payload: Record<string, unknown> = {
    nome: typeof body?.nome === 'string' ? normalizeNavioDisplayName(body.nome) : undefined,
    matricula: typeof body?.matricula === 'string' ? body.matricula.trim() : undefined,
    ilha: typeof body?.ilha === 'string' ? body.ilha.trim() : undefined,
    tipoPesca: typeof body?.tipoPesca === 'string' ? body.tipoPesca.trim() : undefined,
    tipoNavio: typeof body?.tipoNavio === 'string' ? body.tipoNavio.trim() : undefined,
    comprimentoMetros,
    anoConstrucao,
    potenciaMotorKw,
    lotacao,
    estadoNavio,
    dataEstado,
    zonaNavegacao: typeof body?.zonaNavegacao === 'string' ? (body.zonaNavegacao.trim() || null) : undefined,
    pirotecnicosBordoJson: typeof body?.pirotecnicosBordoJson === 'string' ? body.pirotecnicosBordoJson.trim() : undefined,
    proprietario: typeof body?.proprietario === 'string' ? body.proprietario.trim() : undefined,
    portoRegisto: typeof body?.portoRegisto === 'string' ? body.portoRegisto.trim() : undefined,
    cfr: typeof body?.cfr === 'string' ? body.cfr.trim() : undefined,
    bandeira: bandeiraValue || 'Portugal',
    mmsi: typeof body?.mmsi === 'string' ? body.mmsi.trim() : undefined,
    imo: typeof body?.imo === 'string' ? body.imo.trim() : undefined,
    callSignal: typeof body?.callSignal === 'string' ? body.callSignal.trim() : undefined,
    lat,
    lng,
    clienteId: resolveClienteId(body),
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  if (!payload.portoRegisto && payload.matricula) {
    const portoInferido = extrairPortoDeMatricula(typeof payload.matricula === 'string' ? payload.matricula : undefined);
    if (portoInferido) payload.portoRegisto = portoInferido;
  }

  return payload;
}

function buildJangadaEvidenceDir(id: number) {
  return `${JANGADA_EVIDENCIAS_DIR_PREFIX}/${id}`;
}

function parseFlexibleDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoCandidate = new Date(raw);
  if (!Number.isNaN(isoCandidate.getTime())) return isoCandidate;

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const candidate = new Date(year, month, day);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return null;
}

function toIso(value: unknown) {
  const date = parseFlexibleDate(value);
  return date ? date.toISOString() : null;
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getDaysRemaining(value: unknown) {
  const date = parseFlexibleDate(value);
  if (!date) return null;
  const diff = date.getTime() - getStartOfToday().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDeadlineSeverity(daysRemaining: number | null): 'critical' | 'warning' | 'ok' | 'info' {
  if (daysRemaining === null) return 'info';
  if (daysRemaining < 0) return 'critical';
  if (daysRemaining <= 30) return 'critical';
  if (daysRemaining <= 90) return 'warning';
  return 'ok';
}

function getDeadlineStatus(daysRemaining: number | null) {
  if (daysRemaining === null) return 'sem-data';
  if (daysRemaining < 0) return 'expirado';
  if (daysRemaining === 0) return 'vence-hoje';
  if (daysRemaining <= 30) return 'a-expirar';
  if (daysRemaining <= 90) return 'planear';
  return 'ok';
}

function normalizeText(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function parsePirotecnicos(raw: unknown) {
  if (!raw) return [] as Array<{ item?: string; quantity?: string; validade?: string; notes?: string }>;

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sortTimeline<T extends { date: string | null; severity?: string }>(items: T[]) {
  return items.sort((a, b) => {
    const aTime = parseFlexibleDate(a.date)?.getTime() ?? 0;
    const bTime = parseFlexibleDate(b.date)?.getTime() ?? 0;
    return bTime - aTime;
  });
}

function sortDocuments<T extends { expiryDate?: string | null; issueDate?: string | null }>(items: T[]) {
  return items.sort((a, b) => {
    const aExpiry = parseFlexibleDate(a.expiryDate)?.getTime();
    const bExpiry = parseFlexibleDate(b.expiryDate)?.getTime();
    if (aExpiry && bExpiry && aExpiry !== bExpiry) return aExpiry - bExpiry;

    const aIssue = parseFlexibleDate(a.issueDate)?.getTime() ?? 0;
    const bIssue = parseFlexibleDate(b.issueDate)?.getTime() ?? 0;
    return bIssue - aIssue;
  });
}

function rankDeadline(daysRemaining: number | null) {
  if (daysRemaining === null) return 99_999;
  if (daysRemaining < 0) return Math.abs(daysRemaining);
  return daysRemaining + 10_000;
}

async function applyResolvedIslandToNavioPayload(
  payload: Record<string, unknown>,
  options?: { effectiveClienteId?: number | null; fallbackIlha?: string | null }
) {
  const effectiveClienteId = options?.effectiveClienteId !== undefined
    ? options.effectiveClienteId
    : (typeof payload.clienteId === 'number' ? payload.clienteId : undefined);

  if (typeof effectiveClienteId === 'number' && Number.isFinite(effectiveClienteId) && effectiveClienteId > 0) {
    const { cliente, island } = await getResolvedClienteIslandForNavio(effectiveClienteId);
    if (!cliente) {
      throw new Error('Cliente associado não encontrado.');
    }

    payload.clienteId = effectiveClienteId;
    const manualIsland = normalizeManualNavioIsland(payload.ilha);
    payload.ilha = manualIsland ?? island ?? options?.fallbackIlha ?? payload.ilha ?? '';
    return payload;
  }

  const normalizedManualIsland = normalizeManualNavioIsland(payload.ilha);
  if (normalizedManualIsland !== null) {
    payload.ilha = normalizedManualIsland;
  }

  return payload;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = parseInt(rawId);
    if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const navio = await findNavioByIdResilient(id);

    if (!navio) {
      return NextResponse.json({ error: 'Navio não encontrado' }, { status: 404 });
    }

    const [jangadas, coletes, inspecoes] = await Promise.all([
      prisma.jangada.findMany({
        where: { shipId: id },
        include: {
          artigos: true,
          certificadoAtivo: {
            include: {
              validities: {
                orderBy: { validade: 'asc' },
              },
            },
          },
          certificadosExtraidos: {
            orderBy: { createdAt: 'desc' },
            include: {
              validities: {
                orderBy: { validade: 'asc' },
              },
            },
          },
        },
      }),
      prisma.colete.findMany({
        where: { shipId: id },
        include: {
          certificado: true,
          verificacoes: {
            orderBy: { dataVerificacao: 'desc' },
            take: 5,
          },
        },
      }),
      prisma.inspecao.findMany({
        where: {
          OR: [
            { navioId: id },
            { navioNome: { equals: navio.nome, mode: 'insensitive' } }
          ]
        },
        orderBy: { dataInspecao: 'desc' }
      }),
    ]);

    let epirbs: Epirb[] = [];
    try {
      const epirbDelegate = prisma.epirb;
      if (epirbDelegate?.findMany) {
        epirbs = await epirbDelegate.findMany({
          where: { shipId: id },
          orderBy: { updatedAt: 'desc' },
        });
      }
    } catch (error) {
      const message = String(error || '').toLowerCase();
      if (!message.includes('epirb')) {
        throw error;
      }
    }

    let fatosImersao: Prisma.FatoImersaoGetPayload<{
      include: { certificado: true; verificacoes: true };
    }>[] = [];
    try {
      const fatoDelegate = prisma.fatoImersao;
      if (fatoDelegate?.findMany) {
        fatosImersao = await fatoDelegate.findMany({
          where: { shipId: id },
          include: {
            certificado: true,
            verificacoes: {
              orderBy: { dataVerificacao: 'desc' },
              take: 3,
            },
          },
          orderBy: { updatedAt: 'desc' },
        });
      }
    } catch (error) {
      const message = String(error || '').toLowerCase();
      if (!message.includes('fato') && !message.includes('imersao')) {
        throw error;
      }
    }

    let extintores: Prisma.ExtintorGetPayload<Record<string, never>>[] = [];
    try {
      const extintorDelegate = prisma.extintor;
      if (extintorDelegate?.findMany) {
        extintores = await extintorDelegate.findMany({
          where: { shipId: id },
          orderBy: { updatedAt: 'desc' },
        });
      }
    } catch (error) {
      const message = String(error || '').toLowerCase();
      if (!message.includes('extintor')) {
        throw error;
      }
    }

    const jangadaIds = jangadas.map((jangada) => jangada.id);
    const ordensServico = (jangadaIds.length > 0 || id)
      ? await prisma.ordemServico.findMany({
          where: {
            OR: [
              { shipId: id },
              ...(jangadaIds.length > 0
                ? [
                    { jangadaId: { in: jangadaIds } },
                    { ordemJangadas: { some: { jangadaId: { in: jangadaIds } } } },
                  ]
                : []),
            ],
          },
          include: {
            tecnico: { select: { nome: true } },
            cliente: { select: { nome: true } },
          },
          distinct: ['id'],
          orderBy: [
            { dataConclusao: 'desc' },
            { dataPlaneadaInicio: 'desc' },
            { dataAbertura: 'desc' },
          ],
        })
      : [];

    const evidenciasPorJangada: Array<[number, Array<{ name: string; originalName: string; size: number; uploadedAt: string; url: string }>]> = await Promise.all(
      jangadas.map(async (jangada) => {
        try {
          const files = await listAuditoriaFiles(buildJangadaEvidenceDir(jangada.id));
          return [
            jangada.id,
            files
              .slice()
              .sort((a, b) => String(b.uploadedAt || b.modified).localeCompare(String(a.uploadedAt || a.modified)))
              .map((file) => ({
                name: file.name,
                originalName: file.originalName || file.name,
                size: file.size,
                uploadedAt: String(file.uploadedAt || file.modified),
                url: file.url || `/api/jangadas/${jangada.id}/evidencias?name=${encodeURIComponent(file.name)}`,
              })),
          ];
        } catch {
          return [jangada.id, []];
        }
      })
    );

    const evidenciasMap = new Map<number, Array<{ name: string; originalName: string; size: number; uploadedAt: string; url: string }>>(evidenciasPorJangada);

    const deadlineCandidates = [] as Array<{
      id: string;
      title: string;
      entityType: 'navio' | 'jangada' | 'colete' | 'epirb';
      entityLabel: string;
      date: string;
      daysRemaining: number | null;
      severity: 'critical' | 'warning' | 'ok' | 'info';
      status: string;
      href: string;
      source: string;
    }>;

    const addDeadlineCandidate = (input: {
      id: string;
      title: string;
      entityType: 'navio' | 'jangada' | 'colete' | 'epirb';
      entityLabel: string;
      date: unknown;
      href: string;
      source: string;
    }) => {
      const iso = toIso(input.date);
      if (!iso) return;
      const daysRemaining = getDaysRemaining(input.date);
      deadlineCandidates.push({
        ...input,
        date: iso,
        daysRemaining,
        severity: getDeadlineSeverity(daysRemaining),
        status: getDeadlineStatus(daysRemaining),
      });
    };

    const navioData = navio as unknown as Record<string, unknown>;

    addDeadlineCandidate({
      id: `navio-hru-${id}`,
      title: 'Validade HRU do navio',
      entityType: 'navio',
      entityLabel: navio.nome,
      date: navioData.hruValidade,
      href: `/navios/${id}`,
      source: 'Ficha do navio',
    });
    addDeadlineCandidate({
      id: `navio-radar-${id}`,
      title: 'Validade refletor radar do navio',
      entityType: 'navio',
      entityLabel: navio.nome,
      date: navioData.radarReflectorValidade,
      href: `/navios/${id}`,
      source: 'Ficha do navio',
    });

    parsePirotecnicos(navioData.pirotecnicosBordoJson).forEach((item, index) => {
      addDeadlineCandidate({
        id: `navio-piro-${id}-${index}`,
        title: normalizeText(item?.item) ? `Validade pirotécnico · ${String(item.item).trim()}` : 'Validade pirotécnico',
        entityType: 'navio',
        entityLabel: navio.nome,
        date: item?.validade,
        href: `/navios/${id}`,
        source: 'Pirotécnicos a bordo',
      });
    });

    jangadas.forEach((jangada) => {
      const jangadaHref = `/jangadas/${jangada.id}`;
      addDeadlineCandidate({
        id: `jangada-next-${jangada.id}`,
        title: 'Próxima inspeção da jangada',
        entityType: 'jangada',
        entityLabel: jangada.serial,
        date: jangada.dataProxInspecao,
        href: jangadaHref,
        source: 'Ficha da jangada',
      });
      addDeadlineCandidate({
        id: `jangada-hru-${jangada.id}`,
        title: 'Validade HRU da jangada',
        entityType: 'jangada',
        entityLabel: jangada.serial,
        date: jangada.hruValidade,
        href: jangadaHref,
        source: 'Ficha da jangada',
      });
      addDeadlineCandidate({
        id: `jangada-radar-${jangada.id}`,
        title: 'Validade refletor radar da jangada',
        entityType: 'jangada',
        entityLabel: jangada.serial,
        date: jangada.radarReflectorValidade,
        href: jangadaHref,
        source: 'Ficha da jangada',
      });
      addDeadlineCandidate({
        id: `jangada-cilindro-${jangada.id}`,
        title: 'Próximo teste do cilindro',
        entityType: 'jangada',
        entityLabel: jangada.serial,
        date: jangada.cylinderDataProxTeste,
        href: jangadaHref,
        source: 'Ficha da jangada',
      });

      jangada.certificadoAtivo?.validities?.forEach((validity, validityIndex) => {
        addDeadlineCandidate({
          id: `jangada-cert-val-${jangada.id}-${validity.id || validityIndex}`,
          title: normalizeText(validity.item) ? `Validade certificado · ${validity.item}` : 'Validade do certificado da jangada',
          entityType: 'jangada',
          entityLabel: jangada.serial,
          date: validity.validade,
          href: jangadaHref,
          source: 'Certificado ativo da jangada',
        });
      });
    });

    coletes.forEach((colete) => {
      const coleteHref = `/equipamentos/${colete.id}`;
      addDeadlineCandidate({
        id: `colete-next-${colete.id}`,
        title: 'Próxima inspeção do colete',
        entityType: 'colete',
        entityLabel: colete.serial,
        date: colete.dataProxInspecao,
        href: coleteHref,
        source: 'Ficha do colete',
      });
      addDeadlineCandidate({
        id: `colete-cert-${colete.id}`,
        title: 'Validade do certificado do colete',
        entityType: 'colete',
        entityLabel: colete.serial,
        date: colete.certificado?.dataValidade,
        href: coleteHref,
        source: 'Certificado do colete',
      });
    });

    epirbs.forEach((epirb) => {
      const epirbHref = `/epirbs/${epirb.id}`;
      addDeadlineCandidate({
        id: `epirb-next-${epirb.id}`,
        title: 'Próxima inspeção do EPIRB',
        entityType: 'epirb',
        entityLabel: epirb.serial,
        date: epirb.dataProxInspecao,
        href: epirbHref,
        source: 'Ficha do EPIRB',
      });
      addDeadlineCandidate({
        id: `epirb-battery-${epirb.id}`,
        title: 'Validade da bateria do EPIRB',
        entityType: 'epirb',
        entityLabel: epirb.serial,
        date: epirb.dataValidadeBateria,
        href: epirbHref,
        source: 'Ficha do EPIRB',
      });
    });

    const timelineItems = [] as Array<{
      id: string;
      kind: string;
      title: string;
      description: string;
      entityType: 'navio' | 'jangada' | 'colete' | 'epirb' | 'ordem-servico' | 'inspecao';
      entityLabel: string;
      date: string | null;
      status: string;
      severity: 'critical' | 'warning' | 'ok' | 'info';
      href?: string;
      source: string;
    }>;

    inspecoes.forEach((inspecao) => {
      timelineItems.push({
        id: `inspecao-${inspecao.id}`,
        kind: 'inspecao',
        title: `Inspeção ${inspecao.certificadoNumero}`,
        description: normalizeText(inspecao.jangadaSerial)
          ? `Jangada ${inspecao.jangadaSerial} · ${inspecao.status || 'Concluída'}`
          : `Navio ${inspecao.navioNome} · ${inspecao.status || 'Concluída'}`,
        entityType: 'inspecao',
        entityLabel: inspecao.jangadaSerial || inspecao.navioNome,
        date: toIso(inspecao.dataInspecao || inspecao.createdAt),
        status: inspecao.status || 'Concluída',
        severity: 'ok',
        href: inspecao.jangadaId ? `/jangadas/${inspecao.jangadaId}` : `/navios/${id}`,
        source: 'Histórico de inspeções',
      });
    });

    ordensServico.forEach((ordem) => {
      const dataReferencia = ordem.dataConclusao || ordem.dataPlaneadaInicio || ordem.dataPrevista || ordem.dataAbertura;
      timelineItems.push({
        id: `os-${ordem.id}`,
        kind: 'ordem-servico',
        title: `OS ${ordem.numeroOrdem}`,
        description: [
          normalizeText(ordem.tipo),
          normalizeText(ordem.status),
          normalizeText(ordem.tecnico?.nome || ordem.tecnicoResponsavel),
        ].filter(Boolean).join(' · ') || 'Ordem de serviço associada ao navio',
        entityType: 'ordem-servico',
        entityLabel: ordem.numeroOrdem,
        date: toIso(dataReferencia),
        status: ordem.status || 'pendente',
        severity: ['cancelada', 'bloqueada', 'atrasada'].includes(String(ordem.status || '').toLowerCase()) ? 'critical' : ['pendente', 'planeada'].includes(String(ordem.status || '').toLowerCase()) ? 'warning' : 'ok',
        href: `/ordens-servico/${ordem.id}`,
        source: 'Ordens de serviço',
      });
    });

    jangadas.forEach((jangada) => {
      const jangadaHref = `/jangadas/${jangada.id}`;
      const certificadoAtivo = jangada.certificadoAtivo;

      if (certificadoAtivo) {
        timelineItems.push({
          id: `jangada-cert-${jangada.id}-${certificadoAtivo.id}`,
          kind: 'certificate',
          title: `Certificado ativo da jangada ${jangada.serial}`,
          description: certificadoAtivo.certificadoNumero || certificadoAtivo.fileName,
          entityType: 'jangada',
          entityLabel: jangada.serial,
          date: toIso(certificadoAtivo.dataInspecao || certificadoAtivo.createdAt),
          status: certificadoAtivo.aplicadoComoAtivo ? 'ativo' : 'extraído',
          severity: 'ok',
          href: jangadaHref,
          source: 'Certificados extraídos',
        });
      }

      (evidenciasMap.get(jangada.id) || []).forEach((file, index) => {
        timelineItems.push({
          id: `jangada-evidencia-${jangada.id}-${index}-${file.name}`,
          kind: 'evidence',
          title: `Evidência carregada · ${jangada.serial}`,
          description: file.originalName,
          entityType: 'jangada',
          entityLabel: jangada.serial,
          date: toIso(file.uploadedAt),
          status: 'ficheiro',
          severity: 'info',
          href: file.url,
          source: 'Evidências da jangada',
        });
      });
    });

    coletes.forEach((colete) => {
      const coleteHref = `/equipamentos/${colete.id}`;
      colete.verificacoes.forEach((verificacao) => {
        timelineItems.push({
          id: `colete-verificacao-${verificacao.id}`,
          kind: 'verification',
          title: `Verificação do colete ${colete.serial}`,
          description: normalizeText(verificacao.inspectorNome)
            ? `Inspetor: ${verificacao.inspectorNome}`
            : 'Registo de verificação manual',
          entityType: 'colete',
          entityLabel: colete.serial,
          date: toIso(verificacao.dataVerificacao),
          status: 'verificado',
          severity: 'ok',
          href: coleteHref,
          source: 'Verificações do colete',
        });
      });

      if (colete.certificado) {
        timelineItems.push({
          id: `colete-certificado-${colete.certificado.id}`,
          kind: 'certificate',
          title: `Certificado do colete ${colete.serial}`,
          description: colete.certificado.numeroCertificado,
          entityType: 'colete',
          entityLabel: colete.serial,
          date: toIso(colete.certificado.dataCertificado),
          status: colete.certificado.resultado || 'emitido',
          severity: colete.certificado.resultado === 'Reprovado' ? 'critical' : 'ok',
          href: coleteHref,
          source: 'Certificado do colete',
        });
      }
    });

    epirbs.forEach((epirb) => {
      timelineItems.push({
        id: `epirb-${epirb.id}`,
        kind: 'equipment',
        title: `Atualização EPIRB ${epirb.serial}`,
        description: [normalizeText(epirb.marca), normalizeText(epirb.modelo), normalizeText(epirb.estado)].filter(Boolean).join(' · ') || 'Ficha do EPIRB atualizada',
        entityType: 'epirb',
        entityLabel: epirb.serial,
        date: toIso(epirb.updatedAt || epirb.createdAt),
        status: epirb.estado || 'Ativo',
        severity: 'info',
        href: `/epirbs/${epirb.id}`,
        source: 'Ficha do EPIRB',
      });
    });

    deadlineCandidates.forEach((deadline) => {
      timelineItems.push({
        id: `deadline-${deadline.id}`,
        kind: 'deadline',
        title: deadline.title,
        description: `${deadline.entityLabel} · ${deadline.source}`,
        entityType: deadline.entityType,
        entityLabel: deadline.entityLabel,
        date: deadline.date,
        status: deadline.status,
        severity: deadline.severity,
        href: deadline.href,
        source: deadline.source,
      });
    });

    const documents = [] as Array<{
      id: string;
      title: string;
      documentType: string;
      entityType: 'jangada' | 'colete';
      entityLabel: string;
      reference?: string | null;
      issueDate?: string | null;
      expiryDate?: string | null;
      status: string;
      severity: 'critical' | 'warning' | 'ok' | 'info';
      href: string;
      source: string;
      url?: string;
      size?: number;
    }>;

    jangadas.forEach((jangada) => {
      const jangadaHref = `/jangadas/${jangada.id}`;

      if (jangada.certificadoAtivo) {
        const primaryValidity = jangada.certificadoAtivo.validities
          ?.map((item) => ({ value: item.validade, daysRemaining: getDaysRemaining(item.validade) }))
          .filter((item) => item.daysRemaining !== null)
          .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))[0];

        const certificateDays = primaryValidity?.daysRemaining ?? getDaysRemaining(jangada.certificadoAtivo.dataProxInspecao);
        documents.push({
          id: `doc-jangada-cert-ativo-${jangada.id}`,
          title: `Certificado ativo · ${jangada.serial}`,
          documentType: 'Certificado de jangada',
          entityType: 'jangada',
          entityLabel: jangada.serial,
          reference: jangada.certificadoAtivo.certificadoNumero || jangada.certificadoAtivo.fileName,
          issueDate: toIso(jangada.certificadoAtivo.dataInspecao || jangada.certificadoAtivo.createdAt),
          expiryDate: primaryValidity?.value ? toIso(primaryValidity.value) : toIso(jangada.certificadoAtivo.dataProxInspecao),
          status: jangada.certificadoAtivo.aplicadoComoAtivo ? 'ativo' : 'extraído',
          severity: getDeadlineSeverity(certificateDays),
          href: jangadaHref,
          source: 'Certificados extraídos',
        });
      }

      (evidenciasMap.get(jangada.id) || []).forEach((file, index) => {
        documents.push({
          id: `doc-jangada-evidencia-${jangada.id}-${index}-${file.name}`,
          title: file.originalName,
          documentType: 'Evidência fotográfica',
          entityType: 'jangada',
          entityLabel: jangada.serial,
          issueDate: toIso(file.uploadedAt),
          status: 'disponível',
          severity: 'info',
          href: file.url,
          url: file.url,
          size: file.size,
          source: 'Evidências da jangada',
        });
      });
    });

    coletes.forEach((colete) => {
      if (!colete.certificado) return;
      const daysRemaining = getDaysRemaining(colete.certificado.dataValidade);
      documents.push({
        id: `doc-colete-cert-${colete.id}`,
        title: `Certificado do colete ${colete.serial}`,
        documentType: 'Certificado de colete',
        entityType: 'colete',
        entityLabel: colete.serial,
        reference: colete.certificado.numeroCertificado,
        issueDate: toIso(colete.certificado.dataCertificado),
        expiryDate: toIso(colete.certificado.dataValidade),
        status: colete.certificado.resultado || 'emitido',
        severity: getDeadlineSeverity(daysRemaining),
        href: `/equipamentos/${colete.id}`,
        source: 'Certificado do colete',
      });
    });

    const expiredCount = deadlineCandidates.filter((item) => (item.daysRemaining ?? 9999) < 0).length;
    const expiring30Count = deadlineCandidates.filter((item) => item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 30).length;
    const expiring90Count = deadlineCandidates.filter((item) => item.daysRemaining !== null && item.daysRemaining > 30 && item.daysRemaining <= 90).length;

    const nextDeadline = deadlineCandidates
      .slice()
      .sort((a, b) => rankDeadline(a.daysRemaining) - rankDeadline(b.daysRemaining))[0] || null;

    const serviceOrderOpenCount = ordensServico.filter((ordem) => !['concluida', 'cancelada', 'concluída'].includes(String(ordem.status || '').toLowerCase())).length;
    const lastInspection = inspecoes[0] || null;
    const sortedTimeline = sortTimeline(dedupeById(timelineItems)).slice(0, 40);
    const sortedDocuments = sortDocuments(dedupeById(documents));
    const evidenceCount = sortedDocuments.filter((doc) => doc.documentType === 'Evidência fotográfica').length;
    const certificateCount = sortedDocuments.filter((doc) => doc.documentType !== 'Evidência fotográfica').length;
    const healthStatus = expiredCount > 0 ? 'critical' : expiring30Count > 0 || serviceOrderOpenCount > 0 ? 'warning' : 'ok';
    const healthLabel = healthStatus === 'critical'
      ? 'Ação imediata necessária'
      : healthStatus === 'warning'
        ? 'Requer planeamento'
        : 'Operação estável';

    const dossier = {
      summary: {
        totalJangadas: jangadas.length,
        totalColetes: coletes.length,
        totalEpirbs: epirbs.length,
        totalAssets: jangadas.length + coletes.length + epirbs.length,
        expiredCount,
        expiring30Count,
        expiring90Count,
        documentCount: sortedDocuments.length,
        evidenceCount,
        certificateCount,
        serviceOrderOpenCount,
        healthStatus,
        healthLabel,
        lastInspectionAt: toIso(lastInspection?.dataInspecao || lastInspection?.createdAt),
        lastActivityAt: sortedTimeline[0]?.date || null,
        nextDeadline: nextDeadline ? {
          id: nextDeadline.id,
          title: nextDeadline.title,
          entityType: nextDeadline.entityType,
          entityLabel: nextDeadline.entityLabel,
          date: nextDeadline.date,
          daysRemaining: nextDeadline.daysRemaining,
          severity: nextDeadline.severity,
          status: nextDeadline.status,
          href: nextDeadline.href,
          source: nextDeadline.source,
        } : null,
      },
      timeline: sortedTimeline,
      documents: sortedDocuments,
      deadlines: deadlineCandidates
        .slice()
        .sort((a, b) => rankDeadline(a.daysRemaining) - rankDeadline(b.daysRemaining))
        .slice(0, 25),
    };

    return NextResponse.json({
      ...navio,
      bandeira: navio.bandeira || 'Portugal',
      jangadas,
      coletes,
      epirbs,
      fatosImersao,
      extintores,
      inspecoes,
      ordensServico,
      dossier,
    });
  } catch (error) {
    console.error("Erro ao buscar dados do navio:", error);
    return NextResponse.json({ error: 'Erro ao buscar dados do navio' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const data = sanitizeNavioPayload(body) as Record<string, unknown>;

    const mmsiValue = typeof data.mmsi === 'string' ? data.mmsi : null;
    const imoValue = typeof data.imo === 'string' ? data.imo : null;

    if (!isValidMmsi(mmsiValue)) {
      return NextResponse.json({ error: 'MMSI inválido. Deve ter 9 dígitos.' }, { status: 400 });
    }

    if (!isValidImo(imoValue)) {
      return NextResponse.json({ error: 'IMO inválido. Deve ter 7 dígitos.' }, { status: 400 });
    }

    if (data.anoConstrucao !== undefined && data.anoConstrucao !== null) {
      const ano = Number(data.anoConstrucao);
      if (!Number.isInteger(ano) || ano < 1900 || ano > 2100) {
        return NextResponse.json({ error: 'Ano de construção inválido. Deve ser entre 1900 e 2100.' }, { status: 400 });
      }
    }



    if (!data.nome && Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Sem dados para atualizar.' }, { status: 400 });
    }

    const antes = await findNavioByIdResilient(id);
    const effectiveClienteId = Object.prototype.hasOwnProperty.call(data, 'clienteId')
      ? (typeof data.clienteId === 'number' ? data.clienteId : null)
      : (antes?.clienteId ?? null);

    await applyResolvedIslandToNavioPayload(data, {
      effectiveClienteId,
      fallbackIlha: normalizeManualNavioIsland(antes?.ilha),
    });

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
      const targetMatricula = String(data.matricula ?? antes?.matricula ?? '');

      const allNavios = await prisma.navio.findMany({
        select: { id: true, nome: true, matricula: true },
      });

      const conflictingNavio = allNavios.find(n => {
        if (n.id === id) return false;

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

    let updated;
    try {
      updated = await prisma.navio.update({
        where: { id },
        data: data as Prisma.NavioUncheckedUpdateInput,
        select: NAVIO_LEGACY_SAFE_SELECT,
      });
    } catch (error) {
      if (!isMissingDatabaseColumnError(error)) throw error;

      const fallbackData = { ...data } as Record<string, unknown>;
      if (isMissingNavioPirotecnicosColumn(error) || !Object.prototype.hasOwnProperty.call(data, 'pirotecnicosBordoJson')) {
        delete fallbackData.pirotecnicosBordoJson;
      }
      delete fallbackData.comprimentoMetros;
      delete fallbackData.estadoNavio;
      delete fallbackData.dataEstado;

      updated = await prisma.navio.update({
        where: { id },
        data: fallbackData as Prisma.NavioUncheckedUpdateInput,
        select: NAVIO_FALLBACK_SELECT,
      });

      updated = withLegacyFallbackFields(updated);
    }

    if (!updated) {
      return NextResponse.json({ error: 'Navio não encontrado' }, { status: 404 });
    }

    await logAuditoria({
      tabela: 'Navio',
      tipoOperacao: 'UPDATE',
      idRegisto: updated.id,
      descricao: `Atualização do navio ${updated.nome}`,
      dadosAntes: antes,
      dadosDepois: updated,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar navio' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const antes = await findNavioByIdResilient(id);
    await prisma.navio.delete({ where: { id } });

    if (antes) {
      await logAuditoria({
        tabela: 'Navio',
        tipoOperacao: 'DELETE',
        idRegisto: id,
        descricao: `Exclusão do navio ${antes.nome}`,
        dadosAntes: antes,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao eliminar navio' }, { status: 500 });
  }
}
