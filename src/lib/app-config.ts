import { normalizeToken } from "@/lib/text-normalization";

type RegionPresetKey = "ACORES" | "NORTE" | "ALGARVE" | "LISBOA";

type RegionPreset = {
  slug: string;
  name: string;
  issuerName: string;
  theme: string;
  defaultServiceStationCode: string;
  defaultRegionLabel: string;
  icsUidDomain: string;
  geoCenter: { lat: number; lng: number };
  geoLabel: string;
  ivaRate: number;
};

const REGION_PRESETS: Record<RegionPresetKey, RegionPreset> = {
  ACORES: {
    slug: "oreyazores26",
    name: "Orey Técnica Açores",
    issuerName: "Sistema Oreyazores",
    theme: "azores",
    defaultServiceStationCode: "ACORES",
    defaultRegionLabel: "Açores",
    icsUidDomain: "oreyazores",
    geoCenter: { lat: 38.55, lng: -28.2 },
    geoLabel: "Açores",
    ivaRate: 0.16,
  },
  NORTE: {
    slug: "oreynorte",
    name: "Orey Técnica Norte",
    issuerName: "Sistema Orey Norte",
    theme: "deluxe",
    defaultServiceStationCode: "AVELEDA",
    defaultRegionLabel: "Norte",
    icsUidDomain: "oreynorte",
    geoCenter: { lat: 41.15, lng: -8.61 },
    geoLabel: "Norte",
    ivaRate: 0.23,
  },
  ALGARVE: {
    slug: "oreyalgarve",
    name: "Orey Técnica Algarve",
    issuerName: "Sistema Orey Algarve",
    theme: "deluxe",
    defaultServiceStationCode: "ALCATARILHA",
    defaultRegionLabel: "Algarve",
    icsUidDomain: "oreyalgarve",
    geoCenter: { lat: 37.1, lng: -8.3 },
    geoLabel: "Algarve",
    ivaRate: 0.23,
  },
  LISBOA: {
    slug: "oreylisboa",
    name: "Orey Técnica Lisboa",
    issuerName: "Sistema Orey Lisboa",
    theme: "deluxe",
    defaultServiceStationCode: "LISBOA",
    defaultRegionLabel: "Lisboa",
    icsUidDomain: "oreylisboa",
    geoCenter: { lat: 38.72, lng: -9.13 },
    geoLabel: "Lisboa",
    ivaRate: 0.23,
  },
};

// O Next substitui `process.env.NEXT_PUBLIC_*` por literais na fase de build
// apenas quando a escrita e um acesso ESTATICO a membro. Com `process.env[name]`
// (indice dinamico) o bundle do cliente fica com `process.env` vazio e todas as
// variaveis caem silenciosamente no preset — o servidor e o cliente renderizavam
// nomes/temas diferentes, o que causava o erro de hidratacao. Por isso cada
// variavel e lida aqui de forma literal.
const PUBLIC_ENV = {
  regionPreset: process.env.NEXT_PUBLIC_APP_REGION_PRESET,
  slug: process.env.NEXT_PUBLIC_APP_SLUG,
  name: process.env.NEXT_PUBLIC_APP_NAME,
  issuerName: process.env.NEXT_PUBLIC_APP_ISSUER_NAME,
  theme: process.env.NEXT_PUBLIC_APP_THEME,
  defaultServiceStationCode: process.env.NEXT_PUBLIC_DEFAULT_SERVICE_STATION_CODE,
  defaultRegionLabel: process.env.NEXT_PUBLIC_DEFAULT_REGION_LABEL,
  icsUidDomain: process.env.NEXT_PUBLIC_ICS_UID_DOMAIN,
  geoCenterLat: process.env.NEXT_PUBLIC_APP_GEO_CENTER_LAT,
  geoCenterLng: process.env.NEXT_PUBLIC_APP_GEO_CENTER_LNG,
  geoLabel: process.env.NEXT_PUBLIC_APP_GEO_LABEL,
  ivaRate: process.env.NEXT_PUBLIC_IVA_RATE,
  storageNamespace: process.env.NEXT_PUBLIC_APP_STORAGE_NAMESPACE,
} as const;

function readString(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function readNumber(value: string | undefined, fallback: number) {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePresetKey(raw?: string | null): RegionPresetKey {
  const key = (raw || "").trim().toUpperCase();
  if (key === "NORTE") return "NORTE";
  if (key === "ALGARVE") return "ALGARVE";
  if (key === "LISBOA") return "LISBOA";
  return "ACORES";
}

const presetKey = normalizePresetKey(PUBLIC_ENV.regionPreset);
const preset = REGION_PRESETS[presetKey];
// APP_STORAGE_NAMESPACE (sem NEXT_PUBLIC_) so existe no servidor; no cliente
// usamos a variante publica para que as chaves de storage coincidam.
const serverStorageNamespace = typeof window === "undefined"
  ? readString(process.env.APP_STORAGE_NAMESPACE, preset.slug)
  : "";

export const APP_CONFIG = {
  presetKey,
  slug: readString(PUBLIC_ENV.slug, preset.slug),
  name: readString(PUBLIC_ENV.name, preset.name),
  issuerName: readString(PUBLIC_ENV.issuerName, preset.issuerName),
  theme: readString(PUBLIC_ENV.theme, preset.theme),
  defaultServiceStationCode: readString(PUBLIC_ENV.defaultServiceStationCode, preset.defaultServiceStationCode),
  defaultRegionLabel: readString(PUBLIC_ENV.defaultRegionLabel, preset.defaultRegionLabel),
  icsUidDomain: readString(PUBLIC_ENV.icsUidDomain, preset.icsUidDomain),
  geoCenter: {
    lat: readNumber(PUBLIC_ENV.geoCenterLat, preset.geoCenter.lat),
    lng: readNumber(PUBLIC_ENV.geoCenterLng, preset.geoCenter.lng),
  },
  geoLabel: readString(PUBLIC_ENV.geoLabel, preset.geoLabel),
  ivaRate: readNumber(PUBLIC_ENV.ivaRate, preset.ivaRate),
  storageNamespace: readString(PUBLIC_ENV.storageNamespace, serverStorageNamespace || preset.slug),
} as const;

export const APP_METADATA = {
  title: `${APP_CONFIG.name} — Gestor de Inspeções de Jangadas`,
  description: `Gestão de inspeções, clientes, navios e equipamentos para ${APP_CONFIG.name}.`,
} as const;

export function normalizeStationMatchToken(value?: string | null) {
  return normalizeToken(value || "");
}
