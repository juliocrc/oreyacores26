export const AGENDA_TIME_ZONE = 'Atlantic/Azores';

export function agendaDateTime(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AGENDA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// RBC needs browser-local Date objects representing the station's wall clock.
export function agendaWallDate(value: Date | string): Date {
  return new Date(agendaDateTime(value));
}

export function parseAgendaDateTime(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(NaN);
  const target = Date.parse(`${value}:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const displayed = Date.parse(`${agendaDateTime(new Date(instant))}:00Z`);
    instant += target - displayed;
  }
  const result = new Date(instant);
  return agendaDateTime(result) === value ? result : new Date(NaN);
}

export function wallDateTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function agendaOperationalEnd(start: Date, duration: number): Date {
  return parseAgendaDateTime(wallDateTime(computeOperationalEnd(agendaWallDate(start), duration)));
}

export function agendaOperationalDuration(start: Date, end: Date): number {
  return computeOperationalDuration(agendaWallDate(start), agendaWallDate(end));
}
import { computeOperationalEnd, computeOperationalDuration } from '@/lib/agenda-page-helpers';
