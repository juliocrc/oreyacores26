import type { ChecklistField, ChecklistRaftInput } from "@/modules/inspectionChecklist";
import { type HeaderFieldKey, type HeaderFields, type InspectionChecklistValues, type Row, HEADER_LABEL_HINTS, HEADER_LOOKUP_TERMS, REQUIRED_CHECKLIST_FIELD_NAMES, REQUIRED_HEADER_FIELDS } from "@/types/ia-importacao-page";

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function normalizeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

export function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function asPositiveInt(value: unknown): number | undefined {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

export function toIsoDate(value: unknown): string | undefined {
  const text = asText(value);
  if (!text) return undefined;

  // DD/MM/AAAA e DD-MM-AAAA (dia primeiro) antes de qualquer fallback genérico:
  // o construtor Date do JS interpreta "05/06/2025" como MM/DD e troca dia/mês.
  const dayFirst = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dayFirst) {
    const [, dd, mm, yyyy] = dayFirst;
    const day = Number(dd);
    const month = Number(mm);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const mmYyyyMatch = text.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (mmYyyyMatch) {
    const [, mm, yyyy] = mmYyyyMatch;
    const month = Number(mm);
    if (month >= 1 && month <= 12) return `${yyyy}-${String(month).padStart(2, "0")}-01`;
  }

  const mmYyMatch = text.match(/^(\d{1,2})[\/-](\d{2})$/);
  if (mmYyMatch) {
    const [, mm, yy] = mmYyMatch;
    const month = Number(mm);
    if (month >= 1 && month <= 12) return `20${yy}-${String(month).padStart(2, "0")}-01`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return text;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function findRowValue(row: Row, terms: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    const keyNorm = normalizeKey(key);
    if (terms.some((term) => keyNorm.includes(term))) {
      const text = normalizeCell(value).trim();
      if (text) return text;
    }
  }
  return "";
}

export function rowHasManufacturingDateMarker(row: Row): boolean {
  const rowText = Object.entries(row)
    .map(([key, value]) => `${normalizeCell(key)} ${normalizeCell(value)}`.trim())
    .join(" ");
  const normalized = normalizeKey(rowText);
  return (
    normalized.includes("data fabrico") ||
    normalized.includes("manuf date") ||
    normalized.includes("fabrication date")
  );
}

export function findAnyDateInRow(row: Row): string | undefined {
  for (const value of Object.values(row)) {
    const iso = toIsoDate(value);
    if (iso) return iso;
  }
  return undefined;
}

export function detectKnownArticleNameFromRow(row: Row): string {
  const rowText = Object.entries(row)
    .map(([key, value]) => `${normalizeCell(key)} ${normalizeCell(value)}`.trim())
    .join(" ");
  const normalized = normalizeKey(rowText);

  const matchers: Array<{ tokens: string[]; label: string }> = [
    { tokens: ["fachos de mao", "fachos mao", "hand flare", "red hand flare"], label: "Fachos de Mão" },
    { tokens: ["paraquedas", "foguete paraquedas", "parachute rocket"], label: "Foguetes Paraquedas" },
    { tokens: ["farmacia", "first aid", "primeiros socorros", "ambulancia", "ambulância"], label: "Farmácia Solas" },
    { tokens: ["comprimidos", "enjoo", "seasickness", "anti sea sickness"], label: "Comprimidos p/ Enjoo" },
    { tokens: ["agua potavel", "drinking water", "water"], label: "Saco de Água" },
    { tokens: ["racoes", "food ration", "racao alimentar"], label: "Rações Alimentares 0,5 Kg" },
    { tokens: ["potes de fumo", "smoke signal", "fumigeno"], label: "Potes de Fumo" },
    { tokens: ["pilhas lanterna", "torch batteries"], label: "Pilhas para Lanterna" },
    { tokens: ["lanterna", "torch"], label: "Lanterna" },
  ];

  const found = matchers.find((matcher) =>
    matcher.tokens.some((token) => normalized.includes(normalizeKey(token))),
  );

  return found?.label || "";
}

export function extractChecklistArticles(rows: Row[]) {
  const seen = new Set<string>();

  return rows.reduce<Array<{ name?: string; validade?: string; quantidade?: number; referencia?: string }>>((acc, row) => {
    const name =
      findRowValue(row, ["item", "artigo", "descricao", "material", "conteudo", "content"]) ||
      detectKnownArticleNameFromRow(row) ||
      "";
    const validade =
      toIsoDate(findRowValue(row, ["validade", "expiry", "vencimento", "validity"])) ||
      findAnyDateInRow(row) ||
      undefined;
    const referencia = findRowValue(row, ["referencia", "ref", "codigo"]) || undefined;
    const quantidade = asPositiveInt(findRowValue(row, ["quantidade", "qty", "qtd"]));

    if (!name) return acc;
    if (rowHasManufacturingDateMarker(row)) return acc;

    const key = `${name}__${validade || ""}__${referencia || ""}`.toLowerCase();
    if (seen.has(key)) return acc;
    seen.add(key);

    acc.push({
      name,
      validade,
      quantidade,
      referencia,
    });
    return acc;
  }, []);
}

export function buildChecklistPreviewInput(header: HeaderFields, rows: Row[]): ChecklistRaftInput {
  return {
    serial: asText(header.raftSerial) || undefined,
    brand: asText(header.brand) || undefined,
    model: asText(header.model) || undefined,
    capacity: asPositiveInt(header.capacity),
    owner: asText(header.ownerName) || undefined,
    packType: asText(header.emergencyPackType) || undefined,
    dataInspecao: toIsoDate(header.dataInspecao) || asText(header.dataInspecao) || undefined,
    dataProxInspecao: toIsoDate(header.dataProxInspecao) || asText(header.dataProxInspecao) || undefined,
    shipNameManual: asText(header.shipName) || undefined,
    cylinder: {
      serial: asText(header.cylinderSerial) || undefined,
      co2: asText(header.cylinderCo2) || undefined,
      n2: asText(header.cylinderN2) || undefined,
      tara: asText(header.cylinderTara) || undefined,
      pesoBruto: asText(header.cylinderPesoBruto) || undefined,
      sistema: asText(header.cylinderSistema) || undefined,
    },
    artigos: extractChecklistArticles(rows),
  };
}

export function formatChecklistFieldValue(value: string | number | boolean | undefined, type: "text" | "number" | "checkbox" | "date" | "select") {
  if (type === "checkbox") {
    return value ? "Conforme" : "Pendente";
  }
  const text = value == null ? "" : String(value).trim();
  return text || "—";
}

export function headerFieldIsMissing(field: HeaderFieldKey, header: HeaderFields) {
  return REQUIRED_HEADER_FIELDS.includes(field) && !asText(header[field]);
}

export function fieldHasMeaningfulValue(value: string | number | boolean | undefined, type: ChecklistField["type"]) {
  if (type === "checkbox") return Boolean(value);
  return String(value ?? "").trim().length > 0;
}

export function checklistFieldIsRequired(field: ChecklistField) {
  return Boolean(field.required) || REQUIRED_CHECKLIST_FIELD_NAMES.has(field.name);
}

export function checklistFieldIsMissing(field: ChecklistField, value: string | number | boolean | undefined) {
  return !fieldHasMeaningfulValue(value, field.type);
}

export function normalizeInspectionChecklistValues(raw: unknown): InspectionChecklistValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  return Object.entries(raw as Record<string, unknown>).reduce<InspectionChecklistValues>((acc, [key, value]) => {
    if (!key) return acc;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function normalizeKey(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sanitizeExtractedCandidate(value: string): string {
  return String(value || "")
    .replace(/^[\s:;\-–—]+/, "")
    .replace(/[\s:;\-–—]+$/, "")
    .trim();
}

export function looksLikeHeaderLabel(value: string): boolean {
  const norm = normalizeKey(value);
  if (!norm) return false;

  if (/^[a-z\s]{2,18}$/.test(norm) && HEADER_LABEL_HINTS.some((hint) => norm === normalizeKey(hint))) {
    return true;
  }

  return HEADER_LABEL_HINTS.some((hint) => {
    const normHint = normalizeKey(hint);
    return norm === normHint || norm.startsWith(`${normHint} `) || norm.endsWith(` ${normHint}`);
  });
}

export function hasAnyDigit(value: string): boolean {
  return /\d/.test(value);
}

export function isValidHeaderFieldCandidate(field: HeaderFieldKey, value: string): boolean {
  const text = sanitizeExtractedCandidate(value);
  if (!text) return false;
  if (looksLikeHeaderLabel(text)) return false;

  switch (field) {
    case "capacity":
      return Boolean(parseHeaderCapacity(text));
    case "dataInspecao":
    case "dataProxInspecao":
      return Boolean(normalizeHeaderDateCandidate(text));
    case "cylinderCo2":
    case "cylinderN2":
    case "cylinderTara":
    case "cylinderPesoBruto":
      return hasAnyDigit(text);
    case "certificadoNumero":
      return text.length >= 3 && hasAnyDigit(text);
    case "raftSerial":
    case "cylinderSerial":
      return text.length >= 3 && /[a-z0-9]/i.test(text);
    case "shipName":
    case "ownerName":
      return text.length >= 3 && !/^serial\b/i.test(text) && !/^date\b/i.test(text);
    case "brand":
      return text.length >= 2 && !/serial|date|contents/i.test(text);
    case "model":
      return text.length >= 2 && !/serial no|date of manuf|inspection|verification/i.test(text);
    case "emergencyPackType":
      return text.length >= 2 && !/serial|date|owner|ship/i.test(text);
    case "cylinderSistema":
      return text.length >= 2 && !/serial|date/i.test(text);
    default:
      return text.length > 0;
  }
}

export function normalizeHeaderDateCandidate(value: string): string {
  const text = sanitizeExtractedCandidate(value);
  if (!text) return "";

  const dayFirst = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dayFirst) {
    const [, dd, mm, yyyy] = dayFirst;
    const day = Number(dd);
    const month = Number(mm);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const mmYyyyMatch = text.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (mmYyyyMatch) {
    const [, mm, yyyy] = mmYyyyMatch;
    const month = Number(mm);
    if (month >= 1 && month <= 12) return `${yyyy}-${String(month).padStart(2, "0")}-01`;
  }

  const mmYyMatch = text.match(/^(\d{1,2})[\/-](\d{2})$/);
  if (mmYyMatch) {
    const [, mm, yy] = mmYyMatch;
    const month = Number(mm);
    if (month >= 1 && month <= 12) return `20${yy}-${String(month).padStart(2, "0")}-01`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return text;

  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const excelEpochUtc = Date.UTC(1899, 11, 30);
      const converted = new Date(excelEpochUtc + serial * 24 * 60 * 60 * 1000);
      return converted.toISOString().slice(0, 10);
    }
  }

  return "";
}

export function parseHeaderCapacity(value: string): string {
  const text = sanitizeExtractedCandidate(value);
  if (!text) return "";

  const normalized = normalizeKey(text);
  const match = normalized.match(/\b(\d{1,3})\b/);
  if (!match) return "";

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 200) return "";
  return String(Math.floor(amount));
}

export function matchesTerms(normalizedText: string, normalizedTerms: string[]): boolean {
  return normalizedTerms.some((term) => normalizedText.includes(term));
}

export function pickNeighborCandidates(cells: string[], index: number, normalizedTerms: string[]): Array<{ value: string; score: number }> {
  const lookups = [1, 2, -1, -2];
  const candidates: Array<{ value: string; score: number }> = [];

  for (const delta of lookups) {
    const neighbor = sanitizeExtractedCandidate(cells[index + delta] || "");
    if (!neighbor) continue;
    const norm = normalizeKey(neighbor);
    if (!norm) continue;
    if (matchesTerms(norm, normalizedTerms)) continue;
    if (looksLikeHeaderLabel(neighbor)) continue;
    const score = delta > 0 ? (Math.abs(delta) === 1 ? 5 : 4) : (Math.abs(delta) === 1 ? 3 : 2);
    candidates.push({ value: neighbor, score });
  }
  return candidates;
}

export function collectHeaderCandidates(rows: Row[], terms: string[]): Array<{ value: string; score: number; rowIndex: number }> {
  const normalizedTerms = terms
    .map((term) => normalizeKey(term))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const candidates: Array<{ value: string; score: number; rowIndex: number }> = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const entries = Object.entries(row);

    for (const [key, value] of entries) {
      const keyNorm = normalizeKey(key);
      if (!matchesTerms(keyNorm, normalizedTerms)) continue;
      const text = sanitizeExtractedCandidate(normalizeCell(value));
      if (!text || looksLikeHeaderLabel(text)) continue;
      candidates.push({ value: text, score: 8, rowIndex });
    }

    const cells = entries.map(([, value]) => sanitizeExtractedCandidate(normalizeCell(value)));
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (!cell) continue;
      const cellNorm = normalizeKey(cell);
      if (!matchesTerms(cellNorm, normalizedTerms)) continue;

      const parts = cell.split(/[:：]/);
      if (parts.length > 1) {
        const inlineValue = sanitizeExtractedCandidate(parts.slice(1).join(":"));
        if (inlineValue) {
          const inlineNorm = normalizeKey(inlineValue);
          if (!matchesTerms(inlineNorm, normalizedTerms) && !looksLikeHeaderLabel(inlineValue)) {
            candidates.push({ value: inlineValue, score: 7, rowIndex });
          }
        }
      }

      const neighborCandidates = pickNeighborCandidates(cells, i, normalizedTerms);
      neighborCandidates.forEach((candidate) => {
        candidates.push({ value: candidate.value, score: candidate.score, rowIndex });
      });
    }
  }

  const deduped = new Map<string, { value: string; score: number; rowIndex: number }>();
  candidates.forEach((candidate) => {
    const key = normalizeKey(candidate.value);
    if (!key) return;
    const current = deduped.get(key);
    if (!current || candidate.score > current.score) {
      deduped.set(key, candidate);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex);
}

export function scoreHeaderCandidate(field: HeaderFieldKey, value: string): number {
  const text = sanitizeExtractedCandidate(value);
  if (!isValidHeaderFieldCandidate(field, text)) return -1;

  let score = 0;
  switch (field) {
    case "dataInspecao":
    case "dataProxInspecao":
      score += normalizeHeaderDateCandidate(text) ? 12 : 0;
      break;
    case "capacity":
      score += parseHeaderCapacity(text) ? 10 : 0;
      break;
    case "shipName":
    case "ownerName": {
      const norm = normalizeKey(text);
      if (/\d{4}/.test(norm)) score -= 3;
      if (/\bserial\b|\bco2\b|\bn2\b/.test(norm)) score -= 4;
      if (/[a-z]/i.test(text)) score += 4;
      if (text.split(/\s+/).length >= 2) score += 2;
      break;
    }
    case "brand":
    case "model":
      if (/\d/.test(text)) score += 1;
      if (/[a-z]/i.test(text)) score += 3;
      break;
    default:
      if (/[a-z0-9]/i.test(text)) score += 2;
      break;
  }

  return score;
}

export function normalizeResolvedHeaderValue(field: HeaderFieldKey, value: string): string {
  const text = sanitizeExtractedCandidate(value);
  if (!text) return "";

  if (field === "dataInspecao" || field === "dataProxInspecao") {
    return normalizeHeaderDateCandidate(text);
  }

  if (field === "capacity") {
    return parseHeaderCapacity(text);
  }

  return text;
}

export function resolveHeaderField(rows: Row[], field: HeaderFieldKey): string {
  const terms = HEADER_LOOKUP_TERMS[field];
  const candidates = collectHeaderCandidates(rows, terms);
  if (candidates.length === 0) return "";

  const ranked = candidates
    .map((candidate) => {
      const normalized = normalizeResolvedHeaderValue(field, candidate.value);
      if (!normalized) return null;
      const validationScore = scoreHeaderCandidate(field, normalized);
      if (validationScore < 0) return null;
      return {
        value: normalized,
        score: candidate.score + validationScore,
        rowIndex: candidate.rowIndex,
      };
    })
    .filter((candidate): candidate is { value: string; score: number; rowIndex: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex);

  return ranked[0]?.value || "";
}

export function inferHeader(rows: Row[]): HeaderFields {
  return {
    certificadoNumero: resolveHeaderField(rows, "certificadoNumero"),
    shipName: resolveHeaderField(rows, "shipName"),
    ownerName: resolveHeaderField(rows, "ownerName"),
    raftSerial: resolveHeaderField(rows, "raftSerial"),
    brand: resolveHeaderField(rows, "brand"),
    model: resolveHeaderField(rows, "model"),
    emergencyPackType: resolveHeaderField(rows, "emergencyPackType"),
    capacity: resolveHeaderField(rows, "capacity"),
    dataFabrico: resolveHeaderField(rows, "dataFabrico"),
    fabricType: resolveHeaderField(rows, "fabricType"),
    dataInspecao: resolveHeaderField(rows, "dataInspecao"),
    dataProxInspecao: resolveHeaderField(rows, "dataProxInspecao"),
    cylinderSerial: resolveHeaderField(rows, "cylinderSerial"),
    cylinderCo2: resolveHeaderField(rows, "cylinderCo2"),
    cylinderN2: resolveHeaderField(rows, "cylinderN2"),
    cylinderTara: resolveHeaderField(rows, "cylinderTara"),
    cylinderPesoBruto: resolveHeaderField(rows, "cylinderPesoBruto"),
    cylinderSistema: resolveHeaderField(rows, "cylinderSistema"),
  };
}
