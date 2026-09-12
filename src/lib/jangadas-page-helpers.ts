import { getRecognizedPackTypeOptions } from "@/config/packTemplates";
import { certificateItemHasManagedValidity } from "@/lib/certificate-validity";
import { findRaftTechnicalModel, raftModelData } from "@/modules/rafts/raftModelData";
import { findMatchingArticleForPackItem, getMandatoryPackItemsForRaft } from "@/modules/rafts/mandatoryPack";
import type { Jangada, PausedInspectionDraftMeta, JangadaListColumnKey } from "@/types/jangadas-page";
import { JANGADA_LIST_COLUMNS } from "@/types/jangadas-page";

export function normalizeTechnicalSearchValue(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildDefaultJangadaColumns(): Record<JangadaListColumnKey, boolean> {
  return JANGADA_LIST_COLUMNS.reduce((acc, col) => {
    acc[col.key] = true;
    return acc;
  }, {} as Record<JangadaListColumnKey, boolean>);
}

export function getShortBulletinLabels(jangada: Jangada, limit?: number): string[] {
  const labels = Array.isArray(jangada.applicableServiceBulletinTitles)
    ? jangada.applicableServiceBulletinTitles
        .map((label) => String(label || "").trim())
        .filter(Boolean)
    : [];

  const uniqueLabels = Array.from(new Set(labels));

  return typeof limit === "number" ? uniqueLabels.slice(0, limit) : uniqueLabels;
}

export function formatMonthYear(value?: string | null): string {
  if (!value) return "-";
  const normalized = value.trim();
  const match = normalized.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}/${match[1]}`;
  return normalized;
}

export function formatInspectionDate(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toLocaleDateString("pt-PT");
}

export function isInspectionOverdue(value?: string): boolean {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return false;
  return parsed < Date.now();
}

export function isInspectionDueWithin30Days(value?: string): boolean {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return false;
  const now = Date.now();
  const limit = now + 30 * 24 * 60 * 60 * 1000;
  return parsed <= limit;
}

export function isHydroTestOverdue(value?: string): boolean {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return false;
  return parsed < Date.now();
}

export function isHydroTestDueWithin30Days(value?: string): boolean {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return false;
  const now = Date.now();
  const limit = now + 30 * 24 * 60 * 60 * 1000;
  return parsed >= now && parsed <= limit;
}

export function isHruOverdue(value?: string): boolean {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return false;
  return parsed < Date.now();
}

export function isHruDueWithin30Days(value?: string): boolean {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return false;
  const now = Date.now();
  const limit = now + 30 * 24 * 60 * 60 * 1000;
  return parsed >= now && parsed <= limit;
}

export function isHruCritical(value?: string): boolean {
  return isHruOverdue(value) || isHruDueWithin30Days(value);
}

export function getArticleStatusSummary(j: Jangada) {
  let expiredCount = 0;
  let upcomingCount = 0;
  const now = new Date();

  const upcoming = getUpcomingReplacementArticles(j);
  upcomingCount = upcoming.length;

  for (const art of j.artigos || []) {
    const valDate = parseArticleValidityDate(art.validade);
    if (valDate && valDate < now) {
      expiredCount++;
    }
  }

  return { expiredCount, upcomingCount };
}

export function calculateComplianceSummary(j: Jangada) {
  const mandatoryItems = getMandatoryPackItemsForRaft({
    brand: j.brand,
    model: j.model,
    packType: j.packType,
    capacity: j.capacity,
  });

  const total = mandatoryItems.length;
  let complete = 0;
  let incomplete = 0;
  let missing = 0;
  let expired = 0;
  const now = new Date();

  for (const item of mandatoryItems) {
    const matched = findMatchingArticleForPackItem(item, j.artigos || []);
    if (!matched) {
      missing++;
    } else {
      const presentQty = Number(matched.quantidade || 0);
      const isComplete = presentQty >= item.quantity;
      if (isComplete) {
        complete++;
      } else {
        incomplete++;
      }

      const valDate = parseArticleValidityDate(matched.validade);
      if (valDate && valDate < now) {
        expired++;
      }
    }
  }

  const percent = total > 0 ? Math.round((complete / total) * 100) : 100;

  return { total, complete, incomplete, missing, expired, percent };
}

export function normalizeMonthYearValue(value?: string | null) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-");
    const m = Number(month);
    if (Number.isInteger(m) && m >= 1 && m <= 12) {
      return `${year}-${String(m).padStart(2, "0")}`;
    }
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);

  const monthYearMatch = raw.match(/^(\d{2})[/-](\d{4})$/);
  if (monthYearMatch) {
    const month = Number(monthYearMatch[1]);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      return `${monthYearMatch[2]}-${String(month).padStart(2, "0")}`;
    }
    return "";
  }

  const compactDigitsMatch = raw.match(/^(\d{2})(\d{4})$/);
  if (compactDigitsMatch) {
    const month = Number(compactDigitsMatch[1]);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      return `${compactDigitsMatch[2]}-${String(month).padStart(2, "0")}`;
    }
    return "";
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  return "";
}

export function parseArticleValidityDate(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalizedMonthYear = normalizeMonthYearValue(raw);
  if (normalizedMonthYear) {
    const [yearText, monthText] = normalizedMonthYear.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      return new Date(year, month, 0);
    }
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function getUpcomingReplacementArticles(jangada: Jangada) {
  const nextInspectionParsed = Date.parse(String(jangada.dataProxInspecao || ""));
  if (Number.isNaN(nextInspectionParsed)) return [];

  const nextInspectionDate = new Date(nextInspectionParsed);
  const thresholdDate = addMonths(nextInspectionDate, 12);
  const mandatoryValidityItems = getMandatoryPackItemsForRaft({
    brand: jangada.brand,
    model: jangada.model,
    packType: jangada.packType,
    capacity: jangada.capacity,
  }).filter((item) => Boolean(item.validityFieldName));
  const shouldRestrictToMandatoryPack = mandatoryValidityItems.length > 0;

  return (jangada.artigos || [])
    .map((artigo) => {
      if (!certificateItemHasManagedValidity(artigo.name)) return null;
      if (
        shouldRestrictToMandatoryPack &&
        !mandatoryValidityItems.some((item) => findMatchingArticleForPackItem(item, [artigo]))
      ) {
        return null;
      }

      const validadeDate = parseArticleValidityDate(artigo.validade);
      if (!validadeDate) return null;
      if (validadeDate > thresholdDate) return null;

      return {
        ...artigo,
        validadeDate,
        expiresBeforeInspection: validadeDate < nextInspectionDate,
      };
    })
    .filter((artigo): artigo is NonNullable<typeof artigo> => Boolean(artigo))
    .sort((a, b) => a.validadeDate.getTime() - b.validadeDate.getTime());
}

export function aggregateUpcomingReplacementArticles(
  artigos: ReturnType<typeof getUpcomingReplacementArticles>
) {
  const grouped = new Map<
    string,
    {
      key: string;
      name: string;
      referencia?: string | null;
      quantidadeTotal: number;
      validadeDate: Date;
      hasMultipleValidityDates: boolean;
      expiresBeforeInspection: boolean;
    }
  >();

  for (const artigo of artigos) {
    const name = String(artigo.name || 'Artigo sem nome').trim() || 'Artigo sem nome';
    const referencia = artigo.referencia ? String(artigo.referencia).trim() : '';
    const key = `${name.toUpperCase()}::${referencia.toUpperCase()}`;
    const quantidadeAtual = Number(artigo.quantidade);
    const quantidade = Number.isFinite(quantidadeAtual) && quantidadeAtual > 0 ? quantidadeAtual : 1;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        name,
        referencia: referencia || null,
        quantidadeTotal: quantidade,
        validadeDate: artigo.validadeDate,
        hasMultipleValidityDates: false,
        expiresBeforeInspection: Boolean(artigo.expiresBeforeInspection),
      });
      continue;
    }

    existing.quantidadeTotal += quantidade;
    if (artigo.validadeDate.getTime() !== existing.validadeDate.getTime()) {
      existing.hasMultipleValidityDates = true;
      if (artigo.validadeDate.getTime() < existing.validadeDate.getTime()) {
        existing.validadeDate = artigo.validadeDate;
      }
    }
    existing.expiresBeforeInspection =
      existing.expiresBeforeInspection || Boolean(artigo.expiresBeforeInspection);
  }

  return Array.from(grouped.values()).sort((a, b) => a.validadeDate.getTime() - b.validadeDate.getTime());
}

export function getInspectionUrgencyRank(value?: string): number {
  if (isInspectionOverdue(value)) return 0;
  if (isInspectionDueWithin30Days(value)) return 1;
  return 2;
}

export function getPausedInspectionRank(meta?: PausedInspectionDraftMeta): number {
  return meta?.savedAt ? 0 : 1;
}

export function loadPausedInspectionDraftsByRaft(): Record<number, PausedInspectionDraftMeta> {
  if (typeof window === "undefined") return {};

  const drafts: Record<number, PausedInspectionDraftMeta> = {};

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith("jangada:") || !key.endsWith(":paused-inspection-draft")) continue;

    const raftIdRaw = key.split(":")[1];
    const raftId = Number(raftIdRaw);
    if (!Number.isFinite(raftId) || raftId <= 0) continue;

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PausedInspectionDraftMeta;
      if (!parsed?.savedAt) continue;
      drafts[raftId] = {
        savedAt: parsed.savedAt,
        inspectionWizardStep: Number(parsed.inspectionWizardStep || 0),
      };
    } catch {
      // ignorar rascunhos inválidos
    }
  }

  return drafts;
}

export function formatPausedInspectionLabel(savedAt: number): string {
  return new Date(savedAt).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getInflationSystemLabel(jangada: Pick<Jangada, "brand" | "model">): string {
  const technicalModel = findRaftTechnicalModel(jangada.brand, jangada.model);
  if (!technicalModel) return "—";

  const keyValue = technicalModel.keyTechnicalData?.inflationSystem?.trim();
  if (keyValue) return keyValue;

  if (technicalModel.inflationSystem && technicalModel.inflationSystem.length > 0) {
    return technicalModel.inflationSystem.join(" / ");
  }

  return "—";
}

export function hasAssociationValue(value?: string | null) {
  return Boolean(String(value || "").trim());
}

export function getJangadaAssociationTone(jangada: Jangada): "green" | "yellow" | "red" | "neutral" {
  const hasJangada = Boolean(jangada.id) || hasAssociationValue(jangada.serial);
  const hasNavio = Boolean(jangada.shipId) || hasAssociationValue(jangada.shipNameManual) || hasAssociationValue(jangada.navio?.nome);
  const hasCliente = hasAssociationValue(jangada.navio?.cliente?.nome) || hasAssociationValue(jangada.owner);

  if (hasJangada && hasNavio && hasCliente) return "green";
  if (hasJangada && hasNavio && !hasCliente) return "yellow";
  if (hasJangada && !hasNavio && !hasCliente) return "red";
  return "neutral";
}

export function getJangadaAssociationRowClassName(jangada: Jangada): string {
  const tone = getJangadaAssociationTone(jangada);

  if (tone === "green") return "bg-emerald-50";
  if (tone === "yellow") return "bg-yellow-50";
  if (tone === "red") return "bg-red-50";
  return "";
}

export function normalizeModelFilterKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, "")
    .toUpperCase();
}

export function normalizeModelFilterLabel(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function stripRaftConfigSuffix(key: string): string {
  if (key.length > 2 && (key.endsWith("TO") || key.endsWith("DL"))) return key.slice(0, -2);
  return key;
}

export function normalizeModelMatchKey(value: unknown): string {
  return stripRaftConfigSuffix(normalizeModelFilterKey(value));
}

export function canonicalizeRaftModelLabel(brand: unknown, model: unknown): string | null {
  const key = normalizeModelMatchKey(model);
  if (!key) return null;
  const brandKey = normalizeModelFilterKey(brand);

  const models = (
    Object.entries(raftModelData) as Array<[string, Array<{ name: string; aliases?: string[] }>]>
  )
    .filter(([catalogBrand]) => {
      const candidateBrandKey = normalizeModelFilterKey(catalogBrand);
      return (
        !brandKey ||
        candidateBrandKey === brandKey ||
        candidateBrandKey.includes(brandKey) ||
        brandKey.includes(candidateBrandKey)
      );
    })
    .flatMap(([, entries]) => entries);

  const match = models.find((entry) => {
    if (normalizeModelMatchKey(entry.name) === key) return true;
    return (entry.aliases || []).some((alias) => normalizeModelMatchKey(alias) === key);
  });

  return match ? match.name : null;
}

export function uniqueNormalizedLabels(values: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const label = String(value || "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    const key = normalizeModelFilterKey(label);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, label);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "pt-PT"));
}

export function getArtigosStatus(artigos?: any[]): "green" | "yellow" | "red" | "gray" {
  if (!artigos || artigos.length === 0) return "gray";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const limit90d = new Date(today);
  limit90d.setDate(limit90d.getDate() + 90);

  let hasExpired = false;
  let hasExpiringSoon = false;

  for (const art of artigos) {
    if (!art.validade) continue;

    const valDate = new Date(art.validade);
    if (isNaN(valDate.getTime())) continue;

    if (valDate < today) {
      hasExpired = true;
      break;
    } else if (valDate <= limit90d) {
      hasExpiringSoon = true;
    }
  }

  if (hasExpired) return "red";
  if (hasExpiringSoon) return "yellow";
  return "green";
}

export function normalizeLaunchTypeValue(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized === "to" || normalized.includes("throw")) return "TO";
  if (normalized === "dl" || normalized.includes("davit")) return "DL";
  if (normalized === "sr" || normalized.includes("self-right") || normalized.includes("self right")) return "SR";

  return raw.toUpperCase();
}

export function normalizeCapacityValue(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
}

export function formatCapacityValue(value: unknown): string {
  const normalized = normalizeCapacityValue(value);
  return normalized === null ? "—" : String(normalized);
}

export function getSuggestedLaunchType(configuration?: string[] | null) {
  return (configuration || [])
    .map((item) => normalizeLaunchTypeValue(item))
    .find(Boolean) || "";
}

export function getSuggestedPackType(packTypes?: string[] | null) {
  return getRecognizedPackTypeOptions((packTypes || []).map((item) => String(item || "").trim())).find(Boolean) || "";
}

export function getSuggestedCapacity(specifications?: Array<{ capacity: number }> | null) {
  return (specifications || [])
    .map((item) => normalizeCapacityValue(item?.capacity))
    .find((value): value is number => value !== null) || null;
}
