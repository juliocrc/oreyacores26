export const SERVICE_STATION_TERRITORIES = ["AZORES", "MAINLAND", "MADEIRA"] as const;
export const SERVICE_STATION_REGIONS = ["NORTE", "CENTRO", "SUL", "MADEIRA"] as const;

export type ServiceStationTerritory = (typeof SERVICE_STATION_TERRITORIES)[number];
export type ServiceStationRegion = (typeof SERVICE_STATION_REGIONS)[number];

export type ServiceStationInput = {
  codigo: string;
  nome: string;
  empresa: string | null;
  localizacao: string | null;
  prefixo: string | null;
  territorioTipo: ServiceStationTerritory;
  regiaoOperacional: ServiceStationRegion | null;
  ativo: boolean;
  observacoes: string | null;
};

const TERRITORY_LABELS: Record<ServiceStationTerritory, string> = {
  AZORES: "Açores",
  MAINLAND: "Continente",
  MADEIRA: "Madeira",
};

export function serviceStationTerritoryLabel(value: unknown): string {
  const key = String(value ?? "").trim().toUpperCase() as ServiceStationTerritory;
  return TERRITORY_LABELS[key] ?? String(value ?? "—");
}

export function normalizeStationCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Prefixo curto usado na numeracao de documentos por estacao (ex.: "AZ" ->
// AZ26-001). Aceita letras e digitos, ate 4 caracteres. Vazio -> null.
export function normalizeStationPrefix(value: unknown): string | null {
  const cleaned = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 4);
  return cleaned || null;
}

// Deriva um prefixo a partir do codigo da estacao quando nao ha um explicito.
export function deriveStationPrefix(codigo: unknown): string {
  const code = normalizeStationCode(codigo);
  const letters = code.replace(/[^A-Z]/g, "");
  const base = (letters || code).replace(/_/g, "");
  return base.slice(0, 2) || "XX";
}

// Prefixo efetivo de uma estacao: o campo `prefixo` se definido, senao derivado
// do codigo. Usado na numeracao de certificados por estacao.
export function resolveStationPrefix(station?: { prefixo?: string | null; codigo?: string | null } | null): string {
  const explicit = normalizeStationPrefix(station?.prefixo);
  if (explicit) return explicit;
  return deriveStationPrefix(station?.codigo);
}

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function parseServiceStationInput(body: unknown): { data?: ServiceStationInput; error?: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const codigo = normalizeStationCode(raw.codigo);
  const nome = String(raw.nome ?? "").trim();

  if (!codigo) return { error: "O código da estação é obrigatório." };
  if (!nome) return { error: "O nome da estação é obrigatório." };

  const territorioRaw = String(raw.territorioTipo ?? "MAINLAND").trim().toUpperCase();
  const territorioTipo = (SERVICE_STATION_TERRITORIES as readonly string[]).includes(territorioRaw)
    ? (territorioRaw as ServiceStationTerritory)
    : "MAINLAND";

  const regiaoRaw = String(raw.regiaoOperacional ?? "").trim().toUpperCase();
  const regiaoOperacional =
    regiaoRaw && (SERVICE_STATION_REGIONS as readonly string[]).includes(regiaoRaw)
      ? (regiaoRaw as ServiceStationRegion)
      : null;

  return {
    data: {
      codigo,
      nome,
      empresa: trimOrNull(raw.empresa),
      localizacao: trimOrNull(raw.localizacao),
      prefixo: normalizeStationPrefix(raw.prefixo),
      territorioTipo,
      regiaoOperacional,
      ativo: raw.ativo === undefined ? true : Boolean(raw.ativo),
      observacoes: trimOrNull(raw.observacoes),
    },
  };
}
