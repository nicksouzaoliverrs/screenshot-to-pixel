import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "./auth-middleware";
import type { Assignment, ChurchEvent, Member, Ministry, MinistryFunction, Unavailability } from "../types";
import { eventWindow } from "../domain/time";
import { recurrenceDates } from "../domain/recurrence";
import { checkCandidate, hasBlocking, type Issue } from "../domain/conflicts";
import { fmtDateShort, timeRange } from "../format";

const slot = z.object({ ministryId: z.string().min(1), functionId: z.string().min(1), count: z.number().int().min(0).max(50) });
const time = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const eventInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Informe o nome do evento.").max(120),
  kind: z.string().max(80).default(""),
  date,
  startTime: time,
  endTime: time.or(z.literal("")).default(""),
  description: z.string().max(2000).default(""),
  location: z.string().max(200).default(""),
  notes: z.string().max(2000).default(""),
  ministryIds: z.array(z.string()).max(60).default([]),
  slots: z.array(slot).max(300).default([]),
  templateId: z.string().nullable().default(null),
  recurrence: z
    .object({ frequency: z.enum(["nenhuma", "semanal", "quinzenal", "mensal"]), until: date })
    .optional(),
  applyToSeries: z.boolean().default(false),
});

type G = typeof import("@/lib/server/google.server");
type Ctx = typeof import("@/lib/server/context.server");
async function load(): Promise<[G, Ctx]> {
  return Promise.all([import("@/lib/server/google.server"), import("@/lib/server/context.server")]);
}

const SERVING = new Set(["pendente", "confirmado", "substituicao_solicitada"]);

function eventLabel(e: Pick<ChurchEvent, "title" | "date" | "startTime" | "endTime">) {
  return `${e.title} — ${fmtDateShort(e.date)}, ${timeRange(e.startTime, e.endTime)}`;
}

export const saveEvent = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => eventInput.parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    ctx.assertAdmin(context.caller);
    const settings = await ctx.getSettings();
    const now = Date.now();
    const ministryIds = Array.from(new Set([...data.ministryIds, ...data.slots.map((s) => s.ministryId)]));
    const slots = data.slots.filter((s) => s.count > 0);

    if (!data.id) {
      const dates = recurrenceDates(data.date, data.recurrence ?? { frequency: "nenhuma", until: data.date });
      const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
      const ids: string[] = [];
      const writes: Parameters<G["commit"]>[0] = [];
      for (const d of dates) {
        const id = crypto.randomUUID();
        ids.push(id);
        const w = eventWindow(d, data.startTime, data.endTime, settings.timezone);
        const doc: Omit<ChurchEvent, "id"> = {
          title: data.title,
          kind: data.kind,
          date: d,
          startTime: data.startTime,
          endTime: data.endTime,
          ...w,
          description: data.description,
          location: data.location,
          notes: data.notes,
          status: "ativo",
          ministryIds,
          slots,
          seriesId,
          templateId: data.templateId,
          createdAt: now,
          createdBy: context.caller.uid,
          updatedAt: now,
        };
        writes.push({ type: "set", path: `events/${id}`, data: doc as never });
      }
      await g.commit(writes);
      await ctx.logActivity(context.caller, dates.length > 1 ? `Criou ${dates.length} eventos recorrentes` : "Criou evento", "evento", ids[0]!, data.title);
      return { ids };
    }

    const current = await g.getDoc<ChurchEvent>(`events/${data.id}`);
    if (!current) throw new Error("Evento não encontrado.");
    const targets: ChurchEvent[] = [current];
    if (data.applyToSeries && current.seriesId) {
      const series = await g.query<ChurchEvent>("events", { where: [["seriesId", "==", current.seriesId]] });
      for (const e of series) if (e.id !== current.id && e.date >= current.date && e.status === "ativo") targets.push(e);
    }
    const changedEvents: { before: ChurchEvent; after: ChurchEvent }[] = [];
    const writes: Parameters<G["commit"]>[0] = [];
    for (const e of targets) {
      const d = e.id === current.id ? data.date : e.date;
      const w = eventWindow(d, data.startTime, data.endTime, settings.timezone);
      const after: ChurchEvent = {
        ...e,
        title: data.title,
        kind: data.kind,
        date: d,
        startTime: data.startTime,
        endTime: data.endTime,
        ...w,
        description: data.description,
        location: data.location,
        notes: data.notes,
        ministryIds,
        slots,
        updatedAt: now,
      };
      const { id: _id, ...rest } = after;
      void _id;
      writes.push({ type: "set", path: `events/${e.id}`, data: rest as never });
      changedEvents.push({ before: e, after });
    }
    await g.commit(writes);

    // Propagate date/time to the schedule and tell people when something relevant changed.
    const notes: Parameters<Ctx["notify"]>[0] = [];
    for (const { before, after } of changedEvents) {
      const timingChanged = before.date !== after.date || before.startTime !== after.startTime || before.endTime !== after.endTime;
      const placeChanged = before.location !== after.location || before.title !== after.title;
      if (!timingChanged && !placeChanged) continue;
      const list = await g.query<Assignment>("assignments", { where: [["eventId", "==", after.id]] });
      await g.commit(
        list.map((a) => ({
          type: "set" as const,
          path: `assignments/${a.id}`,
          data: { eventDate: after.date, startsAt: after.startsAt, endsAt: after.endsAt, updatedAt: now },
          merge: true,
        })),
      );
      for (const a of list)
        if (SERVING.has(a.status) && a.userId)
          notes.push({
            userId: a.userId,
            kind: "escala_alterada",
            title: "Escala alterada",
            body: `${eventLabel(after)}${after.location ? ` · ${after.location}` : ""}. Confira os novos detalhes.`,
            link: "/minhas-escalas",
            key: `alterada_${a.id}_${after.date}_${after.startTime}_${after.endTime}_${after.location}`.slice(0, 280),
          });
    }
    await ctx.notify(notes, settings);
    await ctx.logActivity(context.caller, changedEvents.length > 1 ? `Atualizou ${changedEvents.length} eventos da série` : "Atualizou evento", "evento", current.id, data.title);
    return { ids: changedEvents.map((c) => c.after.id) };
  });

