import { commit, query } from "./google.server";
import { deliver, getSettings, notify } from "./context.server";
import { dueReminders } from "../domain/reminders";
import { fmtDateShort, timeRange } from "../format";
import type { AppNotification, Assignment, ChurchEvent, MinistryFunction, Notice } from "../types";

export async function runReminders(now: number) {
  const settings = await getSettings();
  const horizon = now + 3 * 24 * 3600_000;
  const upcoming = (
    await query<Assignment>("assignments", { where: [["startsAt", ">", now], ["startsAt", "<=", horizon]] })
  ).filter((a) => a.userId && a.eventStatus === "ativo");

  const eventIds = Array.from(new Set(upcoming.map((a) => a.eventId)));
  const fnIds = Array.from(new Set(upcoming.map((a) => a.functionId)));
  const { getMany } = await import("./google.server");
  const events = new Map((await getMany<ChurchEvent>("events", eventIds)).map((e) => [e.id, e]));
  const fns = new Map((await getMany<MinistryFunction>("functions", fnIds)).map((f) => [f.id, f]));

  const items: Parameters<typeof notify>[0] = [];
  for (const a of upcoming) {
    const ev = events.get(a.eventId);
    if (!ev || ev.status !== "ativo") continue;
    const what = `${fns.get(a.functionId)?.name ?? "Escala"} · ${ev.title} — ${fmtDateShort(ev.date)}, ${timeRange(ev.startTime, ev.endTime)}`;
    for (const r of dueReminders(a, settings.reminders, now, settings.timezone)) {
      items.push({
        userId: a.userId!,
        kind: r.kind,
        title: r.kind === "lembrete_dia" ? "Hoje você serve" : r.kind === "lembrete_2h" ? "Começa em 2 horas" : "Confirme sua presença",
        body: r.kind === "lembrete_pendente" ? `${what}. Ainda aguardamos sua resposta.` : `${what}${ev.location ? ` · ${ev.location}` : ""}`,
        link: "/minhas-escalas",
        key: r.key,
      });
    }
  }
  const created = await notify(items, settings);

  // Scheduled notices whose time has come.
  const notices = (await query<Notice & { delivered?: boolean }>("notices", { where: [["publishAt", "<=", now]], orderBy: [["publishAt", "desc"]], limit: 50 })).filter((n) => !n.delivered);
  const { deliverNotice } = await import("./notices.server");
  for (const n of notices) await deliverNotice(n.id);

  // Retry push for notifications still pending (e.g. a send failed mid-way).
  const pending = (await query<AppNotification>("notifications", { where: [["push", "==", "pendente"]], limit: 100 })).filter((n) => now - n.createdAt > 60_000);
  await deliver(pending);

  // Old read notifications are trimmed to keep the inbox light (90 days).
  const old = await query<AppNotification>("notifications", { where: [["createdAt", "<", now - 90 * 24 * 3600_000]], limit: 300 });
  await commit(old.filter((n) => n.read).map((n) => ({ type: "delete" as const, path: `notifications/${n.id}` })));

  return { ok: true, checked: upcoming.length, reminders: created.length, notices: notices.length, retried: pending.length };
}
