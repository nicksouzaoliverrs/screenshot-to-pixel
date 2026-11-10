import { addDays, weekdayOf } from "./domain/time";

export function monthStart(ym: string) {
  return `${ym}-01`;
}
export function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}
export function shiftMonth(ym: string, delta: number) {
  let [y, m] = ym.split("-").map(Number) as [number, number];
  m += delta;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}
/** Weeks (Sunday first) covering the month; each week is 7 dates. */
export function monthMatrix(ym: string): string[][] {
  const first = monthStart(ym);
  const start = addDays(first, -weekdayOf(first));
  const end = monthEnd(ym);
  const weeks: string[][] = [];
  for (let d = start; d <= end || weeks.length < 5; ) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(d);
      d = addDays(d, 1);
    }
    weeks.push(w);
    if (d > end && weeks.length >= 5) break;
  }
  return weeks;
}
export function weekDays(anyDate: string): string[] {
  const start = addDays(anyDate, -weekdayOf(anyDate));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
