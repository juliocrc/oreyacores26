import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { readAuditoriaJson, writeAuditoriaJson } from "@/lib/auditorias-storage";
import { getApplicableServiceBulletinsForRaft } from "@/modules/rafts/serviceBulletins";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { readInspectionChecklistValues, writeInspectionChecklistValues } from "@/lib/inspection-checklist-store";
import { notifyJangadaEnviada, tryNotifySms } from "@/lib/notify-jangada-sms";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { syncRaftArticlesWithPackType } from "@/lib/checklist-sync";
import { clearActiveAgendaForRaft, syncNextInspectionAgenda } from "@/lib/agenda-sync";
import { clearEntregaAgendaEvent, syncEntregaAgendaEvent } from "@/lib/agenda-entrega";
import { syncAgendaToGoogleCalendar } from "@/lib/google-calendar";
import { isKnownPackTypeName, resolveMandatoryPackItemsForRaftAsync } from "@/lib/custom-pack-types";
import { deleteJangadaById } from "@/lib/jangada-delete";
import { canonicalizeDateFields } from "@/lib/date-display";
import { computeInspectionDigest, shortDigest } from "@/lib/integrity-stamp";
import { generateInspectionCertificateNumber } from "@/app/inspecoes/actions";
import { getInspectionSnapshot, saveInspectionSnapshot } from "@/lib/inspection-snapshots";
import {
  canonicalizeCylinderSistema,
  canonicalizeRaftBrand,
  canonicalizeRaftModel,
  normalizeLooseText,
  normalizeUpperText,
} from "@/lib/text-normalization";

type ServiceBulletinStatus = "APLICADO" | "EM_VERIFICACAO" | "POR_APLICAR";
type ServiceBulletinsAppliedMap = Record<string, ServiceBulletinStatus>;
type ServiceBulletinsAppliedStore = Record<string, ServiceBulletinsAppliedMap>;

const SERVICE_BULLETIN_STATUS_VALUES: ServiceBulletinStatus[] = [
  "APLICADO",
  "EM_VERIFICACAO",
  "POR_APLICAR",
];
type JangadaObservacoesStore = Record<string, string>;

type CertificadoComValididades = {
  sourceYear?: number | null;
  fileName?: string;
  certificadoNumero?: string | null;
  validities?: Array<{ item?: string; validade?: string }>;
};

const SERVICE_BULLETINS_APPLIED_STORE_FILE = "_meta/jangadas-service-bulletins-applied.json";
const JANGADAS_OBSERVACOES_STORE_FILE = "_meta/jangadas-observacoes.json";
const HRU_REFERENCE_ARTIGO = "20701002";

const NAVIO_WITH_CLIENTE_SELECT = {
  id: true,
  nome: true,
  matricula: true,
  tipoPesca: true,
  tipoNavio: true,
  ilha: true,
  portoRegisto: true,
  proprietario: true,
  bandeira: true,
  mmsi: true,
  imo: true,
  callSignal: true,
  hruReferencia: true,
  hruValidade: true,
  radarReflector: true,
  radarReflectorValidade: true,
  cliente: {
    select: {
      id: true,
      nome: true,
      ilha: true,
      telefone: true,
      telmovel: true,
    },
  },
} as const;

function normalize(value: unknown) {
  return normalizeLooseText(value ?? "");
}

function isLegacyAlmarModel(value: unknown) {
  return normalizeUpperText(value) === "ALMAR";
}

function normalizeBrandName(value: unknown, model?: unknown) {
  if (isLegacyAlmarModel(model)) return "ALMAR";
  return canonicalizeRaftBrand(value ?? "");
}

function normalizeRaftModel(value: unknown, brand?: unknown, packType?: unknown) {
  if (isLegacyAlmarModel(value)) return "STD";
  return canonicalizeRaftModel(value ?? "", brand, packType);
}

function isServiceBulletinStatus(value: unknown): value is ServiceBulletinStatus {
  return typeof value === "string" && (SERVICE_BULLETIN_STATUS_VALUES as string[]).includes(value);
}

function normalizeServiceBulletinsApplied(raw: unknown): ServiceBulletinsAppliedMap {
  if (!raw) return {};

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) return {};
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.entries(parsed as Record<string, unknown>).reduce<ServiceBulletinsAppliedMap>((acc, [key, value]) => {
    if (!key) return acc;
    if (isServiceBulletinStatus(value)) {
      acc[key] = value;
    } else if (value === true || value === "true" || value === 1 || value === "1") {
      acc[key] = "APLICADO";
    } else {
      acc[key] = "POR_APLICAR";
    }
    return acc;
  }, {});
}

async function readServiceBulletinsAppliedStore() {
  return readAuditoriaJson<ServiceBulletinsAppliedStore>(SERVICE_BULLETINS_APPLIED_STORE_FILE, {});
}

async function readJangadasObservacoesStore() {
  return readAuditoriaJson<JangadaObservacoesStore>(JANGADAS_OBSERVACOES_STORE_FILE, {});
}

async function readServiceBulletinsApplied(jangadaId: number) {
  const store = await readServiceBulletinsAppliedStore();
  return normalizeServiceBulletinsApplied(store[String(jangadaId)]);
}

async function writeServiceBulletinsApplied(jangadaId: number, value: unknown) {
  const currentStore = await readServiceBulletinsAppliedStore();
  const normalized = normalizeServiceBulletinsApplied(value);
  const key = String(jangadaId);
  const previous = normalizeServiceBulletinsApplied(currentStore[key]);

  const nextStore: ServiceBulletinsAppliedStore = {
    ...currentStore,
    [key]: normalized,
  };

  await writeAuditoriaJson(SERVICE_BULLETINS_APPLIED_STORE_FILE, nextStore);

  await logAuditoria({
    tabela: "JangadaServiceBulletinApplied",
    tipoOperacao: "UPDATE",
    idRegisto: jangadaId,
    descricao: "Atualização do estado de service boletins aplicados na jangada.",
    usuario: "sistema",
    dadosAntes: previous,
    dadosDepois: normalized,
  });

  return normalized;
}

async function readJangadaObservacoes(jangadaId: number) {
  const store = await readJangadasObservacoesStore();
  return String(store[String(jangadaId)] || "");
}

