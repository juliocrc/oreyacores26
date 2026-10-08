import { normalizeLooseText } from "@/lib/text-normalization";

export const NON_EXPIRING_CERTIFICATE_ITEMS = [
  "rampa",
  "boarding ramp",
  "boarding ramp or ladder",
  "rampa ou escada",
  "escada",
  "ladder",
  "bellows",
  "fole",
  "batedouro",
  "paddles",
  "padles",
  "paddle",
  "oars",
  "oar",
  "remos",
  "remo",
  "pagaias",
  "pagaia",
  "sponges",
  "sponge",
  "esponjas",
  "esponja",
  "bailer",
  "bailer bucket",
  "balde",
  "drinking cup",
  "graduated cup",
  "cup",
  "copo",
  "copo de beber",
  "copo graduado",
  "waterproof torch",
  "torch",
  "lanterna impermeavel",
  "lanterna impermeável",
  "immediate action instructions",
  "survival instructions",
  "instrucoes de acao imediata",
  "instrucoes de sobrevivencia",
  "manual sobrevivencia",
  "reflective tape",
  "fita refletora",
  "fita reflectora",
  "grab handles",
  "grab handle",
  "pegas",
  "pega",
  "painter line",
  "painter",
  "retenida",
  "floating knife",
  "safety knife",
  "faca flutuante",
  "faca de seguranca",
  "knife",
  "faca",
  "floating safety knife",
  "thermal protective aid",
  "thermal protection aid",
  "ajudas termicas",
  "ajudas térmicas",
  "fishing kit",
  "estojo de pesca",
  "kit de pesca",
  "rescue signal table",
  "rescue signal card",
  "quadro de sinais",
  "whistle",
  "apito",
  "heliograph",
  "heliografo",
  "heliógrafo",
  "manual de sobrevivencia",
  "manual de sobrevivência",
  "rescue quoit and line",
  "quoit and line",
  "repair plugs",
  // O kit de reparacao em si nao tem prazo de validade. A data que consta no
  // certificado refere-se ao componente interno (cola, selante, massa de
  // reparacao). O componente continua a ser rastreado como expiravel.
  "repair kit",
  "repair kits",
  "kit de reparacao",
  "kit de reparacao",
  "kit de reparacoes",
  "kit de reparacoes",
  "can openers",
  "can opener",
  "tin openers",
  "tin opener",
  "seasickness bags",
  "sea sick bags",
  "sacos para enjoo",
  "sacos de enjoo",
  "saco de enjoo",
  "sea anchor",
  "sea anchor with line",
  "drogue",
  "ancora flutuante",
  "ancora flutuante com linha",
  "âncora flutuante com linha",
] as const;

export function normalizeCertificateItemName(value?: string | null) {
  return normalizeLooseText(value || "");
}

const NON_EXPIRING_ITEM_SET = new Set(
  NON_EXPIRING_CERTIFICATE_ITEMS.map((item) => normalizeCertificateItemName(item))
);

export function certificateItemHasManagedValidity(value?: string | null) {
  const normalized = normalizeCertificateItemName(value);
  if (!normalized) return false;
  return !NON_EXPIRING_ITEM_SET.has(normalized);
}

export function certificateRowLooksLikeManufacturingDate(value?: string | null) {
  const normalized = normalizeCertificateItemName(value);
  if (!normalized) return false;
  return normalized.includes("data fabrico") || normalized.includes("manuf date") || normalized.includes("date of manuf");
}
