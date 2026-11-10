export const TZ = "America/Sao_Paulo";

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Local date ("YYYY-MM-DD") + time ("HH:MM") in the church timezone → epoch ms. */
export function zonedToEpoch(date: string, time: string, tz = TZ): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  const off = tzOffsetMs(guess, tz);
  const result = guess - off;
  // Re-check around DST transitions.
  const off2 = tzOffsetMs(result, tz);
  return off2 === off ? result : guess - off2;
}

/** Event start/end; an end time earlier than the start crosses midnight. */
export function eventWindow(date: string, startTime: string, endTime: string, tz = TZ) {
  const startsAt = zonedToEpoch(date, startTime, tz);
  let endsAt = endTime ? zonedToEpoch(date, endTime, tz) : startsAt + 2 * 3600_000;
  if (endsAt <= startsAt) endsAt += 24 * 3600_000;
  return { startsAt, endsAt };
}

/** "YYYY-MM-DD" for an instant, in the church timezone. */
export function dateInTz(ms: number = Date.now(), tz = TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Hour of day (0-23) for an instant, in the church timezone. */
export function hourInTz(ms: number = Date.now(), tz = TZ): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms))) % 24;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function dateInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}
