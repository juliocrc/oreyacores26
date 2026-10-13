import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export const CONTACTOS_INTERNOS_PDF_SOURCE = "PDF Orey 2025-12-15";
export const DEFAULT_CONTACTOS_INTERNOS_PDF_PATH = path.resolve(
  process.cwd(),
  "Lista de contactos Orey@20251215.pdf"
);

type BaseContactoInternoImport = {
  categoria: string;
  empresa: string | null;
  localizacao: string | null;
  nome: string;
  email: string | null;
  telemovel: string | null;
  telefoneFixo: string | null;
  extensaoNos: string | null;
  extensaoVodafone: string | null;
  observacoes: string | null;
  ativo: boolean;
  fonte: string;
};

export type ImportedContactoInterno = BaseContactoInternoImport;

const EMAIL_START_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const EMAIL_SEGMENT_RE = /^(?:-|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?:\s*\/\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})*)$/i;
const SIMPLE_TRAILING_FIELD_RE = /^(.*?)(?:\s+)?(\d{3,5}|não tem|nao tem|-)\s*$/i;

const COMPANY_LOCATIONS: Record<string, string[]> = {
  Azimute: ["Setúbal", "Vialonga"],
  OTNI: ["ES Açores", "ES Alcantarilha", "ES Aveleda", "ES Vialonga", "Vialonga/Lisboa", "Vialonga"],
  OILWATER: ["Lisboa"],
  SOFEMA: ["Lisboa"],
  SCOA: ["Lisboa"],
};

const ROW_PATTERNS = Object.entries(COMPANY_LOCATIONS)
  .flatMap(([company, locations]) =>
    locations.map((location) => ({ company, location, regex: buildRowPrefixRegex(company, location) }))
  )
  .sort((a, b) => `${b.company} ${b.location}`.length - `${a.company} ${a.location}`.length);

function buildRowPrefixRegex(company: string, location: string) {
  const companyPattern = escapeRegExp(company);
  const locationPattern = location
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join("(?:\\s+|\\t+)");

  return new RegExp(
    `^${companyPattern}(?:\\s+|\\t+)${locationPattern}(?:\\s+|\\t+)([\\s\\S]+)$`,
    "i"
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/[\t\n\r]+/g, " ").replace(/\s+/g, " ").trim();
}

function maybeRepairEncoding(value: string) {
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    const repairedScore = (repaired.match(/[ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]/g) || []).length - (repaired.match(/[├┬�]/g) || []).length;
    const originalScore = (value.match(/[ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]/g) || []).length - (value.match(/[├┬�]/g) || []).length;
    return repairedScore > originalScore ? repaired : value;
  } catch {
    return value;
  }
}

function normalizeNullableValue(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  const comparable = normalized.toLowerCase();
  if (comparable === "-" || comparable === "não tem" || comparable === "nao tem") {
    return null;
  }

  return normalized;
}

function normalizeEmailValue(value: string | null | undefined) {
  const normalized = normalizeNullableValue(value);
  if (!normalized) return null;
  return normalized
    .split("/")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .join(" / ");
}

function normalizePhoneValue(value: string | null | undefined) {
  const normalized = normalizeNullableValue(value);
  if (!normalized) return null;
  return normalized.replace(/\s+/g, " ").trim();
}

function normalizeExtensionValue(value: string | null | undefined) {
  const normalized = normalizeNullableValue(value);
  if (!normalized) return null;
  return normalized;
}

function isMobileLikeValue(value: string) {
  const normalized = normalizeNullableValue(value);
  if (!normalized) {
    return true;
  }

  return /^\d(?:[\d ]*\d)?$/.test(normalized);
}

function extractLeadingMobileField(source: string) {
  const trimmed = normalizeWhitespace(source);
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("-")) {
    return {
      value: "-",
      rest: trimmed.slice(1).trim(),
    };
  }

  const phoneMatch = trimmed.match(/^(\d(?:[\d ]*\d)?)(?:\s+|$)(.*)$/);
  if (!phoneMatch) {
    return null;
  }

  return {
    value: phoneMatch[1],
    rest: phoneMatch[2]?.trim() || "",
  };
}

