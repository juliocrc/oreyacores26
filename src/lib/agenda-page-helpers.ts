export function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseAgendaDateFlexible(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const yyyyMmDd = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyyMmDd) {
    const year = Number(yyyyMmDd[1]);
    const month = Number(yyyyMmDd[2]);
    const day = Number(yyyyMmDd[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (day >= 1 && day <= 12 && month >= 1 && month <= 31) {
      const parsedLegacy = new Date(year, day - 1, month);
      if (!Number.isNaN(parsedLegacy.getTime())) return parsedLegacy;
    }
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const mmYyyy = raw.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) {
      const parsed = new Date(year, month - 1, 1);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const mmYy = raw.match(/^(\d{1,2})[\/\-\.](\d{2})$/);
  if (mmYy) {
    const month = Number(mmYy[1]);
    const shortYear = Number(mmYy[2]);
    if (month >= 1 && month <= 12) {
      const fullYear = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
      const parsed = new Date(fullYear, month - 1, 1);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}

export function isWithinNextDays(value: string | null | undefined, days: number) {
  const parsedDate = parseAgendaDateFlexible(value);
  if (!parsedDate) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const limit = new Date(now);
  limit.setDate(limit.getDate() + days);
  return parsedDate.getTime() >= now.getTime() && parsedDate.getTime() <= limit.getTime();
}

import type { AgendaRaft } from "@/types/agenda-page";
export function hasGiTest(raft: AgendaRaft) {
  const systemNorm = normalizeText(raft.cylinderSistema);
  if (systemNorm.includes("gi")) return true;

  const artigos = Array.isArray(raft.artigos) ? raft.artigos : [];
  return artigos.some((a) => {
    const txt = normalizeText(`${a?.name || ""} ${a?.item || ""} ${a?.referencia || ""}`);
    return txt.includes("gi test") || txt.includes("teste gi") || txt.includes(" g i ") || txt.startsWith("gi ") || txt.endsWith(" gi") || txt === "gi";
  });
}

export function normalizeList<T>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as T[];
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    const maybeData = (payload as { data?: unknown }).data;
    if (Array.isArray(maybeData)) {
      return maybeData as T[];
    }
  }
  return [];
}

export function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const LUNCH_START_MINUTES = 12 * 60 + 30;
export const LUNCH_END_MINUTES = 14 * 60;

export function getMinutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function setMinutesOfDay(date: Date, totalMinutes: number) {
  const next = new Date(date);
  next.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return next;
}

export function isDuringLunchBreak(date: Date) {
  const minutes = getMinutesOfDay(date);
  return minutes >= LUNCH_START_MINUTES && minutes < LUNCH_END_MINUTES;
}

export function computeOperationalEnd(start: Date, durationMinutes: number) {
  const normalizedStart = isDuringLunchBreak(start) ? setMinutesOfDay(start, LUNCH_END_MINUTES) : new Date(start);
  const startMinutes = getMinutesOfDay(normalizedStart);
  let end = new Date(normalizedStart.getTime() + durationMinutes * 60 * 1000);
  if (startMinutes < LUNCH_START_MINUTES && getMinutesOfDay(end) > LUNCH_START_MINUTES) {
    end = new Date(end.getTime() + (LUNCH_END_MINUTES - LUNCH_START_MINUTES) * 60 * 1000);
  }
  return end;
}

export function computeOperationalDuration(start: Date, end: Date) {
  const lunchStart = setMinutesOfDay(start, LUNCH_START_MINUTES);
  const lunchEnd = setMinutesOfDay(start, LUNCH_END_MINUTES);
  const lunchOverlap = Math.max(0, Math.min(end.getTime(), lunchEnd.getTime()) - Math.max(start.getTime(), lunchStart.getTime()));
  return Math.max(1, Math.round((end.getTime() - start.getTime() - lunchOverlap) / 60000));
}