async function writeJangadaObservacoes(jangadaId: number, value: unknown) {
  const currentStore = await readJangadasObservacoesStore();
  const key = String(jangadaId);
  const previous = String(currentStore[key] || "");
  const normalized = String(value ?? "").trim();

  const nextStore: JangadaObservacoesStore = {
    ...currentStore,
    [key]: normalized,
  };

  await writeAuditoriaJson(JANGADAS_OBSERVACOES_STORE_FILE, nextStore);

  await logAuditoria({
    tabela: "JangadaObservacoes",
    tipoOperacao: "UPDATE",
    idRegisto: jangadaId,
    descricao: "Atualização das observações da jangada.",
    usuario: "sistema",
    dadosAntes: previous,
    dadosDepois: normalized,
  });

  return normalized;
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

function applyHruBusinessRules(args: {
  rawInput: Record<string, unknown>;
  targetData: Record<string, unknown>;
  current?: { hruReferencia?: string | null; hruDataInstalacao?: string | null; hruValidade?: string | null } | null;
}) {
  const { rawInput, targetData, current } = args;

  const hasAnyHruInput = ["hruAplicavel", "hruReferencia", "hruDataInstalacao", "hruValidade"].some((field) =>
    Object.prototype.hasOwnProperty.call(rawInput || {}, field)
  );

  if (!hasAnyHruInput) return { error: null as string | null };

  const explicitApplicability = Object.prototype.hasOwnProperty.call(rawInput || {}, "hruAplicavel")
    ? parseHruApplicability(rawInput.hruAplicavel)
    : null;

  const resolveField = (field: "hruReferencia" | "hruDataInstalacao" | "hruValidade") => {
    if (Object.prototype.hasOwnProperty.call(targetData, field)) {
      return String(targetData[field] ?? "").trim();
    }
    return String(current?.[field] ?? "").trim();
  };

  const hruReferencia = resolveField("hruReferencia");
  const hruDataInstalacaoRaw = resolveField("hruDataInstalacao");
  const hruDataInstalacao = normalizeIsoDate(hruDataInstalacaoRaw);

  const hasHruChanged =
    hruReferencia !== String(current?.hruReferencia ?? "").trim() ||
    hruDataInstalacaoRaw !== String(current?.hruDataInstalacao ?? "").trim() ||
    explicitApplicability !== null;

  if (!hasHruChanged) {
    if (current?.hruValidade) {
      targetData.hruValidade = current.hruValidade;
    }
    return { error: null as string | null };
  }

  const isApplicable = explicitApplicability ?? Boolean(hruReferencia || hruDataInstalacaoRaw);

  if (!isApplicable) {
    targetData.hruReferencia = "";
    targetData.hruDataInstalacao = "";
    targetData.hruValidade = "";
    return { error: null as string | null };
  }

  const hruReferenciaFinal = hruReferencia || HRU_REFERENCE_ARTIGO;

  if (!hruDataInstalacao) {
    return { error: "HRU aplicável: informe uma data de instalação válida." };
  }

  targetData.hruReferencia = hruReferenciaFinal;
  targetData.hruDataInstalacao = hruDataInstalacao;
  targetData.hruValidade = addYearsToIsoDate(hruDataInstalacao, 2);

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

function buildJangadaUpdateData(
  input: Record<string, unknown>,
  current?: { brand?: string | null; model?: string | null; packType?: string | null } | null,
) {
  const allowedStringFields = [
    "brand",
    "model",
    "serial",
    "launchType",
    "fabricType",
    "painterLength",
    "maxStowageHeight",
    "dataFabrico",
    "packType",
    "containerModel",
    "owner",
    "shipNameManual",
    "dataInspecao",
    "dataProxInspecao",
    "ultimoCertificadoNumero",
    "cylinderSerial",
    "cylinderTara",
    "cylinderPesoBruto",
    "cylinderCo2",
    "cylinderN2",
    "cylinderDataTeste",
    "cylinderDataProxTeste",
    "cylinderSistema",
    "cylinderCabecaDisparoRef",
    "cylinderCabecaDisparoSerial",
    "cylinderCabecaDisparoDescricao",
    "cylinderTuboCamaraSuperiorRef",
    "cylinderTuboCamaraSuperiorDescricao",
    "cylinderTuboCamaraInferiorRef",
    "cylinderTuboCamaraInferiorDescricao",
    "cylinderAcessoriosCamaraSuperiorJson",
    "cylinderAcessoriosCamaraInferiorJson",
    "valvulasAlivio",
    "valvulasAtestar",
    "hruReferencia",
    "hruDataInstalacao",
    "hruValidade",
    "radarReflector",
    "radarReflectorValidade",
    "tuboIdentificacao",
    "numeroObra",
    "certificadoExternoNumero",
    "certificadoExternoUrl",
    "testeWP",
    "testeNAP",
    "testeFS",
    "testeGI",
    "testeDL",
    "testeTemperaturaCamaraSuperior",
    "testeTemperaturaCamaraInferior",
    "testePressaoCamaraSuperior",
    "testePressaoCamaraInferior",
    "testeWPUnidadePressao",
    "testeWPHoraInicio",
    "testeWPHoraFim",
    "testeWPTemperaturaInicial",
    "testeWPTemperaturaFinal",
    "testeWPPressaoAtmosfericaInicial",
    "testeWPPressaoAtmosfericaFinal",
    "testeWPCamaraSuperiorInicio",
    "testeWPCamaraSuperiorFim",
    "testeWPCamaraSuperiorQueda",
    "testeWPCamaraInferiorInicio",
    "testeWPCamaraInferiorFim",
    "testeWPCamaraInferiorQueda",
    "signatureBase64",
  ] as const;

  const data: Record<string, unknown> = {};

  for (const key of allowedStringFields) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      data[key] = input[key] === undefined ? null : input[key];
    }
  }

  const normalizeDecimalSeparator = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (/^\d+([.,]\d+)?$/.test(trimmed)) return trimmed.replace(",", ".");
    return value;
  };

  for (const key of ["cylinderCo2", "cylinderN2", "cylinderPesoBruto", "cylinderTara"]) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = normalizeDecimalSeparator(data[key]);
    }
  }

  const canonical = canonicalizeDateFields(data, [
    "dataInspecao",
    "dataProxInspecao",
    "cylinderDataTeste",
    "cylinderDataProxTeste",
    "hruDataInstalacao",
    "hruValidade",
    "radarReflectorValidade",
  ]);
  for (const key of Object.keys(canonical)) data[key] = canonical[key];

  if (Object.prototype.hasOwnProperty.call(input, "brand")) {
    data.brand = normalizeBrandName(input?.brand, input?.model);
  }

  const shouldRecomputeModel = ["brand", "model", "packType"].some((field) =>
    Object.prototype.hasOwnProperty.call(input, field)
  );

  if (shouldRecomputeModel) {
    const effectiveBrand = Object.prototype.hasOwnProperty.call(input, "brand")
      ? (data.brand ?? input?.brand)
      : current?.brand;
    const effectiveModel = Object.prototype.hasOwnProperty.call(input, "model") ? input?.model : current?.model;
    const effectivePackType = Object.prototype.hasOwnProperty.call(input, "packType")
      ? (data.packType ?? input?.packType)
      : current?.packType;

    data.model = normalizeRaftModel(effectiveModel, effectiveBrand, effectivePackType);
    if (Object.prototype.hasOwnProperty.call(input, "model") && isLegacyAlmarModel(input?.model)) {
      data.brand = "ALMAR";
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "dataFabrico")) {
    data.dataFabrico = normalizeMonthYear(input?.dataFabrico) || "";
  }

  if (Object.prototype.hasOwnProperty.call(input, "cylinderSistema")) {
    data.cylinderSistema = canonicalizeCylinderSistema(input?.cylinderSistema);
  }

  if (Object.prototype.hasOwnProperty.call(input, "capacity")) {
    const c = Number(input.capacity);
    if (Number.isFinite(c)) data.capacity = c;
  }

  if (Object.prototype.hasOwnProperty.call(input, "shipId")) {
    const shipId = input.shipId;
    if (shipId === null || shipId === "") {
      data.shipId = null;
    } else {
      const parsed = Number(shipId);
      if (Number.isFinite(parsed)) data.shipId = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "certificadoAtivoId")) {
    const certId = input.certificadoAtivoId;
    if (certId === null || certId === "") {
      data.certificadoAtivoId = null;
    } else {
      const parsed = Number(certId);
      if (Number.isFinite(parsed)) data.certificadoAtivoId = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "serviceStationId")) {
    const serviceStationId = input.serviceStationId;
    if (serviceStationId === null || serviceStationId === "") {
      data.serviceStationId = null;
    } else {
      const parsed = Number(serviceStationId);
      if (Number.isFinite(parsed)) data.serviceStationId = parsed;
    }
  }

  return data;
}

