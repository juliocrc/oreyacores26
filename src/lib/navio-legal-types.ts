import type { RecreioZonaKey } from "@/config/recreioMandatoryEquipment";

export type NavioTipoCategoria =
  | "Pesca Local"
  | "Pesca Costeira"
  | "Pesca do Largo"
  | "Tráfego Local"
  | "Auxiliar Local"
  | "Marítimo Turística"
  | "Náutica de Recreio"
  | "Outro";

export const NAVIO_TIPO_PESCA_OPTIONS: NavioTipoCategoria[] = [
  "Pesca Local",
  "Pesca Costeira",
  "Pesca do Largo",
  "Tráfego Local",
  "Auxiliar Local",
  "Marítimo Turística",
  "Náutica de Recreio",
  "Outro",
];

export const NAVIO_TIPO_NAVIO_OPTIONS = [
  "Pesca",
  "Auxiliar Local",
  "Tráfego Local",
  "Marítimo-Turística",
  "Náutica de Recreio",
  "Passageiros",
  "Barco de Passageiros (> 4 metros)",
  "Barco de Passageiros (< 4 metros)",
  "Navio de Cruzeiro de Passageiros (Oceano/Internacional)",
  "Barco de Passageiros de alta velocidade",
  "Carga",
  "Cargueiro de Grande Capacidade",
  "Cargueiro de Média Capacidade",
  "Petroleiro",
  "Navio Auxiliar",
  "Rebocador",
  "Investigação",
  "Apoio Marítimo",
  "Outro",
] as const;

/**
 * As embarcações de recreio usam o formato `<número de registo>-<tipo>PT`,
 * em que o algarismo imediatamente antes de `PT` é o tipo / zona de navegação (1..5):
 * 1: Oceânica · 2: Ao largo (200 mn) · 3: Costeira (40 mn) · 4: Costeira restrita · 5: Águas abrigadas.
 * Ex.: 130593-5PT (recreio, tipo 5), 108367-4PT (recreio, tipo 4).
 */
export function isRecreioMatricula(matricula?: string | null): boolean {
  return /(?:^|[-\s])[1-5]\s*PT$/i.test(String(matricula ?? "").trim());
}

export function parseRecreioZonaFromMatricula(matricula?: string | null): RecreioZonaKey | null {
  const match = String(matricula ?? "").trim().match(/([1-5])\s*PT$/i);
  if (!match) return null;
  return `zona${Number(match[1]) - 1}` as RecreioZonaKey;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeNavioTipoCategoria(
  tipoPesca?: string | null,
  matricula?: string | null,
  tipoNavio?: string | null
): NavioTipoCategoria {
  const matriculaNorm = String(matricula || "")
    .trim()
    .toUpperCase();
  const tipoPescaNorm = normalizeText(tipoPesca);
  const tipoNavioNorm = normalizeText(tipoNavio);
  const haystack = `${tipoPescaNorm} ${tipoNavioNorm}`.trim();

  if (haystack.includes("auxiliar local") || matriculaNorm.endsWith("AL")) {
    return "Auxiliar Local";
  }

  if (
    haystack.includes("trafego local")
    || haystack.includes("tráfego local")
    || haystack.includes("trafrego local")
    || matriculaNorm.endsWith("TL")
  ) {
    return "Tráfego Local";
  }

  if (haystack.includes("maritimo") && haystack.includes("tur")) {
    return "Marítimo Turística";
  }

  if (haystack.includes("turism")) {
    return "Marítimo Turística";
  }

  if (haystack.includes("recreio") || isRecreioMatricula(matricula)) {
    return "Náutica de Recreio";
  }

  if (haystack.includes("largo")) {
    return "Pesca do Largo";
  }

  if (matriculaNorm.endsWith("L")) return "Pesca Local";
  if (matriculaNorm.endsWith("C")) return "Pesca Costeira";

  if (haystack.includes("costeir") || haystack.includes("vara") || haystack.includes("atum") || haystack.includes("espada")) {
    return "Pesca Costeira";
  }

  if (haystack.includes("pesca")) {
    return "Pesca Local";
  }

  return "Outro";
}