import type { Navio, NavioListColumnKey } from "@/types/navios-page";
import { NAVIO_LIST_COLUMNS, LOCATION_CANONICAL_MAP, IS_AZORES_APP } from "@/types/navios-page";
import { canonicalizeAzoresIsland, inferAzoresIslandFromPort } from "@/lib/azores-islands";

export function buildDefaultNavioColumns(): Record<NavioListColumnKey, boolean> {
  return NAVIO_LIST_COLUMNS.reduce((acc, col) => {
    acc[col.key] = true;
    return acc;
  }, {} as Record<NavioListColumnKey, boolean>);
}

export function normalizeLocationToken(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function getCanonicalNavioLocationLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // First try the canonical Azores island mapping (handles accents/canonical names)
  const az = canonicalizeAzoresIsland(raw);
  if (az) return az;

  // Try to infer from port names (e.g., 'Ponta Delgada' -> 'São Miguel')
  const fromPort = inferAzoresIslandFromPort(raw);
  if (fromPort) return fromPort;

  // Fallback to legacy LOCATION_CANONICAL_MAP normalized mapping
  const normalized = normalizeLocationToken(raw);
  if (!normalized || ["na", "nd", "nad", "desconhecida", "desconhecido", "semilha"].includes(normalized)) {
    return "";
  }

  return LOCATION_CANONICAL_MAP[normalized] || "";
}

export function getNavioLocationValue(navio: Navio) {
  return getCanonicalNavioLocationLabel(String(navio.ilha || ""));
}

export function getNavioLocationLabel(navio: Navio) {
  const island = getNavioLocationValue(navio);
  return island || (IS_AZORES_APP ? "Sem ilha" : "Sem localização");
}
