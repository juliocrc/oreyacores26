export const OPENWA_HOURS = "Segunda a sexta, 09:00-12:30 e 14:00-17:30 (Atlantic/Azores).";

export function openwaBusinessHours(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Atlantic/Azores", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(part("weekday")) &&
    ((minutes >= 540 && minutes < 750) || (minutes >= 840 && minutes < 1050));
  return { open, timeZone: "Atlantic/Azores", hours: OPENWA_HOURS };
}
