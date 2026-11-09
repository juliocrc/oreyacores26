export function stripDiacritics(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeText(value?: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeLooseText(value: unknown) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(value: unknown) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function normalizeCodeToken(value: unknown) {
  return stripDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

export function normalizeUpperText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function isArimarSosSerial(value: unknown) {
  const compact = stripDiacritics(normalizeUpperText(value)).replace(/[^A-Z0-9]/g, "");
  return compact.startsWith("AO");
}

export function canonicalizeRaftBrand(value: unknown) {
  const upper = normalizeUpperText(value);
  const compact = stripDiacritics(upper).replace(/[^A-Z0-9]/g, "");

  if (compact === "EURIVINIL") {
    return "EUROVINIL";
  }

  if (compact === "SEASAFE") {
    return "SEA-SAFE";
  }

  return upper;
}

function isSeasavaPlusRPackType(value: unknown) {
  const normalized = stripDiacritics(normalizeUpperText(value)).replace(/[^A-Z0-9]/g, "");
  if (!normalized) return false;

  return normalized === "R"
    || normalized.includes("SIMPLIFICADOMINIMO")
    || normalized === "MINIMO";
}

function isExplicitSeasavaPlusRSignature(signature: string) {
  return signature.includes("SEASAVAPLUSR")
    || signature.includes("SESAVAPLUSR");
}

export function canonicalizeRaftModel(value: unknown, brand?: unknown, packType?: unknown, serial?: unknown) {
  const upper = normalizeUpperText(value);
  const upperBrand = normalizeUpperText(brand);

  if (upper.includes("SOS")) {
    return "SOS";
  }

  if (upperBrand.includes("ARIMAR") && isArimarSosSerial(serial)) {
    return "SOS";
  }

  const signature = stripDiacritics(upper).replace(/[^A-Z0-9]/g, "");
  const rfdSignature = signature.replace(/^RFD/, "");

  // Only the confirmed spelling variants of this exact DSB model; keep LR05L/DL distinct.
  if (upperBrand === "DSB" && /^(?:DSB)?LR05$/.test(signature)) return "LR05";

  if (upperBrand.includes("SEA-SAFE") && (signature === "SEASAFEKHYJF6" || signature === "KHYJF6")) {
    return "KHYJF-6";
  }

  if (upperBrand.includes("LALIZAS") && signature.includes("LEISURE")) {
    return "Leisure-Raft";
  }

  if (upperBrand.includes("LALIZAS") && signature.includes("ISORAFT")) {
    return "ISO-RAFT";
  }

  if (upperBrand.includes("LALIZAS") && signature.includes("OCEANO")) {
    return "Lalizas Oceano";
  }

  if (!upper) return "";

  if (signature.includes("SEASAVA") || signature.includes("SESAVA")) {
    if (signature.includes("PROISO") || signature.includes("PRO")) {
      return "SEASAVA PRO-ISO";
    }
    if (isExplicitSeasavaPlusRSignature(signature) || isSeasavaPlusRPackType(packType)) {
      return "SEASAVA PLUS R";
    }
    return "SEASAVA PLUS";
  }

  if (upperBrand.includes("RFD")) {
    if (rfdSignature.includes("SURVIVA") && (rfdSignature.includes("MKI") || rfdSignature.includes("MK1"))) {
      return "SURVIVA MKIV TO";
    }
    if (rfdSignature.includes("SURVIVA") && (rfdSignature.includes("MKII") || rfdSignature.includes("MK2"))) {
      return "SURVIVA MKII";
    }
    if (rfdSignature.includes("SURVIVA") && (rfdSignature.includes("MKIII") || rfdSignature.includes("MK3"))) {
      return "SURVIVA MKIII";
    }
    if (rfdSignature.includes("SURVIVA") && (rfdSignature.includes("MKIV") || rfdSignature.includes("MK4"))) {
      return "SURVIVA MKIV";
    }

    if (rfdSignature === "MKI" || rfdSignature === "MK1") {
      return "SURVIVA MKIV TO";
    }
    if (rfdSignature === "MKII" || rfdSignature === "MK2") {
      return "SURVIVA MKII";
    }
    if (rfdSignature === "MKIII" || rfdSignature === "MK3") {
      return "SURVIVA MKIII";
    }
    if (rfdSignature === "MKIV" || rfdSignature === "MK4") {
      return "SURVIVA MKIV";
    }
  }

  if (signature.includes("SURVIVA") && (signature.includes("MKI") || signature.includes("MK1"))) {
    return "SURVIVA MKIV TO";
  }

  if (signature.includes("SURVIVA") && signature.includes("MKIII")) {
    return "SURVIVA MKIII";
  }

  if (signature.includes("SURVIVA") && signature.includes("MKIV")) {
    return "SURVIVA MKIV";
  }

  if (signature === "COASTALPT") {
    return "COASTAL PT";
  }

  if (upperBrand.includes("ZODIAC") && signature.includes("COASTAL")) {
    return "COASTAL PT";
  }

  return upper;
}

const LEAFIELD_SIGNATURES = ["leafield", "leafeld", "leafild", "leaffield"];

export function canonicalizeCylinderSistema(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (!raw) return "";

  const token = normalizeToken(raw);
  if (LEAFIELD_SIGNATURES.some((alias) => token.includes(alias))) {
    return "LEAFIELD";
  }

  return raw;
}
