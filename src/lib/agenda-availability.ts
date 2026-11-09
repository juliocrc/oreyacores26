import { getInspectionDefaults, resolveAgendaDuration } from "@/types/agenda";
import { getTechnicianKeyByName } from "@/lib/agenda-technicians";
import { agendaOperationalEnd } from '@/modules/Agenda/agenda-ui-dates';

export const AGENDA_TIME_ZONE = "Atlantic/Azores";
export const AGENDA_SEARCH_DAYS = 42;
export const AGENDA_ACTIVE_STATES = ["scheduled", "confirmed", "in_progress", "testing", "paused"];
const MINUTE = 60_000;
type Interval = [number, number];
export type AvailabilityTechnician = { id: number; nome: string };
export type AvailabilityEvent = {
  id: number; date: Date | string; responsavel?: string | null; status?: string | null;
  raftSerial?: string | null; type?: string | null; inspectionType?: string | null;
  durationMinutes?: number | null; bufferBeforeMinutes?: number | null; bufferAfterMinutes?: number | null;
};
export type AvailabilityAbsence = { tecnicoId: number; start: Date | string; end: Date | string };

/** Full half-open reservation window; special calendar records use elapsed time. */
export function agendaEventInterval(event: AvailabilityEvent): Interval {
  const defaults = getInspectionDefaults(event.inspectionType);
  const buffer = (value: number | null | undefined, fallback: number) => value != null && Number.isFinite(value) && value >= 0 ? value : fallback;
  const start = new Date(event.date);
  const duration = resolveAgendaDuration(event);
  const end = event.type === 'ausencia' || event.type === 'expiracao'
    ? start.getTime() + duration * MINUTE
    : agendaOperationalEnd(start, duration).getTime() + (start.getTime() % MINUTE);
  return [start.getTime() - buffer(event.bufferBeforeMinutes, defaults.bufferBeforeMinutes) * MINUTE,
    end + buffer(event.bufferAfterMinutes, defaults.bufferAfterMinutes) * MINUTE];
}

export function agendaIntervalsOverlap(a: Interval, b: Interval) { return a[0] < b[1] && b[0] < a[1]; }
export type CapacityMinutes = { availableMinutes: number; occupiedMinutes: number; freeMinutes: number; overbookedMinutes: number };
export type AgendaAvailability = {
  timeZone: string; weekStart: string; weekEnd: string;
  technicians: { id: number; nome: string; days: (CapacityMinutes & { date: string })[]; totals: CapacityMinutes }[];
  suggestions: { start: string; end: string; responsavel: string }[];
  unassignedMinutes: number; warnings?: string[];
};

