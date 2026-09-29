const NON_EXPIRING_ITEMS_LOWER = [
  "rampa", "rampa de entrada", "rampa ou escada",
  "boarding ramp", "boarding ramp or ladder",
  "pilhas para lanterna", "torch batteries", "baterias de lanterna",
  "escada de entrada", "entrance ladder",
  "pagaias", "paddles",
  "batedouro", "bailer",
  "fole", "bellows",
  "esponja", "esponjas", "sponge", "sponges",
  "cabo de retenida", "painter line",
  "saco do cabo de retenida", "painter line bag",
  "faca flutuante", "floating knife",
  "facas de segurança", "safety knifes",
  "âncora flutuante", "sea anchor", "sea anchor with line",
  "abre-latas", "tin opener", "tin openers",
  "copo graduado", "drinking cup",
  "heliógrafo", "signalling mirror",
  "refletor de radar", "radar reflector",
  "pegas de mão", "grab handles",
  "cabo de salvação interior", "grabline internal",
  "fita refletora", "reflective tape", "retro reflective tape",
  "bolsas de estabilização", "stabilizing pockets",
  "sistema de endireitar", "righting system",
  "jogo de reparação", "repair kit", "repar kit",
  "coletores de água", "water collectors",
];

export function isNonExpiring(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return NON_EXPIRING_ITEMS_LOWER.includes(n)
    || n.startsWith("rampa")
    || n.includes("boarding ramp")
    || n.includes("pilhas")
    || n.includes("torch batter");
}

export function fmt(v: unknown, suffix = "") {
  const s = String(v ?? "").trim();
  return s && s !== "undefined" && s !== "null" ? `${s}${suffix}` : "—";
}

export function fmtPeso(v: unknown, suffix = "") {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s || s === "undefined" || s === "null") return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return `${s}${suffix}`;
  return `${n.toFixed(3)}${suffix}`;
}

export function fmtDate(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-PT");
}

export function getDateStatus(d?: string | null): "OK" | "WARNING" | "CRITICAL" | "NONE" {
  if (!d) return "NONE";
  const s = String(d).trim();
  let date: Date;
  const mmYyyy = s.match(/^(\d{1,2})\/(\d{4})$/);
  const yyyyMm = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12 && year > 0) date = new Date(year, month - 1, 1, 12);
    else date = new Date(NaN);
  } else if (yyyyMm) {
    const year = Number(yyyyMm[1]);
    const month = Number(yyyyMm[2]);
    const day = yyyyMm[3] ? Number(yyyyMm[3]) : 1;
    date = new Date(year, month - 1, day, 12);
  } else {
    date = new Date(s);
  }
  if (isNaN(date.getTime())) return "NONE";
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  return days < 0 ? "CRITICAL" : days <= 90 ? "WARNING" : "OK";
}

export function parseApproval(v?: string | null): "OK" | "CRITICAL" | "NONE" {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "aprovado" || s === "ok" || s === "conforme") return "OK";
  if (s === "reprovado" || s === "não conforme" || s === "nao conforme" || s === "falhou") return "CRITICAL";
  return "NONE";
}