export const cancelEvent = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1), reason: z.string().max(300).default(""), reactivate: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    ctx.assertAdmin(context.caller);
    const ev = await g.getDoc<ChurchEvent>(`events/${data.id}`);
    if (!ev) throw new Error("Evento não encontrado.");
    const status = data.reactivate ? "ativo" : "cancelado";
    const list = await g.query<Assignment>("assignments", { where: [["eventId", "==", ev.id]] });
    await g.commit([
      { type: "set", path: `events/${ev.id}`, data: { status, notes: data.reason ? `${ev.notes}${ev.notes ? "\n" : ""}Cancelamento: ${data.reason}` : ev.notes, updatedAt: Date.now() }, merge: true },
      ...list.map((a) => ({ type: "set" as const, path: `assignments/${a.id}`, data: { eventStatus: status }, merge: true })),
    ]);
    const notes = list
      .filter((a) => SERVING.has(a.status) && a.userId)
      .map((a) => ({
        userId: a.userId!,
        kind: (data.reactivate ? "escala_alterada" : "evento_cancelado") as "escala_alterada" | "evento_cancelado",
        title: data.reactivate ? "Evento reativado" : "Evento cancelado",
        body: `${eventLabel(ev)}${data.reason ? ` — ${data.reason}` : ""}`,
        link: "/minhas-escalas",
        key: `${data.reactivate ? "reativado" : "cancelado"}_${a.id}_${Date.now()}`,
      }));
    await ctx.notify(notes);
    await ctx.logActivity(context.caller, data.reactivate ? "Reativou evento" : "Cancelou evento", "evento", ev.id, ev.title);
    return { ok: true };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    ctx.assertAdmin(context.caller);
    const ev = await g.getDoc<ChurchEvent>(`events/${data.id}`);
    if (!ev) return { ok: true };
    const list = await g.query<Assignment>("assignments", { where: [["eventId", "==", ev.id]] });
    if (ev.status === "ativo" && list.some((a) => SERVING.has(a.status)))
      throw new Error("Este evento tem pessoas escaladas. Cancele o evento primeiro para avisá-las.");
    await g.commit([{ type: "delete", path: `events/${ev.id}` }, ...list.map((a) => ({ type: "delete" as const, path: `assignments/${a.id}` }))]);
    await ctx.logActivity(context.caller, "Excluiu evento", "evento", ev.id, eventLabel(ev));
    return { ok: true };
  });

export const duplicateEvent = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1), date, copyRoster: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    ctx.assertAdmin(context.caller);
    const settings = await ctx.getSettings();
    const ev = await g.getDoc<ChurchEvent>(`events/${data.id}`);
    if (!ev) throw new Error("Evento não encontrado.");
    const id = crypto.randomUUID();
    const now = Date.now();
    const w = eventWindow(data.date, ev.startTime, ev.endTime, settings.timezone);
    const { id: _id, ...rest } = ev;
    void _id;
    await g.setDoc(`events/${id}`, { ...rest, date: data.date, ...w, status: "ativo", seriesId: null, createdAt: now, createdBy: context.caller.uid, updatedAt: now } as never, false);
    let copied = 0;
    let skipped = 0;
    if (data.copyRoster) {
      const list = (await g.query<Assignment>("assignments", { where: [["eventId", "==", ev.id]] })).filter((a) => SERVING.has(a.status) || a.status === "substituido");
      // Use the people actually serving (substitutes instead of replaced people).
      const items = list.filter((a) => a.status !== "substituido" && a.status !== "substituicao_solicitada").map((a) => ({ functionId: a.functionId, memberId: a.memberId }));
      const r = await addAssignmentsCore(g, ctx, context.caller, id, items, true, true);
      copied = r.added;
      skipped = r.skipped.length;
    }
    await ctx.logActivity(context.caller, "Duplicou evento", "evento", id, `${ev.title} → ${data.date}`);
    return { id, copied, skipped };
  });

