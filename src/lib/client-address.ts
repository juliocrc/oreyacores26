import { lookupPostalCodeLocality } from "./postal-code-directory.generated";

const POSTAL_CODE_REGEX = /\b(\d{4}-\d{3})\b/;
const ADDRESS_NUMBER_TOKEN_REGEX = /(?:s\/n)|(?:[A-Za-z]+\/\d+[A-Za-z0-9/-]*|[A-Za-z]?\d+[A-Za-z0-9/-]*(?:\/\d+[A-Za-z0-9/-]*)?)/i;
const ADDRESS_NUMBER_SUFFIX_REGEX = /(?:R\/C(?:\s+[A-Za-zÀ-ÿ./-]+)?|RC(?:\s+[A-Za-zÀ-ÿ./-]+)?|LOJA\s+[A-Za-z0-9/-]+|FRA(?:CAO|ÇÃO|ÇAO|CÃO)\s+[A-Za-z0-9/-]+|LOTE\s+[A-Za-z0-9/-]+|LT\.?\s+[A-Za-z0-9/-]+|BLOCO\s+[A-Za-z0-9/-]+|PORTA\s+[A-Za-z0-9/-]+|ANDAR\s+[A-Za-z0-9/-]+|[A-Za-z]{1,3})/i;
const UNKNOWN_ADDRESS_PATTERNS = [
  /^morada\s+nao\s+indicada$/i,
  /^morada\s+n[aã]o\s+indicada$/i,
  /^sem\s+morada$/i,
  /^nao\s+indicado$/i,
  /^n[aã]o\s+indicado$/i,
];

export type ClienteAddressFields = {
  morada: string | null;
  moradaNumero: string | null;
  codigoPostal: string | null;
  localidade: string | null;
};

function normalizeNullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeTextToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isUnknownAddress(value: string | null) {
  if (!value) return true;
  const normalized = normalizeTextToken(value);
  return UNKNOWN_ADDRESS_PATTERNS.some((pattern) => pattern.test(normalized));
}

function trimTrailingAddressSeparators(value: string) {
  return value.replace(/[\s,;.-]+$/g, "").trim();
}

function getAddressPrefixBeforePostalCode(address: string) {
  const match = address.match(POSTAL_CODE_REGEX);
  if (!match || typeof match.index !== "number") {
    return trimTrailingAddressSeparators(address);
  }

  return trimTrailingAddressSeparators(address.slice(0, match.index));
}

export function normalizeCodigoPostal(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const directMatch = text.match(POSTAL_CODE_REGEX);
  if (directMatch) return directMatch[1];

  const digits = text.replace(/\D/g, "");
  if (digits.length === 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return null;
}

export function extractCodigoPostalFromMorada(morada: unknown) {
  const text = normalizeNullableText(morada);
  if (!text || isUnknownAddress(text)) return null;
  const match = text.match(POSTAL_CODE_REGEX);
  return match ? match[1] : null;
}

export function extractLocalidadeFromMorada(morada: unknown) {
  const text = normalizeNullableText(morada);
  if (!text || isUnknownAddress(text)) return null;

  const match = text.match(/\b\d{4}(?:-\d{3})?\s+(.+)$/i);
  if (!match) return null;

  const locality = trimTrailingAddressSeparators(match[1] || "")
    .replace(/^[-,;/.\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return locality || null;
}

export function extractNumeroMoradaFromMorada(morada: unknown) {
  const text = normalizeNullableText(morada);
  if (!text || isUnknownAddress(text)) return null;

  const prefix = getAddressPrefixBeforePostalCode(text);
  if (!prefix) return null;

  const explicitRegex = new RegExp(
    String.raw`\b(?:n(?:[.º°]|o)?|nº|n°|no\.?)\s*(${ADDRESS_NUMBER_TOKEN_REGEX.source})(?:\s*,?\s*(${ADDRESS_NUMBER_SUFFIX_REGEX.source}))?$`,
    "i"
  );
  const explicitMatch = prefix.match(explicitRegex);
  if (explicitMatch) {
    const main = trimTrailingAddressSeparators(explicitMatch[1] || "");
    const suffix = trimTrailingAddressSeparators(explicitMatch[2] || "");
    const combined = trimTrailingAddressSeparators(`${main}${suffix ? `, ${suffix}` : ""}`);
    return combined || null;
  }

  const fallbackRegex = new RegExp(
    String.raw`(?:^|,\s*|\s)(${ADDRESS_NUMBER_TOKEN_REGEX.source})(?:\s+(${ADDRESS_NUMBER_SUFFIX_REGEX.source}))?$`,
    "i"
  );
  const fallbackMatch = prefix.match(fallbackRegex);
  if (!fallbackMatch) return null;

  const main = trimTrailingAddressSeparators(fallbackMatch[1] || "");
  const suffix = trimTrailingAddressSeparators(fallbackMatch[2] || "");
  const combined = trimTrailingAddressSeparators(`${main}${suffix ? `, ${suffix}` : ""}`);
  return combined || null;
}

export function buildAddressLine(input: Partial<ClienteAddressFields>): string {
  const morada = normalizeNullableText(input.morada);
  const moradaNumero = normalizeNullableText(input.moradaNumero);
  const codigoPostal = normalizeNullableText(input.codigoPostal);
  const localidade = normalizeNullableText(input.localidade);

  const parts = [
    morada,
    moradaNumero,
    `${codigoPostal ?? ""} ${localidade ?? ""}`.trim(),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "[Morada não registada]";
}

export function deriveClienteAddressFields(input: {
  morada?: unknown;
  moradaNumero?: unknown;
  codigoPostal?: unknown;
  localidade?: unknown;
}): ClienteAddressFields {
  const rawMorada = normalizeNullableText(input.morada);
  const morada = isUnknownAddress(rawMorada) ? null : rawMorada;
  const moradaNumero = normalizeNullableText(input.moradaNumero) ?? extractNumeroMoradaFromMorada(morada);
  const codigoPostal = normalizeCodigoPostal(input.codigoPostal) ?? extractCodigoPostalFromMorada(morada);
  const localidade = normalizeNullableText(input.localidade) ?? extractLocalidadeFromMorada(morada) ?? lookupPostalCodeLocality(codigoPostal);

  return {
    morada,
    moradaNumero,
    codigoPostal,
    localidade,
  };
}