const JANGADA_COMPAT_OPTIONAL_FIELDS = [
  "serviceBulletinsAppliedJson",
  "testeWPUnidadePressao",
  "testeWPHoraInicio",
  "testeWPHoraFim",
  "testeWPTemperaturaInicial",
  "testeWPTemperaturaFinal",
  "testeWPPressaoAtmosfericaInicial",
  "testeWPPressaoAtmosfericaFinal",
  "testeWPCamaraSuperiorInicio",
  "testeWPCamaraSuperiorFim",
  "testeWPCamaraSuperiorQueda",
  "testeWPCamaraInferiorInicio",
  "testeWPCamaraInferiorFim",
  "testeWPCamaraInferiorQueda",
  "oficinaTemperatura",
  "oficinaHumidade",
  "closureStrapsJson",
  "containerSize",
  "certificadoNumeroOriginal",
  "cylinderCabecaDisparoSerial",
] as const;

const JANGADA_DETAIL_FIELD_NAMES = [
  "id",
  "brand",
  "model",
  "serial",
  "launchType",
  "painterLength",
  "maxStowageHeight",
  "dataFabrico",
  "packType",
  "containerModel",
  "containerSize",
  "capacity",
  "owner",
  "shipId",
  "serviceStationId",
  "shipNameManual",
  "dataInspecao",
  "dataProxInspecao",
  "ultimoCertificadoNumero",
  "certificadoNumeroOriginal",
  "cylinderSerial",
  "cylinderTara",
  "cylinderPesoBruto",
  "cylinderCo2",
  "cylinderN2",
  "cylinderDataTeste",
  "cylinderDataProxTeste",
  "cylinderSistema",
  "cylinderCabecaDisparoRef",
  "cylinderCabecaDisparoSerial",
  "fabricType",
  "cylinderCabecaDisparoDescricao",
  "cylinderTuboCamaraSuperiorRef",
  "cylinderTuboCamaraSuperiorDescricao",
  "cylinderTuboCamaraInferiorRef",
  "cylinderTuboCamaraInferiorDescricao",
  "cylinderAcessoriosCamaraSuperiorJson",
  "cylinderAcessoriosCamaraInferiorJson",
  "valvulasAlivio",
  "valvulasAtestar",
  "hruReferencia",
  "hruDataInstalacao",
  "hruValidade",
  "radarReflector",
  "radarReflectorValidade",
  "tuboIdentificacao",
  "numeroObra",
  "testeWP",
  "testeNAP",
  "testeFS",
  "testeGI",
  "testeDL",
  "testeTemperaturaCamaraSuperior",
  "testeTemperaturaCamaraInferior",
  "testePressaoCamaraSuperior",
  "testePressaoCamaraInferior",
  "testeWPUnidadePressao",
  "testeWPHoraInicio",
  "testeWPHoraFim",
  "testeWPTemperaturaInicial",
  "testeWPTemperaturaFinal",
  "testeWPPressaoAtmosfericaInicial",
  "testeWPPressaoAtmosfericaFinal",
  "testeWPCamaraSuperiorInicio",
  "testeWPCamaraSuperiorFim",
  "testeWPCamaraSuperiorQueda",
  "testeWPCamaraInferiorInicio",
  "testeWPCamaraInferiorFim",
  "testeWPCamaraInferiorQueda",
  "oficinaTemperatura",
  "oficinaHumidade",
  "closureStrapsJson",
  "createdAt",
  "updatedAt",
  "certificadoAtivoId",
] as const;

function buildJangadaDetailSelect(unsupportedFields?: Iterable<string>): Prisma.JangadaSelect {
  const unsupported = new Set(unsupportedFields || []);
  const scalarSelect = Object.fromEntries(
    JANGADA_DETAIL_FIELD_NAMES.filter((field) => !unsupported.has(field)).map((field) => [field, true])
  );

  return {
    ...(scalarSelect as Record<string, boolean>),
    serviceStation: {
      select: {
        id: true,
        codigo: true,
        nome: true,
      },
    },
    certificadoAtivo: { include: { validities: true } },
    certificadosExtraidos: {
      include: { validities: true },
      orderBy: [{ sourceYear: 'desc' }, { dataInspecao: 'desc' }, { id: 'desc' }],
    },
  };
}

function getMissingCompatibleJangadaField(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  if (code !== "P2022") return null;

  const column = String((error as { meta?: { column?: unknown } })?.meta?.column || "");
  const match = column.match(/^Jangada\.(.+)$/);
  if (!match) return null;

  const field = match[1];
  return (JANGADA_COMPAT_OPTIONAL_FIELDS as readonly string[]).includes(field) ? field : null;
}

function omitUnsupportedFields<T extends Record<string, unknown>>(value: T, unsupportedFields: Set<string>): T {
  if (!unsupportedFields.size) return value;

  return Object.fromEntries(Object.entries(value).filter(([key]) => !unsupportedFields.has(key))) as T;
}

async function findJangadaByIdCompat(id: number) {
  const unsupportedFields = new Set<string>();

  while (true) {
    try {
      const jangada = await prisma.jangada.findUnique({
        where: { id },
        select: buildJangadaDetailSelect(unsupportedFields),
      });

      return { jangada, unsupportedFields };
    } catch (error) {
      const missingField = getMissingCompatibleJangadaField(error);
      if (!missingField || unsupportedFields.has(missingField)) throw error;
      unsupportedFields.add(missingField);
    }
  }
}

async function updateJangadaCompat(id: number, data: Record<string, unknown>) {
  const unsupportedFields = new Set<string>();

  while (true) {
    try {
      const updated = await prisma.jangada.update({
        where: { id },
        data: omitUnsupportedFields(data, unsupportedFields) as unknown as Prisma.JangadaUncheckedUpdateInput,
        select: buildJangadaDetailSelect(unsupportedFields),
      });

      return { updated, unsupportedFields };
    } catch (error) {
      const missingField = getMissingCompatibleJangadaField(error);
      if (!missingField || unsupportedFields.has(missingField)) throw error;
      unsupportedFields.add(missingField);
    }
  }
}

async function resolveShipAssignment(shipId: number) {
  return prisma.navio.findUnique({
    where: { id: shipId },
    select: NAVIO_WITH_CLIENTE_SELECT,
  });
}

function normalizeExpectedDeliveryInput(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function parseQueueMetaBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'sim', 'yes', 'y'].includes(raw)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'n'].includes(raw)) return false;
  return fallback;
}

type JangadaQueueLogisticsMeta = {
  workflowStatus?: string;
  readyForDelivery?: boolean;
  deliveryMethod?: string;
  deliveredAt?: string | null;
};

type JangadaQueueStatus = 'aguardar' | 'agendada' | 'progresso' | 'a_secar' | 'finalizada';

function normalizeJangadaQueueStatus(value: unknown): JangadaQueueStatus | undefined {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'agendada') return 'agendada';
  if (raw === 'progresso') return 'progresso';
  if (raw === 'a_secar') return 'a_secar';
  if (raw === 'finalizada') return 'finalizada';
  if (raw === 'aguardar' || raw === 'aguardando' || raw === 'aguardar inspeccao' || raw === 'aguardar inspeção') return 'aguardar';
  return undefined;
}

function parseJangadaQueueLogisticsMeta(raw: unknown): JangadaQueueLogisticsMeta {
  const text = String(raw ?? '').trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    return {
      workflowStatus: typeof parsed.workflowStatus === 'string' ? String(parsed.workflowStatus).trim() || undefined : undefined,
      readyForDelivery: parseQueueMetaBoolean(parsed.readyForDelivery, false),
      deliveryMethod: typeof parsed.deliveryMethod === 'string' ? String(parsed.deliveryMethod).trim() || undefined : undefined,
      deliveredAt: typeof parsed.deliveredAt === 'string' ? String(parsed.deliveredAt).trim() || null : null,
    };
  } catch {
    return {};
  }
}