/* ------------------------------ roster ------------------------------ */

async function candidateContext(g: G, ev: ChurchEvent, memberIds: string[]) {
  const sameDay = await g.query<Assignment>("assignments", { where: [["eventDate", "==", ev.date]] });
  const unav = memberIds.length
    ? (await g.query<Unavailability>("unavailabilities", { where: [["memberId", "in", memberIds]] })).filter(
        (u) => u.startDate <= ev.date && u.endDate >= ev.date,
      )
    : [];
  const otherEventIds = Array.from(new Set(sameDay.filter((a) => a.eventId !== ev.id).map((a) => a.eventId)));
  const titles = Object.fromEntries((await g.getMany<ChurchEvent>("events", otherEventIds)).map((e) => [e.id, e.title]));
  return { sameDay, unav, titles };
}

export interface Candidate {
  member: Pick<Member, "id" | "name" | "photo" | "functionIds" | "qualifiedFunctionIds">;
  issues: Issue[];
}

/** Members of the ministry with their conflicts for a function of an event (for the picker). */
export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().min(1), functionId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<Candidate[]> => {
    const [g, ctx] = await load();
    ctx.assertActive(context.caller);
    const [ev, fn] = await Promise.all([g.getDoc<ChurchEvent>(`events/${data.eventId}`), g.getDoc<MinistryFunction>(`functions/${data.functionId}`)]);
    if (!ev || !fn) throw new Error("Evento ou função não encontrados.");
    const ministry = await g.getDoc<Ministry>(`ministries/${fn.ministryId}`);
    if (!ministry || !ctx.canManageMinistry(context.caller, ministry)) throw new Error("Você não pode montar a escala deste ministério.");
    const members = (await g.query<Member>("members", { where: [["ministryIds", "array-contains", fn.ministryId]] })).filter((m) => m.active);
    const { sameDay, unav, titles } = await candidateContext(g, ev, members.map((m) => m.id));
    return members
      .map((m) => ({
        member: { id: m.id, name: m.name, photo: m.photo, functionIds: m.functionIds, qualifiedFunctionIds: m.qualifiedFunctionIds ?? [] },
        issues: checkCandidate({
          member: { ...m, qualifiedFunctionIds: m.qualifiedFunctionIds ?? [] },
          fn,
          event: ev,
          memberAssignments: sameDay.filter((a) => a.memberId === m.id),
          unavailabilities: unav.filter((u) => u.memberId === m.id),
          eventTitles: titles,
        }),
      }))
      .sort((a, b) => a.issues.length - b.issues.length || a.member.name.localeCompare(b.member.name, "pt-BR"));
  });

type Caller = import("@/lib/server/context.server").Caller;

