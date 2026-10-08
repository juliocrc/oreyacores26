export type InspectionStatusColor = "green" | "yellow" | "orange" | "red" | "gray";

export type InspectionStatus = {
  label: string;
  color: InspectionStatusColor;
  daysLeft: number | null;
};

export const INSPECTION_STATUS_STYLES: Record<InspectionStatusColor, {
  dot: string;
  badge: string;
}> = {
  green:  { dot: "bg-emerald-500", badge: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  yellow: { dot: "bg-yellow-400",  badge: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  orange: { dot: "bg-orange-500",  badge: "bg-orange-50 border-orange-200 text-orange-700" },
  red:    { dot: "bg-red-500",     badge: "bg-red-50 border-red-200 text-red-700" },
  gray:   { dot: "bg-slate-300",   badge: "bg-slate-50 border-slate-200 text-slate-500" },
};

function parseDateSafe(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export function getInspectionStatus(dateStr?: string | null): InspectionStatus {
  if (!dateStr) return { label: "Sem data", color: "gray", daysLeft: null };
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return { label: "Sem data", color: "gray", daysLeft: null };
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: "Expirada", color: "red", daysLeft };
  if (daysLeft <= 30) return { label: `${daysLeft}d`, color: "orange", daysLeft };
  if (daysLeft <= 60) return { label: `${daysLeft}d`, color: "yellow", daysLeft };
  return { label: "OK", color: "green", daysLeft };
}

/**
 * Calcula o estado do GI (Gas Inflation test / Ensaio de Insulfação a Gás)
 * baseado na data de fabrico. O GI é obrigatório de 5 em 5 anos.
 */
export function getGIStatus(dataFabrico?: string | null): InspectionStatus {
  const fabrico = parseDateSafe(dataFabrico);
  if (!fabrico) return { label: "Sem data fabrico", color: "gray", daysLeft: null };

  const now = new Date();
  const firstGI = addYears(fabrico, 5);
  let nextGI = firstGI;
  while (nextGI <= now) {
    nextGI = addYears(nextGI, 5);
  }
  const daysLeft = Math.ceil((nextGI.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { label: "GI Expirada", color: "red", daysLeft };
  if (daysLeft <= 30) return { label: `GI em ${daysLeft}d`, color: "orange", daysLeft };
  if (daysLeft <= 60) return { label: `GI em ${daysLeft}d`, color: "yellow", daysLeft };
  return { label: "GI em dia", color: "green", daysLeft };
}

/**
 * Calcula o estado da inspeção anual baseado em dataProxInspecao
 */
export function getAnnualInspectionStatus(dateStr?: string | null): InspectionStatus {
  return getInspectionStatus(dateStr);
}
