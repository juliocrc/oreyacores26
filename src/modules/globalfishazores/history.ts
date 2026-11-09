export type FleetVessel = {
  id: number;
  nome: string;
  matricula?: string;
  ilha?: string;
  mmsi?: string | null;
  imo?: string | null;
};

export type HistoryPoint = { lat: number; lng: number; time: string };
export type VesselHistory = {
  vesselId: number;
  mmsi: string;
  imo: string | null;
  from: string;
  to: string;
  source: string;
  points: HistoryPoint[];
  discarded: number;
};

export function vesselIdentifier(value: unknown, kind: "mmsi" | "imo"): string | null {
  const raw = String(value ?? "").trim().replace(kind === "imo" ? /^IMO\s*/i : /^MMSI\s*/i, "");
  return (kind === "mmsi" ? /^[1-9]\d{8}$/ : /^[1-9]\d{6}$/).test(raw) ? raw : null;
}

export function parseHistory(payload: unknown, from: string, to: string): { points: HistoryPoint[]; discarded: number } {
  const feature = payload as { geometry?: { type?: string; coordinates?: unknown[] }; properties?: { times?: unknown[] } } | null;
  if (feature?.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates)) {
    throw new Error("Formato de historico OpenWaters inesperado.");
  }
  const points: HistoryPoint[] = [];
  let discarded = 0;
  const seen = new Set<string>();
  for (const [index, coord] of feature.geometry.coordinates.entries()) {
    const time = feature.properties?.times?.[index];
    // Require an explicit timezone: never infer dates or timestamps from array order.
    const timestamp = typeof time === "string" && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(time) ? Date.parse(time) : NaN;
    if (!Array.isArray(coord) || typeof coord[0] !== "number" || typeof coord[1] !== "number"
      || !Number.isFinite(coord[0]) || !Number.isFinite(coord[1]) || Math.abs(coord[0]) > 180 || Math.abs(coord[1]) > 90
      || !Number.isFinite(timestamp) || timestamp < Date.parse(from) || timestamp > Date.parse(to)) {
      discarded++;
      continue;
    }
    const point = { lng: coord[0], lat: coord[1], time: new Date(timestamp).toISOString() };
    const key = `${point.time}:${point.lat}:${point.lng}`;
    if (!seen.has(key)) points.push(point);
    seen.add(key);
  }
  points.sort((a, b) => a.time.localeCompare(b.time));
  return { points, discarded };
}
