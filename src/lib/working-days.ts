const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDay(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

export function countWorkingDays(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): number {
  const first = toUtcDay(start);
  const last = toUtcDay(end);
  if (first == null || last == null || last < first) return 0;

  let count = 0;
  for (let current = first; current <= last; current += DAY_MS) {
    const dayOfWeek = new Date(current).getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count += 1;
  }
  return count;
}
