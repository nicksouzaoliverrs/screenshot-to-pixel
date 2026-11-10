import { TZ } from "./domain/time";

function dateObj(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

/** "dom., 12 de jan." */
export function fmtDateShort(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }).format(dateObj(date));
}
/** "domingo, 12 de janeiro" */
export function fmtDateLong(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(dateObj(date));
}
/** "12/01/2026" */
export function fmtDateNumeric(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(dateObj(date));
}
export function fmtMonthYear(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(dateObj(date));
}
export function fmtWeekdayShort(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(dateObj(date)).replace(".", "");
}
export function fmtDayNumber(date: string) {
  return String(Number(date.slice(8, 10)));
}
export function fmtDateTime(ms: number | null | undefined) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}
export function fmtRelative(ms: number, now = Date.now()) {
  const diff = Math.round((ms - now) / 60000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(diff / 60), "hour");
  return rtf.format(Math.round(diff / (60 * 24)), "day");
}
export function timeRange(start: string, end: string) {
  return end ? `${start} – ${end}` : start;
}
export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}
export function firstName(name?: string | null) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
export function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}
/** wa.me link; Brazilian numbers without country code get 55. */
export function whatsappLink(phone: string, text: string) {
  let d = onlyDigits(phone);
  if (d && d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
