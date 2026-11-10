import { addDays, weekdayOf } from "./time";

export type RecurrenceFrequency = "nenhuma" | "semanal" | "quinzenal" | "mensal";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Last date (inclusive). */
  until: string;
  /** Hard cap on occurrences. */
  maxCount?: number;
}

export const MAX_OCCURRENCES = 60;

/**
 * Dates for a recurring event starting at `start`.
 * - semanal: every 7 days
 * - quinzenal: every 14 days
 * - mensal: same weekday, same ordinal week of the month (e.g. 2nd Sunday); months lacking it are skipped
 */
export function recurrenceDates(start: string, rule: RecurrenceRule): string[] {
  if (rule.frequency === "nenhuma") return [start];
  const cap = Math.min(rule.maxCount ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const out: string[] = [];
  if (rule.frequency === "semanal" || rule.frequency === "quinzenal") {
    const step = rule.frequency === "semanal" ? 7 : 14;
    for (let d = start; d <= rule.until && out.length < cap; d = addDays(d, step)) out.push(d);
    return out;
  }
  const wd = weekdayOf(start);
  const ordinal = Math.floor((Number(start.slice(8, 10)) - 1) / 7); // 0-based week of month
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  while (out.length < cap) {
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const offset = (wd - weekdayOf(first) + 7) % 7;
    const day = 1 + offset + ordinal * 7;
    const candidate = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (day <= daysInMonth) {
      if (candidate > rule.until) break;
      if (candidate >= start) out.push(candidate);
    } else if (first > rule.until) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
