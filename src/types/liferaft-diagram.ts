import type { JangadaFormData } from "@/app/jangadas/[id]/JangadaDetailPageClient";

export type LiferaftArtigo = {
  name: string;
  validade?: string | null;
  quantidade?: number;
};

export type LiferaftDiagramProps = {
  jangada: JangadaFormData;
  artigos: LiferaftArtigo[];
  /** Checklist (régua) recolhida no wizard/inspeção — itens com {status, validade, voltagem, referencia} */
  checklist?: Record<string, unknown>;
};

export type ComponentKey =
  | "canopy"
  | "upperChamber"
  | "lowerChamber"
  | "cylinder"
  | "exteriorLight"
  | "interiorLight"
  | "ballastPockets"
  | "seaAnchor"
  | "hru"
  | "emergencyPack"
  | "gasInflation"
  | "davitLoad"
  | "painterLine"
  | "radarReflector"
  | "boardingRamp"
  | "rightingSystem";

export type SpecItem = { name: string; value: string };

export type ComponentStatus = {
  key: ComponentKey;
  label: string;
  status: "OK" | "WARNING" | "CRITICAL" | "NONE";
  desc: string;
  specs: SpecItem[];
  icon: string;
  pos: [number, number];
  external?: boolean;
  externalNote?: string;
  /** Marca o componente como "sem luz/bateria/HRU" (não aplicável) — não conta como N/D para o score */
  naAplicavel?: boolean;
};

export const LIGHT_TYPE_OPTIONS = [
  { value: "automatic", label: "Luz Automática (SOLAS)", icon: "💡" },
  { value: "battery",   label: "Bateria de Luz Manual",  icon: "🔋" },
  { value: "none",      label: "Sem Luz",                icon: "❌" },
] as const;

export type LightType = typeof LIGHT_TYPE_OPTIONS[number]["value"];
