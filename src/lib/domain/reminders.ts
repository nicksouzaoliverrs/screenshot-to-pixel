import type { AppSettings, Assignment } from "../types";
import { dateInTz, hourInTz } from "./time";

export type ReminderKind = "lembrete_dia" | "lembrete_2h" | "lembrete_pendente";
export interface DueReminder {
  kind: ReminderKind;
  key: string; // unique per assignment + kind → no duplicates
}

/**
 * Which reminders are due for an assignment at `now`. Cancelled events, replaced or
 * unavailable people never get reminders, so changes automatically stop pending reminders.
 */
export function dueReminders(
  a: Pick<Assignment, "id" | "status" | "startsAt" | "eventStatus" | "eventDate">,
  settings: AppSettings["reminders"],
  now: number,
  tz: string,
): DueReminder[] {
  if (a.eventStatus !== "ativo") return [];
  if (a.startsAt <= now) return [];
  const out: DueReminder[] = [];
  const serving = a.status === "pendente" || a.status === "confirmado";
  if (!serving) return out;
  const msLeft = a.startsAt - now;
  if (settings.dayOf && dateInTz(now, tz) === a.eventDate && hourInTz(now, tz) >= settings.dayOfHour && msLeft > 2 * 3600_000)
    out.push({ kind: "lembrete_dia", key: `lembrete_dia_${a.id}` });
  if (settings.twoHours && msLeft <= 2 * 3600_000)
    out.push({ kind: "lembrete_2h", key: `lembrete_2h_${a.id}` });
  if (settings.pending && a.status === "pendente" && msLeft <= settings.pendingHoursBefore * 3600_000 && msLeft > 2 * 3600_000)
    out.push({ kind: "lembrete_pendente", key: `lembrete_pendente_${a.id}` });
  return out;
}

/** Whether a member may still answer (confirm / unavailable) given the ministry deadline. */
export function canRespond(startsAt: number, deadlineHours: number, now: number) {
  return now < startsAt - Math.max(0, deadlineHours) * 3600_000;
}