export function isAgendaCivilDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2000-01-01" && value <= "2100-12-31"
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function agendaAddDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Resolve a civil time explicitly, independent of the server's timezone and DST.
export function agendaZonedTime(date: string, minutes = 0) {
  const target = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
  let result = target;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: AGENDA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(result);
    const part = (name: string) => parts.find(p => p.type === name)!.value;
    const local = Date.parse(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`);
    result += target - local;
  }
  return result;
}

export function agendaAvailabilityRange(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekStart = agendaAddDays(date, -((weekday + 6) % 7));
  const weekEnd = agendaAddDays(weekStart, 6);
  return { weekStart, weekEnd, start: agendaZonedTime(weekStart), end: agendaZonedTime(agendaAddDays(date, AGENDA_SEARCH_DAYS)) };
}

export function unionAgendaIntervals(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of intervals.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s).sort((a, b) => a[0] - b[0])) {
    const last = result[result.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
function intersect(intervals: Interval[], windows: Interval[]): Interval[] {
  return intervals.flatMap(([s, e]) => windows.map(([a, b]) => [Math.max(s, a), Math.min(e, b)] as Interval)).filter(([s, e]) => e > s);
}
function length(intervals: Interval[]) { return unionAgendaIntervals(intervals).reduce((n, [s, e]) => n + (e - s) / MINUTE, 0); }
function workWindows(date: string): Interval[] {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6 ? [] : [[540, 750], [840, 1050]].map(([s, e]) => [agendaZonedTime(date, s), agendaZonedTime(date, e)]);
}
function freeIntervals(windows: Interval[], blocked: Interval[]): Interval[] {
  return windows.flatMap(([start, end]) => {
    const result: Interval[] = [];
    let cursor = start;
    for (const [s, e] of unionAgendaIntervals(intersect(blocked, [[start, end]]))) {
      if (s > cursor) result.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < end) result.push([cursor, end]);
    return result;
  });
}

/** Pure calculation. Intervals are half-open; suggestions never mutate capacity. */
export function calculateAgendaAvailability(input: {
  date: string; durationMinutes?: number; technicians: AvailabilityTechnician[];
  events: AvailabilityEvent[]; absences: AvailabilityAbsence[];
  responsavel?: string; raftSerial?: string; excludeId?: number;
}): AgendaAvailability {
  if (!isAgendaCivilDate(input.date)) throw new Error("Invalid agenda date");
  const duration = input.durationMinutes ?? resolveAgendaDuration({});
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error("Invalid agenda duration");
  const { weekStart, weekEnd } = agendaAvailabilityRange(input.date);
  const warnings: string[] = [];
  const defaults = getInspectionDefaults("outro");
  const events = input.events.filter(e => e.id !== input.excludeId && AGENDA_ACTIVE_STATES.includes((e.status ?? "scheduled").trim().toLowerCase())).map(event => {
    return { event, interval: agendaEventInterval(event) };
  });
  const key = getTechnicianKeyByName;
  const matching = (name: string | null | undefined) => input.technicians.filter(t => key(t.nome) === key(name));
  let unassignedMinutes = 0;
  const weekWindows = Array.from({ length: 7 }, (_, i) => workWindows(agendaAddDays(weekStart, i))).flat();
  for (const { event, interval } of events) {
    if (matching(event.responsavel).length !== 1) unassignedMinutes += length(intersect([interval], weekWindows));
  }
  if (unassignedMinutes) warnings.push("Existem minutos ativos sem tecnico inequivoco; nao foram distribuidos automaticamente.");
  const suggestions: AgendaAvailability["suggestions"] = [];
  const technicians = input.technicians.filter(t => !input.responsavel || key(t.nome) === key(input.responsavel)).map(tech => {
    const occupied = events.filter(({ event }) => key(event.responsavel) === key(tech.nome)).map(e => e.interval);
    const absences = unionAgendaIntervals(input.absences.filter(a => a.tecnicoId === tech.id).map(a => [new Date(a.start).getTime(), new Date(a.end).getTime()]));
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = agendaAddDays(weekStart, i);
      const windows = workWindows(date);
      const available = freeIntervals(windows, absences);
      const occupiedMinutes = length(intersect(occupied, windows));
      const usableOccupied = length(intersect(occupied, available));
      const rawOccupied = occupied.reduce((n, interval) => n + length(intersect([interval], windows)), 0);
      return { date, availableMinutes: length(available), occupiedMinutes,
        freeMinutes: length(available) - usableOccupied,
        overbookedMinutes: rawOccupied - usableOccupied };
    });
    // Each suggestion is an independent alternative, not a provisional booking.
    const raftBusy = input.raftSerial ? events.filter(e => e.event.raftSerial === input.raftSerial).map(e => e.interval) : [];
    if (matching(tech.nome).length === 1) {
      let count = 0;
      for (let i = 0; i < AGENDA_SEARCH_DAYS && count < 3; i++) {
        for (const [s, e] of freeIntervals(workWindows(agendaAddDays(input.date, i)), [...occupied, ...absences, ...raftBusy])) {
          const start = s + defaults.bufferBeforeMinutes * MINUTE;
          if (start + (duration + defaults.bufferAfterMinutes) * MINUTE > e) continue;
          suggestions.push({ start: new Date(start).toISOString(), end: new Date(start + duration * MINUTE).toISOString(), responsavel: tech.nome });
          if (++count === 3) break;
        }
      }
    } else warnings.push("Nome de tecnico ambiguo; sugestoes omitidas para esse nome.");
    const totals = days.reduce((sum, day) => ({ availableMinutes: sum.availableMinutes + day.availableMinutes,
      occupiedMinutes: sum.occupiedMinutes + day.occupiedMinutes, freeMinutes: sum.freeMinutes + day.freeMinutes,
      overbookedMinutes: sum.overbookedMinutes + day.overbookedMinutes }),
    { availableMinutes: 0, occupiedMinutes: 0, freeMinutes: 0, overbookedMinutes: 0 });
    return { ...tech, days, totals };
  });
  suggestions.sort((a, b) => a.start.localeCompare(b.start) || a.responsavel.localeCompare(b.responsavel));
  const selected = suggestions.slice(0, 3);
  if (selected.length < 3) warnings.push("Menos de tres alternativas disponiveis no horizonte de 42 dias.");
  return { timeZone: AGENDA_TIME_ZONE, weekStart, weekEnd, technicians, suggestions: selected, unassignedMinutes,
    ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}) };
}