function mergeJangadaQueueLogisticsMeta(raw: unknown, updates: Partial<JangadaQueueLogisticsMeta>) {
  const currentRaw = String(raw ?? '').trim();
  let base: Record<string, unknown> = {};

  if (currentRaw) {
    try {
      const parsed = JSON.parse(currentRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      base = { observacao: currentRaw };
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'workflowStatus')) {
    base.workflowStatus = updates.workflowStatus || '';
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'readyForDelivery')) {
    base.readyForDelivery = Boolean(updates.readyForDelivery);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'deliveryMethod')) {
    base.deliveryMethod = updates.deliveryMethod || '';
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'deliveredAt')) {
    base.deliveredAt = updates.deliveredAt || '';
  }

  return JSON.stringify(base);
}

function parseArtigosFromText(raw: unknown) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  const value = raw.trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeArtigosInput(raw: unknown) {
  if (!Array.isArray(raw)) return [] as Array<{
    name: string;
    quantidade: number;
    validade: Date | null;
    referencia: string | null;
    codigoFabricante: string | null;
  }>;

  return raw
    .map((item) => {
      const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const name = String(entry?.name || "").trim();
      if (!name) return null;

      const quantidadeNum = Number(entry?.quantidade);
      const quantidade = Number.isFinite(quantidadeNum) ? Math.max(0, Math.round(quantidadeNum)) : 0;

      const validadeRaw = String(entry?.validade || "").trim();
      const validadeParsed = validadeRaw ? Date.parse(validadeRaw) : Number.NaN;
      const validade = Number.isNaN(validadeParsed) ? null : new Date(validadeParsed);

      const referencia = entry?.referencia ? String(entry.referencia).trim() : null;
      const codigoFabricante = entry?.codigoFabricante ? String(entry.codigoFabricante).trim() : null;

      return {
        name,
        quantidade,
        validade,
        referencia,
        codigoFabricante,
      };
    })
    .filter((item): item is {
      name: string;
      quantidade: number;
      validade: Date | null;
      referencia: string | null;
      codigoFabricante: string | null;
    } => item !== null);
}

function toClientArtigo(art: {
  id?: number | null;
  name?: string | null;
  quantidade?: number | null;
  validade?: Date | string | null;
  referencia?: string | null;
  codigoFabricante?: string | null;
  stock?: { foto?: string | null } | null;
}) {
  return {
    id: art?.id,
    name: art?.name || "",
    quantidade: art?.quantidade ?? 0,
    validade: art?.validade ? new Date(String(art.validade)).toISOString().slice(0, 10) : undefined,
    referencia: art?.referencia || undefined,
    codigoFabricante: art?.codigoFabricante || undefined,
    foto: art?.stock?.foto || undefined,
  };
}

type ArtigoJangadaDelegate = {
  findMany: (args: {
    where: { jangadaId: number; inspecaoId?: null };
    orderBy: Array<{ id: "asc" }>;
    take: number;
    select: {
      id: boolean;
      name: boolean;
      quantidade: boolean;
      validade: boolean;
      referencia: boolean;
      codigoFabricante: boolean;
      updatedAt: boolean;
      stock: { select: { foto: boolean } };
    };
  }) => Promise<Array<{
    id: number;
    name: string;
    quantidade: number;
    validade: Date | null;
    referencia: string | null;
    codigoFabricante: string | null;
    updatedAt: Date;
    stock: { foto: string | null } | null;
  }>>;
  deleteMany: (args: { where: { jangadaId: number; inspecaoId?: null } }) => Promise<{ count: number }>;
  createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>;
};

async function loadArtigosPersistidosLean(artigoJangadaDelegate: ArtigoJangadaDelegate | undefined, jangadaId: number) {
  if (!artigoJangadaDelegate) return [];

  const baseSelect = {
    id: true,
    name: true,
    quantidade: true,
    validade: true,
    referencia: true,
    codigoFabricante: true,
    updatedAt: true,
    stock: { select: { foto: true } },
  };

  // Primeiro tentamos apenas os artigos ativos da ficha (inspecaoId nulo),
  // preservando exatamente os valores guardados na jangada.
  let rows = await artigoJangadaDelegate.findMany({
    where: { jangadaId, inspecaoId: null },
    orderBy: [{ id: "asc" }],
    take: 2000,
    select: baseSelect,
  });

  // Compatibilidade com dados antigos: fallback para todos os artigos da jangada,
  // mantendo seleção enxuta e limite de segurança.
  if (!rows.length) {
    rows = await artigoJangadaDelegate.findMany({
      where: { jangadaId },
      orderBy: [{ id: "asc" }],
      take: 2000,
      select: baseSelect,
    });
  }

  return rows.map(toClientArtigo);
}

const GROUPS: Array<{ key: string; tokens: string[] }> = [
  { key: "fachos_mao", tokens: ["facho", "fachos", "mao", "handflare", "fogo de mao"] },
  { key: "paraquedas", tokens: ["paraquedas", "parachute", "rocket", "foguete"] },
  { key: "comprimidos", tokens: ["comprimido", "comprimidos", "pastilha", "enjoo", "tablet", "seasickness"] },
  { key: "aguas", tokens: ["agua", "aguas", "water", "potavel"] },
  { key: "racoes", tokens: ["racao", "racoes", "ration", "food"] },
  { key: "farmacia", tokens: ["farmacia", "first aid", "primeiros socorros", "ambulancia", "ambulância"] },
  { key: "fumo", tokens: ["fumo", "fumigeno", "smoke"] },
];

function detectGroups(text: string) {
  const norm = normalize(text);
  const groups = new Set<string>();

  for (const group of GROUPS) {
    for (const token of group.tokens) {
      if (norm.includes(normalize(token))) {
        groups.add(group.key);
        break;
      }
    }
  }

  return groups;
}

function matchStockItem(rawItem: string, stock: Array<{ referencia: string; descricao: string; categoria: string | null; codigoFabricante: string | null }>) {
  const normItem = normalize(rawItem);
  const groups = detectGroups(rawItem);

  let best: { score: number; item: { referencia: string; descricao: string; categoria: string | null; codigoFabricante: string | null } } | null = null;

  for (const s of stock) {
    const blob = normalize([s.descricao, s.referencia, s.categoria || "", s.codigoFabricante || ""].join(" "));
    let score = 0;

    if (blob.includes(normItem)) score += 8;

    const sGroups = detectGroups(blob);
    for (const g of groups) {
      if (sGroups.has(g)) score += 5;
    }

    for (const word of normItem.split(" ").filter((w) => w.length >= 3)) {
      if (blob.includes(word)) score += 1;
    }

    if (!best || score > best.score) {
      best = { score, item: s };
    }
  }

  if (!best || best.score < 5) return null;
  return best.item;
}

// Constrói um mapa (referência/código fabricante/descrição normalizados -> foto) a partir do stock
function buildStockPhotoMap(stock: Array<{ referencia: string; codigoFabricante: string | null; descricao: string; foto?: string | null }>) {
  const map = new Map<string, string>();
  for (const s of stock) {
    const foto = s.foto || "";
    if (!foto) continue;
    for (const key of [s.referencia, s.codigoFabricante || "", s.descricao]) {
      const nk = normalize(key);
      if (nk && !map.has(nk)) map.set(nk, foto);
    }
  }
  return map;
}