function extractTrailingSimpleField(source: string) {
  const trimmed = normalizeWhitespace(source);
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(SIMPLE_TRAILING_FIELD_RE);
  if (!match) {
    return null;
  }

  return {
    rest: match[1]?.trim() || "",
    value: match[2]?.trim() || "",
  };
}

function parseTrailingFields(source: string) {
  const tabParts = source
    .split("\t")
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);

  if (tabParts.length >= 4) {
    const lastFour = tabParts.slice(-4);
    if (isMobileLikeValue(lastFour[0])) {
      return {
        telemovel: normalizePhoneValue(lastFour[0]),
        telefoneFixo: normalizePhoneValue(lastFour[1]),
        extensaoNos: normalizeExtensionValue(lastFour[2]),
        extensaoVodafone: normalizeExtensionValue(lastFour[3]),
      };
    }
  }

  const mobile = extractLeadingMobileField(source);
  if (!mobile) {
    return null;
  }

  const vodafone = extractTrailingSimpleField(mobile.rest);
  if (!vodafone) {
    return null;
  }

  const nos = extractTrailingSimpleField(vodafone.rest);
  if (!nos) {
    return null;
  }

  return {
    telemovel: normalizePhoneValue(mobile.value),
    telefoneFixo: normalizePhoneValue(nos.rest),
    extensaoNos: normalizeExtensionValue(nos.value),
    extensaoVodafone: normalizeExtensionValue(vodafone.value),
  };
}

function splitMergedLines(text: string) {
  const cleaned = maybeRepairEncoding(text)
    .replace(/\r/g, "")
    .replace(/--\s+\d+\s+of\s+\d+\s+--/gi, "")
    .trim();

  const lines = cleaned.split("\n");
  const merged: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    const compact = normalizeWhitespace(line);
    const startsRegularRow = ROW_PATTERNS.some(({ company, location }) =>
      compact.startsWith(`${company} ${location} `)
    );
    const startsUsefulRow = /^Outros contactos úteis:/i.test(compact) || /^[^\t]+\t[^\t@\s]+@[^\t\s]+/i.test(line);

    if (!merged.length || startsRegularRow || startsUsefulRow || /^LISTA INTERNA DE CONTACTOS$/i.test(compact)) {
      merged.push(line);
      continue;
    }

    const previous = merged.pop() || "";
    merged.push(`${previous} ${line.trim()}`.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t"));
  }

  return merged;
}

function tryParseRegularRow(line: string): ImportedContactoInterno | null {
  const compactLine = normalizeWhitespace(line);
  const prefixMatch = ROW_PATTERNS.find(({ regex }) => regex.test(line) || regex.test(compactLine));
  if (!prefixMatch) {
    return null;
  }

  const match = line.match(prefixMatch.regex) || compactLine.match(prefixMatch.regex);
  const rest = match?.[1]?.trim();
  if (!rest) {
    return null;
  }

  const parsedRest = parseRowRest(rest);
  if (!parsedRest) {
    return null;
  }

  return {
    categoria: "Colaborador",
    empresa: prefixMatch.company,
    localizacao: prefixMatch.location,
    nome: parsedRest.nome,
    email: parsedRest.email,
    telemovel: parsedRest.telemovel,
    telefoneFixo: parsedRest.telefoneFixo,
    extensaoNos: parsedRest.extensaoNos,
    extensaoVodafone: parsedRest.extensaoVodafone,
    observacoes: null,
    ativo: true,
    fonte: CONTACTOS_INTERNOS_PDF_SOURCE,
  };
}

