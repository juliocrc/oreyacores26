/** Scheduled pack demand is a floor, not something historical averages can erase. */
export function adjustedForecast90d(scheduled: number, historical: number, blend: number): number {
  const planned = Math.max(0, scheduled);
  const past = Math.max(0, historical);
  return Math.ceil(Math.max(planned, planned * (1 - blend) + past * blend));
}

/** Latest order day for the first scheduled need of this particular item. */
export function forecastOrderDeadline(firstNeed: Date | null, leadDays: number, today: Date): string {
  const date = new Date(firstNeed || today);
  date.setHours(0, 0, 0, 0);
  if (firstNeed) date.setDate(date.getDate() - Math.max(0, leadDays));
  // Calendar dates must not shift when the server runs in another time zone.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