async function addAssignmentsCore(
  g: G,
  ctx: Ctx,
  caller: Caller,
  eventId: string,
  items: { functionId: string; memberId: string }[],
  force: boolean,
  skipInvalid = false,
) {
  const ev = await g.getDoc<ChurchEvent>(`events/${eventId}`);
  if (!ev) throw new Error("Evento não encontrado.");
  if (ev.status !== "ativo") throw new Error("Este evento está cancelado.");
  const fns = new Map((await g.getMany<MinistryFunction>("functions", items.map((i) => i.functionId))).map((f) => [f.id, f]));
  const ministries = new Map((await g.getMany<Ministry>("ministries", Array.from(fns.values()).map((f) => f.ministryId))).map((m) => [m.id, m]));
  const members = await ctx.membersById(items.map((i) => i.memberId));
  const { sameDay, unav, titles } = await candidateContext(g, ev, Array.from(members.keys()));
  const issues: { memberId: string; functionId: string; issues: Issue[] }[] = [];
  const skipped: string[] = [];
  const toAdd: Assignment[] = [];
  const now = Date.now();
  const pool = [...sameDay];
  for (const it of items) {
    const fn = fns.get(it.functionId);
    const m = members.get(it.memberId);
    const min = fn ? ministries.get(fn.ministryId) : undefined;
    if (!fn || !m || !min) {
      if (skipInvalid) {
        skipped.push(it.memberId);
        continue;
      }
      throw new Error("Integrante ou função não encontrados.");
    }
    if (!ctx.canManageMinistry(caller, min)) throw new Error(`Você não pode montar a escala de ${min.name}.`);
    const found = checkCandidate({
      member: { ...m, qualifiedFunctionIds: m.qualifiedFunctionIds ?? [] },
      fn,
      event: ev,
      memberAssignments: pool.filter((a) => a.memberId === m.id),
      unavailabilities: unav.filter((u) => u.memberId === m.id),
      eventTitles: titles,
    });
    if (hasBlocking(found) || (found.length && !force)) {
      if (skipInvalid && hasBlocking(found)) {
        skipped.push(m.id);
        continue;
      }
      issues.push({ memberId: m.id, functionId: fn.id, issues: found });
      continue;
    }
    const a: Assignment = {
      id: crypto.randomUUID(),
      eventId: ev.id,
      eventDate: ev.date,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      eventStatus: ev.status,
      ministryId: fn.ministryId,
      functionId: fn.id,
      memberId: m.id,
      userId: m.userId,
      status: "pendente",
      reason: "",
      respondedAt: null,
      replacesId: null,
      replacedById: null,
      history: [{ at: now, by: caller.uid, byName: caller.displayName, action: "Escalado(a)", status: "pendente", note: found.length ? found.map((f) => f.message).join(" ") : undefined }],
      createdAt: now,
      updatedAt: now,
    };
    toAdd.push(a);
    pool.push(a);
  }
  if (issues.length) return { added: 0, issues, skipped };
  const newMinistries = Array.from(new Set(toAdd.map((a) => a.ministryId))).filter((m) => !ev.ministryIds.includes(m));
  await g.commit([
    ...toAdd.map((a) => {
      const { id, ...rest } = a;
      return { type: "set" as const, path: `assignments/${id}`, data: JSON.parse(JSON.stringify(rest)) };
    }),
    ...(newMinistries.length ? [{ type: "set" as const, path: `events/${ev.id}`, data: { ministryIds: [...ev.ministryIds, ...newMinistries] }, merge: true }] : []),
  ]);
  await ctx.notify(
    toAdd
      .filter((a) => a.userId)
      .map((a) => ({
        userId: a.userId!,
        kind: "escalado" as const,
        title: "Você foi escalado(a)",
        body: `${fns.get(a.functionId)?.name} · ${ministries.get(a.ministryId)?.name} — ${eventLabel(ev)}. Confirme sua presença.`,
        link: "/minhas-escalas",
        key: `escalado_${a.id}`,
      })),
  );
  if (toAdd.length) await ctx.logActivity(caller, `Escalou ${toAdd.length} pessoa(s)`, "evento", ev.id, ev.title);
  return { added: toAdd.length, issues: [], skipped };
}

export const addAssignments = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        items: z.array(z.object({ functionId: z.string().min(1), memberId: z.string().min(1) })).min(1).max(100),
        force: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    ctx.assertActive(context.caller);
    return addAssignmentsCore(g, ctx, context.caller, data.eventId, data.items, data.force);
  });

export const removeAssignment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    const a = await g.getDoc<Assignment>(`assignments/${data.id}`);
    if (!a) return { ok: true };
    const min = await g.getDoc<Ministry>(`ministries/${a.ministryId}`);
    if (!min || !ctx.canManageMinistry(context.caller, min)) throw new Error("Você não pode alterar esta escala.");
    const ev = await g.getDoc<ChurchEvent>(`events/${a.eventId}`);
    const writes: Parameters<G["commit"]>[0] = [{ type: "delete", path: `assignments/${a.id}` }];
    // Removing a pending substitute re-opens the original seat.
    if (a.replacesId) {
      const orig = await g.getDoc<Assignment>(`assignments/${a.replacesId}`);
      if (orig && orig.status !== "substituido")
        writes.push({
          type: "set",
          path: `assignments/${orig.id}`,
          data: {
            status: "indisponivel",
            replacedById: null,
            history: [...orig.history, { at: Date.now(), by: context.caller.uid, byName: context.caller.displayName, action: "Substituto removido", status: "indisponivel" }],
          },
          merge: true,
        });
    }
    await g.commit(writes);
    if (a.userId && SERVING.has(a.status) && ev)
      await ctx.notify([
        { userId: a.userId, kind: "escala_removida", title: "Você saiu de uma escala", body: eventLabel(ev), link: "/minhas-escalas", key: `removida_${a.id}` },
      ]);
    await ctx.logActivity(context.caller, "Removeu pessoa da escala", "evento", a.eventId, ev?.title ?? "");
    return { ok: true };
  });