function parseRowRest(rest: string) {
  const normalizedRest = rest.trim();
  const emailMatch = normalizedRest.match(EMAIL_START_RE);

  if (emailMatch?.index != null) {
    const nome = normalizeWhitespace(normalizedRest.slice(0, emailMatch.index));
    const afterName = normalizedRest.slice(emailMatch.index).trim();

    for (let index = emailMatch[0].length; index <= afterName.length; index += 1) {
      const currentChar = afterName[index];
      if (index < afterName.length && currentChar !== "\t" && currentChar !== " ") {
        continue;
      }

      const emailCandidate = normalizeWhitespace(afterName.slice(0, index));
      if (!EMAIL_SEGMENT_RE.test(emailCandidate)) {
        continue;
      }

      const trailing = afterName.slice(index).trim();
      const parsedFields = parseTrailingFields(trailing);
      if (!parsedFields) {
        continue;
      }

      return {
        nome,
        email: normalizeEmailValue(emailCandidate),
        ...parsedFields,
      };
    }
  }

  const noEmailSeparator = normalizedRest.indexOf("\t-");
  if (noEmailSeparator > 0) {
    const nome = normalizeWhitespace(normalizedRest.slice(0, noEmailSeparator));
    const trailing = normalizedRest.slice(noEmailSeparator + 2).trim();
    const parsedFields = parseTrailingFields(trailing);
    if (nome && parsedFields) {
      return {
        nome,
        email: null,
        ...parsedFields,
      };
    }
  }

  return null;
}

function parseUsefulContactsLine(line: string): ImportedContactoInterno | null {
  if (/^Outros contactos úteis:/i.test(line)) {
    return null;
  }

  const parts = line
    .split("\t")
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);

  if (parts.length < 3 || !parts[1]?.includes("@")) {
    return null;
  }

  return {
    categoria: "Contacto útil",
    empresa: parts[0].toUpperCase().includes("OREY") ? "Grupo Orey" : null,
    localizacao: null,
    nome: parts[0],
    email: normalizeEmailValue(parts[1]),
    telemovel: null,
    telefoneFixo: null,
    extensaoNos: null,
    extensaoVodafone: null,
    observacoes: parts.slice(2).join(" | ") || null,
    ativo: true,
    fonte: CONTACTOS_INTERNOS_PDF_SOURCE,
  };
}

function dedupeContacts(items: ImportedContactoInterno[]) {
  const map = new Map<string, ImportedContactoInterno>();

  for (const item of items) {
    const key = [
      item.categoria,
      item.empresa || "",
      item.localizacao || "",
      item.nome,
      item.email || "",
      item.telemovel || "",
      item.telefoneFixo || "",
    ]
      .map((part) => normalizeWhitespace(String(part)).toLowerCase())
      .join("|");

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

export function parseContactosInternosFromText(text: string) {
  const lines = splitMergedLines(text);
  const contacts: ImportedContactoInterno[] = [];
  let usefulContactsMode = false;

  for (const line of lines) {
    const compact = normalizeWhitespace(line);
    if (!compact || /^LISTA INTERNA DE CONTACTOS$/i.test(compact)) {
      continue;
    }

    if (/^Empresa\s+Localização/i.test(compact) || compact === "NOS" || compact === "VODAFONE" || compact === "Ext. Interna") {
      continue;
    }

    if (/^Outros contactos úteis:/i.test(compact)) {
      usefulContactsMode = true;
      continue;
    }

    if (usefulContactsMode) {
      const useful = parseUsefulContactsLine(line);
      if (useful) {
        contacts.push(useful);
      }
      continue;
    }

    const regular = tryParseRegularRow(line);
    if (regular) {
      contacts.push(regular);
    }
  }

  return dedupeContacts(contacts);
}

export async function readContactosInternosPdfText(pdfPath = DEFAULT_CONTACTOS_INTERNOS_PDF_PATH) {
  const data = await readFile(pdfPath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText({});
    return typeof result?.text === "string" ? result.text : "";
  } finally {
    await parser.destroy();
  }
}

export async function loadContactosInternosFromPdf(pdfPath = DEFAULT_CONTACTOS_INTERNOS_PDF_PATH) {
  const text = await readContactosInternosPdfText(pdfPath);
  return parseContactosInternosFromText(text);
}