// Preenche a foto de um artigo da jangada a partir do stock, quando não vem já resolvida
function enrichArtigoFoto(
  artigo: { name?: string; referencia?: string; codigoFabricante?: string; foto?: string },
  photoMap: Map<string, string>
) {
  if (artigo.foto) return artigo;
  if (!artigo.referencia && !artigo.codigoFabricante && !artigo.name) return artigo;
  for (const key of [artigo.referencia || "", artigo.codigoFabricante || "", artigo.name || ""]) {
    const foto = photoMap.get(normalize(key));
    if (foto) {
      artigo.foto = foto;
      return artigo;
    }
  }
  return artigo;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    const { jangada } = await findJangadaByIdCompat(id);
    if (!jangada) return NextResponse.json({ error: 'Jangada não encontrada' }, { status: 404 });

    if (!access.isAdmin && !access.allowedStationIds.includes(Number(jangada.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem permissão para aceder a esta jangada." }, { status: 403 });
    }
    const serviceBulletinsApplied = await readServiceBulletinsApplied(id);
    const inspectionChecklistValues = await readInspectionChecklistValues(id);
    const observacoes = await readJangadaObservacoes(id);

    const globalStock = await prisma.stock.findMany({
      where: {
        estadoArtigo: "ATIVO"
      },
      select: {
        id: true,
        referencia: true,
        descricao: true,
        categoria: true,
        codigoFabricante: true,
        lote: true,
        validade: true,
        quantidade: true,
        foto: true
      },
      orderBy: { descricao: 'asc' }
    });

    const stockPhotoMap = buildStockPhotoMap(globalStock as { referencia: string; codigoFabricante: string | null; descricao: string; foto?: string | null }[]);

    const artigoJangadaDelegate = prisma.artigoJangada as unknown as ArtigoJangadaDelegate | undefined;
    
    const ownerDisplayValue = typeof jangada.owner === "string" ? jangada.owner.trim() : "";
    const jangadaShipId = Number.isFinite(Number(jangada.shipId)) ? Number(jangada.shipId) : null;
    let ownerDisplay: string | null = null;
    let ownerClientId: number | null = null;
    let shipDetails: Awaited<ReturnType<typeof resolveShipAssignment>> | null = null;
    if (jangadaShipId) {
      const navio = await resolveShipAssignment(jangadaShipId);
      shipDetails = navio
        ? {
            id: navio.id,
            nome: navio.nome,
            matricula: navio.matricula,
            tipoPesca: navio.tipoPesca,
            tipoNavio: navio.tipoNavio,
            ilha: (navio.ilha && (() => {
              const az = require("@/lib/azores-islands").canonicalizeAzoresIsland(navio.ilha);
              if (az) return az;
              const clienteIlha = navio.cliente?.ilha ? require("@/lib/azores-islands").canonicalizeAzoresIsland(navio.cliente.ilha) : null;
              return clienteIlha ?? null;
            })()),
            portoRegisto: navio.portoRegisto,
            proprietario: navio.proprietario,
            bandeira: navio.bandeira,
            mmsi: navio.mmsi,
            imo: navio.imo,
            callSignal: navio.callSignal,
            hruReferencia: navio.hruReferencia || null,
            hruValidade: navio.hruValidade || null,
            radarReflector: navio.radarReflector || null,
            radarReflectorValidade: navio.radarReflectorValidade || null,
            cliente: navio.cliente
              ? {
                  id: navio.cliente.id,
                  nome: navio.cliente.nome,
                  ilha: navio.cliente.ilha,
                  telefone: navio.cliente.telefone,
                  telmovel: navio.cliente.telmovel,
                }
              : null,
          }
        : null;
      ownerDisplay = navio?.cliente?.nome || ownerDisplayValue || null;
      ownerClientId = navio?.cliente?.id ?? null;
    } else {
      ownerDisplay = ownerDisplayValue || null;
    }

    const certs2025 = [
      ...(Array.isArray(jangada.certificadosExtraidos) ? (jangada.certificadosExtraidos as unknown as CertificadoComValididades[]) : []).filter(
        (c) => Number(c?.sourceYear) === 2025
      ),
      ...(jangada.certificadoAtivo && Number(jangada.certificadoAtivo?.sourceYear) === 2025 ? [jangada.certificadoAtivo as unknown as CertificadoComValididades] : []),
    ];

    const dedupe = new Set<string>();
    const artigosDerivados: Array<{
      name: string;
      quantidade: number;
      validade?: string;
      referencia?: string;
      codigoFabricante?: string;
      sourceItemCertificado?: string;
      sourceCertificadoNumero?: string;
    }> = [];

    for (const cert of certs2025) {
      const rows = Array.isArray(cert?.validities) ? cert.validities : [];
      for (const row of rows) {
        const item = String(row?.item || "").trim();
        const validade = String(row?.validade || "").trim();
        if (!item) continue;

        const matched = matchStockItem(item, globalStock);
        const matchedFoto = matched
          ? enrichArtigoFoto(
              { referencia: matched.referencia, codigoFabricante: matched.codigoFabricante, name: matched.descricao },
              stockPhotoMap
            ).foto
          : undefined;
        const entry = {
          name: matched?.descricao || item,
          quantidade: 1,
          validade: validade || undefined,
          referencia: matched?.referencia || undefined,
          codigoFabricante: matched?.codigoFabricante || undefined,
          foto: matchedFoto,
          sourceItemCertificado: item,
          sourceCertificadoNumero: cert?.certificadoNumero || cert?.fileName || undefined,
        };

        const key = `${entry.name}|${entry.validade || ""}|${entry.referencia || ""}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        artigosDerivados.push(entry);
      }
    }

    let artigosPersistidos: ReturnType<typeof toClientArtigo>[] = [];
    if (artigoJangadaDelegate) {
      artigosPersistidos = await loadArtigosPersistidosLean(artigoJangadaDelegate, id);
    } else {
      // Compatibilidade com esquema legado onde artigos era armazenado como texto JSON
      artigosPersistidos = parseArtigosFromText((jangada as { artigos?: unknown }).artigos);
    }

    // Preenche a foto a partir do stock quando o artigo persistido não tem stockId/stock.foto
    artigosPersistidos = artigosPersistidos.map((artigo) => enrichArtigoFoto(artigo, stockPhotoMap));

    const latestQueue = await prisma.serviceStationQueue.findFirst({
      where: { jangadaId: id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { dataPrevistaEntrega: true, updatedAt: true, status: true, observacoes: true },
    });
    const latestQueueMeta = parseJangadaQueueLogisticsMeta(latestQueue?.observacoes);

    const resolvedMandatoryPack = await resolveMandatoryPackItemsForRaftAsync({
      brand: jangada.brand,
      model: jangada.model,
      packType: jangada.packType,
      capacity: jangada.capacity,
    });

    const inspections = await prisma.inspecao.findMany({
      where: {
        OR: [
          { jangadaId: id },
          { jangadaSerial: jangada.serial || "" }
        ]
      },
      include: {
        artigos: true
      },
      orderBy: { dataInspecao: 'desc' }
    });

    const inspectionsWithCylinder = await Promise.all(
      inspections.map(async (insp) => {
        const integrityRecomputed = insp.integrityHash
          ? computeInspectionDigest(insp, insp.artigos)
          : null;
        if (!insp.certificadoNumero) return { ...insp, cylinderSerialSnapshot: null };
        const snapshot = await getInspectionSnapshot(insp.certificadoNumero);
        return {
          ...insp,
          integrityValid: insp.integrityHash
            ? integrityRecomputed === insp.integrityHash
            : null,
          integrityHashShort: shortDigest(insp.integrityHash),
          cylinderSerialSnapshot:
            snapshot?.cylinderSerial != null && snapshot.cylinderSerial !== ""
              ? snapshot.cylinderSerial
              : null,
        };
      })
    );

    return NextResponse.json({
      ...jangada,
      brand: normalizeBrandName(jangada.brand, jangada.model),
      model: normalizeRaftModel(jangada.model, jangada.brand, jangada.packType),
      cylinderSistema: canonicalizeCylinderSistema(jangada.cylinderSistema),
      shipNameManual: shipDetails?.nome || jangada.shipNameManual || "",
      ownerDisplay,
      ownerClientId,
      shipDetails,
      serviceStationStatus: normalizeJangadaQueueStatus(latestQueue?.status) || null,
      serviceStationWorkflowStatus: latestQueueMeta.workflowStatus || null,
      readyForDelivery: Boolean(latestQueueMeta.readyForDelivery),
      deliveryMethod: latestQueueMeta.deliveryMethod || null,
      expectedDeliveryDate: latestQueue?.dataPrevistaEntrega ? latestQueue.dataPrevistaEntrega.toISOString().slice(0, 10) : null,
      delivered: Boolean(latestQueueMeta.deliveredAt),
      deliveredAt: latestQueueMeta.deliveredAt || null,
      statusSetAt: latestQueue?.updatedAt ? latestQueue.updatedAt.toISOString() : null,
      artigos: artigosPersistidos.length > 0 ? artigosPersistidos : artigosDerivados,
      mandatoryPackItems: resolvedMandatoryPack.items,
      mandatoryPackSource: resolvedMandatoryPack.source,
      customPackDefinition: resolvedMandatoryPack.customPack,
      applicableServiceBulletins: getApplicableServiceBulletinsForRaft(jangada),
      serviceBulletinsApplied,
      inspectionChecklistValues,
      observacoes,
      inspecoes: inspectionsWithCylinder,
    });
  } catch (err: unknown) {
    return buildDatabaseErrorResponse(err, err instanceof Error ? err.message : "Erro ao procurar jangada");
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Sem permissão para eliminar jangadas." }, { status: 403 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const jangadaAntes = await prisma.jangada.findUnique({
      where: { id },
      select: { id: true, serial: true, brand: true, model: true, capacity: true },
    });
    if (!jangadaAntes) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

    await deleteJangadaById(id);

    await logAuditoria({
      tabela: "Jangada",
      tipoOperacao: "DELETE",
      idRegisto: id,
      descricao: `Ficha da jangada eliminada: ${jangadaAntes.brand} ${jangadaAntes.model} (${jangadaAntes.capacity}P), S/N ${jangadaAntes.serial}.`,
      usuario: access.email || "sistema",
      dadosAntes: jangadaAntes,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return buildDatabaseErrorResponse(err, err instanceof Error ? err.message : "Erro ao eliminar jangada");
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const existing = await prisma.jangada.findUnique({
      where: { id },
      select: { 
        id: true, 
        brand: true, 
        model: true, 
        packType: true, 
        capacity: true, 
        serviceStationId: true, 
        hruReferencia: true, 
        hruDataInstalacao: true, 
        hruValidade: true,
        serial: true,
        shipId: true,
        shipNameManual: true,
        dataInspecao: true,
        dataProxInspecao: true,
        ultimoCertificadoNumero: true
      },
    });
    if (!existing) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

    if (!access.isAdmin && !access.allowedStationIds.includes(Number(existing.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem permissão para editar esta jangada." }, { status: 403 });
    }

    const rawData = canonicalizeDateFields(
      (await req.json()) as Record<string, unknown>,
      [
        "dataFabrico",
        "dataInspecao",
        "dataProxInspecao",
        "cylinderDataTeste",
        "cylinderDataProxTeste",
        "hruDataInstalacao",
        "hruValidade",
        "radarReflectorValidade",
      ],
    ) as Record<string, unknown>;
    const canEditJangadasPage = access.isAdmin || canEditPath(access.permissions, "/jangadas");

    if (!access.isAdmin && !canEditJangadasPage) {
      return NextResponse.json({ error: "Sem permissão para editar a página de jangadas." }, { status: 403 });
    }

    const data = rawData;

    const jangadaData = buildJangadaUpdateData(data || {}, existing);
    const hasServiceBulletinsApplied = Object.prototype.hasOwnProperty.call(data || {}, "serviceBulletinsApplied");
    const hasInspectionChecklistValues = Object.prototype.hasOwnProperty.call(data || {}, "inspectionChecklistValues");
    const hasObservacoes = Object.prototype.hasOwnProperty.call(data || {}, "observacoes");
    const expectedDeliveryDate = Object.prototype.hasOwnProperty.call(data || {}, 'expectedDeliveryDate')
      ? normalizeExpectedDeliveryInput(data?.expectedDeliveryDate)
      : undefined;
    const serviceStationStatus = Object.prototype.hasOwnProperty.call(data || {}, 'serviceStationStatus')
      ? normalizeJangadaQueueStatus(data?.serviceStationStatus)
      : undefined;
    const readyForDelivery = Object.prototype.hasOwnProperty.call(data || {}, 'readyForDelivery')
      ? parseQueueMetaBoolean(data?.readyForDelivery, false)
      : undefined;
    const deliveryMethod = Object.prototype.hasOwnProperty.call(data || {}, 'deliveryMethod')
      ? String(data?.deliveryMethod || '').trim() || ''
      : undefined;
    const delivered = Object.prototype.hasOwnProperty.call(data || {}, 'delivered')
      ? parseQueueMetaBoolean(data?.delivered, false)
      : undefined;
    const deliveredAt = Object.prototype.hasOwnProperty.call(data || {}, 'deliveredAt')
      ? (String(data?.deliveredAt || '').trim() ? new Date(String(data?.deliveredAt)).toISOString() : null)
      : undefined;
    const artigosInput = Array.isArray(data?.artigos) ? data.artigos : null;
    const artigoJangadaDelegate = prisma.artigoJangada as unknown as ArtigoJangadaDelegate | undefined;

    const hruRules = applyHruBusinessRules({
      rawInput: data || {},
      targetData: jangadaData,
      current: existing,
    });
    if (hruRules.error) {
      return NextResponse.json({ error: hruRules.error }, { status: 400 });
    }

    if (jangadaData?.cylinderDataTeste) {
      jangadaData.cylinderDataProxTeste = addFiveYears(String(jangadaData.cylinderDataTeste));
    }

    if (Object.prototype.hasOwnProperty.call(jangadaData, "packType")) {
      const nextPackType = String(jangadaData.packType || "");
      const isValidPackType = await isKnownPackTypeName(nextPackType, {
        includeInactiveCustom: nextPackType.trim().toUpperCase() === String(existing.packType || "").trim().toUpperCase(),
      });
      if (!isValidPackType) {
        return NextResponse.json({ error: "Tipo de pack inválido." }, { status: 400 });
      }
    }

    if (artigosInput && artigoJangadaDelegate) {
      const artigosNormalizados = normalizeArtigosInput(artigosInput);
      await artigoJangadaDelegate.deleteMany({
        where: {
          jangadaId: id,
          inspecaoId: null,
        },
      });
      if (artigosNormalizados.length > 0) {
        await artigoJangadaDelegate.createMany({
          data: artigosNormalizados.map((art) => ({ ...art, jangadaId: id })),
        });
      }
    } else if (artigosInput) {
      // Compatibilidade com esquema legado onde artigos era armazenado como texto JSON
      jangadaData.artigos = JSON.stringify(artigosInput);
    }

    const nextShipId = Number(jangadaData.shipId || 0);
    let assignedShip: Awaited<ReturnType<typeof resolveShipAssignment>> | null = null;
    if (Number.isFinite(nextShipId) && nextShipId > 0) {
      assignedShip = await resolveShipAssignment(nextShipId);
      if (!assignedShip) {
        return NextResponse.json({ error: "Navio associado não encontrado." }, { status: 400 });
      }
      jangadaData.shipId = assignedShip.id;
      jangadaData.shipNameManual = assignedShip.nome;
    } else if (Object.prototype.hasOwnProperty.call(data || {}, "shipId")) {
      jangadaData.shipNameManual = "";
    }

    const nextBrandForSync = normalizeBrandName(
      Object.prototype.hasOwnProperty.call(data || {}, "brand") ? jangadaData.brand : existing.brand,
      Object.prototype.hasOwnProperty.call(data || {}, "model") ? data?.model : existing.model,
    );
    const nextPackTypeForSync = String(
      Object.prototype.hasOwnProperty.call(data || {}, "packType") ? (jangadaData.packType ?? data?.packType ?? "") : (existing.packType ?? "")
    ).trim();
    const nextModelForSync = normalizeRaftModel(
      Object.prototype.hasOwnProperty.call(data || {}, "model")
        ? (jangadaData.model ?? data?.model)
        : existing.model,
      nextBrandForSync,
      nextPackTypeForSync,
    );
    const nextCapacityForSync = Object.prototype.hasOwnProperty.call(jangadaData, "capacity")
      ? Number(jangadaData.capacity || 0)
      : Number(existing.capacity || 0);

    const shouldSyncMandatoryPackArticles =
      normalize(nextBrandForSync) !== normalize(existing.brand) ||
      normalize(nextModelForSync) !== normalize(existing.model) ||
      normalize(nextPackTypeForSync) !== normalize(existing.packType) ||
      nextCapacityForSync !== Number(existing.capacity || 0);

    // Registar ou atualizar o histórico de inspeções
    const nextDataInspecao = Object.prototype.hasOwnProperty.call(data || {}, "dataInspecao")
      ? (data.dataInspecao ? String(data.dataInspecao).trim() : null)
      : undefined;
    const nextDataProxInspecao = Object.prototype.hasOwnProperty.call(data || {}, "dataProxInspecao")
      ? (data.dataProxInspecao ? String(data.dataProxInspecao).trim() : null)
      : undefined;

    if (nextDataInspecao !== undefined || nextDataProxInspecao !== undefined) {
      const targetDataInspecao = nextDataInspecao !== undefined ? nextDataInspecao : existing.dataInspecao;
      
      if (targetDataInspecao) {
        // Tenta encontrar uma inspeção existente para esta data nesta jangada
        let existingInspection = await prisma.inspecao.findFirst({
          where: {
            jangadaId: id,
            dataInspecao: targetDataInspecao,
          },
        });

        // Se não encontrar por data exata, tenta encontrar a última inspeção registada no histórico
        if (!existingInspection) {
          existingInspection = await prisma.inspecao.findFirst({
            where: { jangadaId: id },
            orderBy: { dataInspecao: "desc" },
          });
        }

        if (existingInspection) {
          // Atualiza a inspeção existente
          const updatePayload: Record<string, unknown> = {};
          if (nextDataInspecao !== undefined) updatePayload.dataInspecao = nextDataInspecao;
          if (nextDataProxInspecao !== undefined) updatePayload.dataProxInspecao = nextDataProxInspecao;

          await prisma.inspecao.update({
            where: { id: existingInspection.id },
            data: updatePayload,
          });

          // Guardar snapshot para esta inspeção existente
          await saveInspectionSnapshot(existingInspection.certificadoNumero, id);
        } else {
          // Se não houver nenhuma inspeção para este id no histórico, cria uma nova
          const certNum = await generateInspectionCertificateNumber(targetDataInspecao);

          await prisma.inspecao.create({
            data: {
              certificadoNumero: certNum,
              jangadaId: id,
              jangadaSerial: data?.serial ? String(data.serial) : (existing.serial || ""),
              navioId: data?.shipId ? Number(data.shipId) : (existing.shipId || null),
              navioNome: data?.shipNameManual ? String(data.shipNameManual) : (existing.shipNameManual || "Sem navio"),
              dataInspecao: targetDataInspecao,
              dataProxInspecao: nextDataProxInspecao !== undefined ? nextDataProxInspecao : null,
              status: "Concluída",
            },
          });

          // Guardar snapshot para esta nova inspeção
          await saveInspectionSnapshot(certNum, id);

          // Atualizar o certificado na jangada
          jangadaData.ultimoCertificadoNumero = certNum;
        }
      }
    }

    const newShipId = Object.prototype.hasOwnProperty.call(jangadaData, "shipId") 
      ? (jangadaData.shipId ? Number(jangadaData.shipId) : null)
      : undefined;

    if (newShipId !== undefined && newShipId !== existing.shipId) {
      let origemNome = null;
      let destinoNome = null;

      if (existing.shipId) {
        const s = await prisma.navio.findUnique({ where: { id: existing.shipId }, select: { nome: true } });
        origemNome = s?.nome || null;
      }
      if (newShipId) {
        const s = await prisma.navio.findUnique({ where: { id: newShipId }, select: { nome: true } });
        destinoNome = s?.nome || null;
      }

      await prisma.movimentoEquipamento.create({
        data: {
          tipoEquipamento: "Jangada",
          equipamentoId: id,
          serial: existing.serial || "",
          origemShipId: existing.shipId,
          origemShipNome: origemNome,
          destinoShipId: newShipId,
          destinoShipNome: destinoNome,
          motivo: "Alteração de Navio"
        }
      });
    }

    const { updated } = await updateJangadaCompat(id, jangadaData);

    if (shouldSyncMandatoryPackArticles && artigoJangadaDelegate) {
      await syncRaftArticlesWithPackType(id);
    }

    const updatedShipId = Number(updated.shipId || 0);
    const updatedShip = updatedShipId > 0
      ? (assignedShip && assignedShip.id === updatedShipId ? assignedShip : await resolveShipAssignment(updatedShipId))
      : null;
    const updatedShipDetails = updatedShip
      ? {
          id: updatedShip.id,
          nome: updatedShip.nome,
          matricula: updatedShip.matricula,
          tipoPesca: updatedShip.tipoPesca,
          tipoNavio: updatedShip.tipoNavio,
          ilha: updatedShip.ilha,
          portoRegisto: updatedShip.portoRegisto,
          proprietario: updatedShip.proprietario,
          bandeira: updatedShip.bandeira,
          mmsi: updatedShip.mmsi,
          imo: updatedShip.imo,
          callSignal: updatedShip.callSignal,
          hruReferencia: updatedShip.hruReferencia || null,
          hruValidade: updatedShip.hruValidade || null,
          radarReflector: updatedShip.radarReflector || null,
          radarReflectorValidade: updatedShip.radarReflectorValidade || null,
          cliente: updatedShip.cliente
            ? {
                id: updatedShip.cliente.id,
                nome: updatedShip.cliente.nome,
                ilha: updatedShip.cliente.ilha,
              }
            : null,
        }
      : null;
    const updatedOwnerDisplay = String(updated.owner || "").trim()
      || updatedShip?.cliente?.nome
      || null;
    const updatedOwnerClientId = updatedShip?.cliente?.id ?? null;

    let artigosPersistidos: ReturnType<typeof toClientArtigo>[] = [];
    if (artigoJangadaDelegate) {
      artigosPersistidos = await loadArtigosPersistidosLean(artigoJangadaDelegate, id);
    }

    if (
      expectedDeliveryDate !== undefined
      || delivered !== undefined
      || deliveredAt !== undefined
      || serviceStationStatus !== undefined
      || readyForDelivery !== undefined
      || deliveryMethod !== undefined
    ) {
      const latestQueue = await prisma.serviceStationQueue.findFirst({
        where: { jangadaId: id },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, observacoes: true, status: true, ordemServicoId: true },
      });

      const nextDeliveredAt = deliveredAt !== undefined
        ? deliveredAt
        : delivered !== undefined
          ? (delivered ? new Date().toISOString() : null)
          : undefined;

      const previousQueueStatus = normalizeJangadaQueueStatus(latestQueue?.status) || 'aguardar';
      const nextQueueStatus = serviceStationStatus !== undefined
        ? serviceStationStatus
        : (nextDeliveredAt ? 'finalizada' : previousQueueStatus);
      const nextReadyForDelivery = readyForDelivery !== undefined
        ? readyForDelivery
        : nextDeliveredAt
          ? false
          : serviceStationStatus !== undefined
            ? nextQueueStatus === 'finalizada'
            : undefined;

      if (latestQueue?.id) {
        const nextObservacoes = nextDeliveredAt !== undefined
          ? mergeJangadaQueueLogisticsMeta(latestQueue.observacoes, {
              workflowStatus: nextQueueStatus,
              deliveredAt: nextDeliveredAt,
              readyForDelivery: nextDeliveredAt ? false : nextReadyForDelivery,
              deliveryMethod: deliveryMethod,
            })
          : (serviceStationStatus !== undefined || readyForDelivery !== undefined || deliveryMethod !== undefined)
            ? mergeJangadaQueueLogisticsMeta(latestQueue.observacoes, {
                workflowStatus: nextQueueStatus,
                readyForDelivery: nextReadyForDelivery,
                deliveryMethod: deliveryMethod,
              })
            : undefined;

        await prisma.serviceStationQueue.update({
          where: { id: latestQueue.id },
          data: {
            ...(expectedDeliveryDate !== undefined ? { dataPrevistaEntrega: expectedDeliveryDate } : {}),
            ...(nextObservacoes !== undefined ? { observacoes: nextObservacoes } : {}),
            ...((serviceStationStatus !== undefined || nextDeliveredAt !== undefined) ? { status: nextQueueStatus } : {}),
          },
          select: { id: true },
        });

        if (expectedDeliveryDate !== undefined && latestQueue.ordemServicoId) {
          await prisma.ordemServico.update({
            where: { id: latestQueue.ordemServicoId },
            data: { dataPrevista: expectedDeliveryDate },
          });
        }
      } else if (expectedDeliveryDate || nextDeliveredAt || serviceStationStatus !== undefined || readyForDelivery !== undefined || deliveryMethod !== undefined) {
        await prisma.serviceStationQueue.create({
          data: {
            jangadaId: id,
            ...(existing.serviceStationId ? { serviceStationId: existing.serviceStationId } : {}),
            status: nextQueueStatus || (nextDeliveredAt ? 'finalizada' : 'aguardar'),
            dataPrevistaEntrega: expectedDeliveryDate,
            observacoes: mergeJangadaQueueLogisticsMeta('', {
              workflowStatus: nextQueueStatus || (nextDeliveredAt ? 'finalizada' : 'aguardar'),
              deliveredAt: nextDeliveredAt,
              readyForDelivery: nextDeliveredAt ? false : nextReadyForDelivery,
              deliveryMethod: deliveryMethod,
            }),
          },
          select: { id: true },
        });
      }
    }

    const nextDeliveredAtValue = deliveredAt !== undefined
      ? deliveredAt
      : delivered !== undefined
        ? (delivered ? new Date().toISOString() : null)
        : undefined;

    if (nextDeliveredAtValue) {
      await clearActiveAgendaForRaft({ jangadaId: id });
      await clearEntregaAgendaEvent({ jangadaId: id });
      syncAgendaToGoogleCalendar().catch((error) => {
        console.error('[jangadas] Falha ao sincronizar Google Calendar após entrega:', error);
      });
    } else if (expectedDeliveryDate !== undefined) {
      await syncEntregaAgendaEvent({ jangadaId: id, dataPrevistaEntrega: expectedDeliveryDate });
    }

    if (nextDeliveredAtValue) {
      let transitario = '';
      try {
        const qQueue = await prisma.serviceStationQueue.findFirst({
          where: { jangadaId: id },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: { observacoes: true },
        });
        const parsedQueue = qQueue?.observacoes ? JSON.parse(qQueue.observacoes) as Record<string, unknown> : {};
        if (parsedQueue && typeof parsedQueue === 'object' && typeof parsedQueue.transitario === 'string') {
          transitario = String(parsedQueue.transitario);
        }
      } catch (error) {
        console.error('[jangadas] Erro ao ler transitário para SMS:', error);
      }
      await tryNotifySms(() => notifyJangadaEnviada(id, { transitario }));
    }

    if (serviceStationStatus !== undefined && serviceStationStatus === 'finalizada') {
      await syncNextInspectionAgenda({
        jangadaId: id,
        tecnico: access.email || 'sistema',
      });
    }

    const latestQueue = await prisma.serviceStationQueue.findFirst({
      where: { jangadaId: id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { dataPrevistaEntrega: true, updatedAt: true, status: true, observacoes: true },
    });
    const latestQueueMeta = parseJangadaQueueLogisticsMeta(latestQueue?.observacoes);

    const resolvedMandatoryPack = await resolveMandatoryPackItemsForRaftAsync({
      brand: updated.brand,
      model: updated.model,
      packType: updated.packType,
      capacity: updated.capacity,
    });

    const serviceBulletinsApplied = hasServiceBulletinsApplied
      ? await writeServiceBulletinsApplied(id, data?.serviceBulletinsApplied)
      : await readServiceBulletinsApplied(id);
    const inspectionChecklistValues = hasInspectionChecklistValues
      ? await writeInspectionChecklistValues(id, data?.inspectionChecklistValues)
      : await readInspectionChecklistValues(id);
    const observacoes = hasObservacoes
      ? await writeJangadaObservacoes(id, data?.observacoes)
      : await readJangadaObservacoes(id);

    return NextResponse.json({
      ...updated,
      brand: normalizeBrandName(updated.brand, updated.model),
      model: normalizeRaftModel(updated.model, updated.brand, updated.packType),
      cylinderSistema: canonicalizeCylinderSistema(updated.cylinderSistema),
      shipNameManual: updatedShip?.nome || updated.shipNameManual || "",
      ownerDisplay: updatedOwnerDisplay,
      ownerClientId: updatedOwnerClientId,
      shipDetails: updatedShipDetails,
      serviceStationStatus: normalizeJangadaQueueStatus(latestQueue?.status) || null,
      serviceStationWorkflowStatus: latestQueueMeta.workflowStatus || null,
      readyForDelivery: Boolean(latestQueueMeta.readyForDelivery),
      deliveryMethod: latestQueueMeta.deliveryMethod || null,
      expectedDeliveryDate: latestQueue?.dataPrevistaEntrega ? latestQueue.dataPrevistaEntrega.toISOString().slice(0, 10) : null,
      delivered: Boolean(latestQueueMeta.deliveredAt),
      deliveredAt: latestQueueMeta.deliveredAt || null,
      statusSetAt: latestQueue?.updatedAt ? latestQueue.updatedAt.toISOString() : null,
      artigos: artigosPersistidos.length > 0 ? artigosPersistidos : parseArtigosFromText((updated as { artigos?: unknown }).artigos),
      mandatoryPackItems: resolvedMandatoryPack.items,
      mandatoryPackSource: resolvedMandatoryPack.source,
      customPackDefinition: resolvedMandatoryPack.customPack,
      applicableServiceBulletins: getApplicableServiceBulletinsForRaft(updated),
      serviceBulletinsApplied,
      inspectionChecklistValues,
      observacoes,
    });
  } catch (err: unknown) {
    return buildDatabaseErrorResponse(err, err instanceof Error ? err.message : "Erro ao atualizar jangada");
  }
}
