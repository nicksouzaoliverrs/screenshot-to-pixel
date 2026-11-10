import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "./auth-middleware";
import type { Assignment, AssignmentHistoryEntry, ChurchEvent, Member, Ministry, MinistryFunction, Unavailability } from "../types";
import { canRespond } from "../domain/reminders";
import { checkCandidate } from "../domain/conflicts";
import { fmtDateShort, timeRange } from "../format";

type G = typeof import("@/lib/server/google.server");
type Ctx = typeof import("@/lib/server/context.server");
const load = (): Promise<[G, Ctx]> => Promise.all([import("@/lib/server/google.server"), import("@/lib/server/context.server")]);

const label = (e: ChurchEvent) => `${e.title} — ${fmtDateShort(e.date)}, ${timeRange(e.startTime, e.endTime)}`;

/** The scheduled person confirms or declines. Only the owner of the assignment can answer it. */
export const respondAssignment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1), response: z.enum(["confirmado", "indisponivel"]), reason: z.string().trim().max(300).default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    const c = context.caller;
    ctx.assertActive(c);
    const a = await g.getDoc<Assignment>(`assignments/${data.id}`);
    if (!a) throw new Error("Escala não encontrada.");
    if (!c.member || a.memberId !== c.member.id) throw new Error("Você só pode responder às suas próprias escalas.");
    if (a.eventStatus !== "ativo") throw new Error("Este evento foi cancelado.");
    const [ev, min, fn] = await Promise.all([
      g.getDoc<ChurchEvent>(`events/${a.eventId}`),
      g.getDoc<Ministry>(`ministries/${a.ministryId}`),
      g.getDoc<MinistryFunction>(`functions/${a.functionId}`),
    ]);
    if (!ev || !min) throw new Error("Evento não encontrado.");
    const settings = await ctx.getSettings();
    const deadline = min.confirmDeadlineHours || settings.defaultConfirmDeadlineHours;
    if (!canRespond(a.startsAt, deadline, Date.now()))
      throw new Error(deadline ? `O prazo para responder terminou (${deadline}h antes do evento). Fale com o líder.` : "Este evento já começou.");
    if (a.status === "substituido" || a.status === "substituicao_solicitada")
      throw new Error("Um substituto já foi chamado para esta escala.");
    if (a.status === data.response) return { ok: true, unchanged: true };

    const now = Date.now();
    const entry: AssignmentHistoryEntry = {
      at: now,
      by: c.uid,
      byName: c.displayName,
      action: data.response === "confirmado" ? "Confirmou presença" : "Informou indisponibilidade",
      status: data.response,
      ...(data.reason ? { note: data.reason } : {}),
    };
    const managers = (await ctx.managersOf(a.ministryId)).filter((u) => u !== c.uid);
    const who = c.member.name;
    const fnName = fn?.name ?? "função";

    if (a.replacesId) {
      // A substitute answering the invitation.
      const orig = await g.getDoc<Assignment>(`assignments/${a.replacesId}`);
      if (data.response === "confirmado") {
        await g.commit([
          { type: "set", path: `assignments/${a.id}`, data: { status: "confirmado", reason: "", respondedAt: now, updatedAt: now, history: [...a.history, entry] }, merge: true },
          ...(orig
            ? [{ type: "set" as const, path: `assignments/${orig.id}`, data: { status: "substituido", updatedAt: now, history: [...orig.history, { at: now, by: c.uid, byName: who, action: `Substituído(a) por ${who}`, status: "substituido" }] }, merge: true }]
            : []),
        ]);
        await ctx.notify(
          [
            ...managers.map((u) => ({ userId: u, kind: "substituicao_confirmada" as const, title: "Substituição confirmada", body: `${who} confirmou a substituição em ${fnName} · ${label(ev)}.`, link: `/eventos/${ev.id}`, key: `subconf_${a.id}_${u}` })),
            ...(orig?.userId ? [{ userId: orig.userId, kind: "substituicao_confirmada" as const, title: "Substituição confirmada", body: `${who} vai te substituir em ${label(ev)}.`, link: "/minhas-escalas", key: `subconf_orig_${a.id}` }] : []),
          ],
          settings,
        );
      } else {
        // Declined: the invitation is removed and the original seat needs a substitute again.
        await g.commit([
          { type: "delete", path: `assignments/${a.id}` },
          ...(orig
            ? [{ type: "set" as const, path: `assignments/${orig.id}`, data: { status: "indisponivel", replacedById: null, updatedAt: now, history: [...orig.history, { at: now, by: c.uid, byName: who, action: `${who} recusou a substituição`, ...(data.reason ? { note: data.reason } : {}) }] }, merge: true }]
            : []),
        ]);
        await ctx.notify(
          managers.map((u) => ({ userId: u, kind: "substituicao_recusada" as const, title: "Substituto indisponível", body: `${who} não pode substituir em ${fnName} · ${label(ev)}${data.reason ? ` (${data.reason})` : ""}. Escolha outra pessoa.`, link: `/eventos/${ev.id}`, key: `subrec_${a.id}_${u}` })),
          settings,
        );
      }
      await ctx.logActivity(c, entry.action + " (substituição)", "escala", a.id, label(ev));
      return { ok: true };
    }

    await g.setDoc(`assignments/${a.id}`, { status: data.response, reason: data.reason, respondedAt: now, updatedAt: now, history: [...a.history, entry] });
    await ctx.notify(
      managers.map((u) =>
        data.response === "confirmado"
          ? { userId: u, kind: "confirmacao" as const, title: "Presença confirmada", body: `${who} confirmou ${fnName} · ${label(ev)}.`, link: `/eventos/${ev.id}`, key: `conf_${a.id}_${now}_${u}` }
          : { userId: u, kind: "indisponibilidade" as const, title: "Precisa de substituição", body: `${who} não poderá servir em ${fnName} · ${label(ev)}${data.reason ? ` — ${data.reason}` : ""}.`, link: `/eventos/${ev.id}`, key: `indisp_${a.id}_${now}_${u}` },
      ),
      settings,
    );
    await ctx.logActivity(c, entry.action, "escala", a.id, `${fnName} · ${label(ev)}`);
    return { ok: true };
  });

/** People of the same ministry and function with no conflict or unavailability. */
export const substitutionCandidates = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    const a = await g.getDoc<Assignment>(`assignments/${data.assignmentId}`);
    if (!a) throw new Error("Escala não encontrada.");
    const min = await g.getDoc<Ministry>(`ministries/${a.ministryId}`);
    if (!min || !ctx.canManageMinistry(context.caller, min)) throw new Error("Você não pode alterar esta escala.");
    const [ev, fn] = await Promise.all([g.getDoc<ChurchEvent>(`events/${a.eventId}`), g.getDoc<MinistryFunction>(`functions/${a.functionId}`)]);
    if (!ev || !fn) throw new Error("Evento não encontrado.");
    const members = (await g.query<Member>("members", { where: [["ministryIds", "array-contains", a.ministryId]] })).filter(
      (m) => m.active && m.id !== a.memberId && (m.functionIds.includes(fn.id) || (m.qualifiedFunctionIds ?? []).includes(fn.id)),
    );
    const sameDay = await g.query<Assignment>("assignments", { where: [["eventDate", "==", ev.date]] });
    const unav = members.length
      ? (await g.query<Unavailability>("unavailabilities", { where: [["memberId", "in", members.map((m) => m.id)]] })).filter((u) => u.startDate <= ev.date && u.endDate >= ev.date)
      : [];
    return members
      .filter(
        (m) =>
          checkCandidate({
            member: { ...m, qualifiedFunctionIds: m.qualifiedFunctionIds ?? [] },
            fn,
            event: ev,
            memberAssignments: sameDay.filter((x) => x.memberId === m.id),
            unavailabilities: unav.filter((u) => u.memberId === m.id),
          }).length === 0,
      )
      .map((m) => ({ id: m.id, name: m.name, photo: m.photo }))
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  });

export const chooseSubstitute = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string().min(1), memberId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const [g, ctx] = await load();
    const c = context.caller;
    const a = await g.getDoc<Assignment>(`assignments/${data.assignmentId}`);
    if (!a) throw new Error("Escala não encontrada.");
    const min = await g.getDoc<Ministry>(`ministries/${a.ministryId}`);
    if (!min || !ctx.canManageMinistry(c, min)) throw new Error("Você não pode alterar esta escala.");
    if (a.status !== "indisponivel" && a.status !== "substituicao_solicitada" && a.status !== "pendente")
      throw new Error("Esta escala não precisa de substituição.");
    if (a.eventStatus !== "ativo") throw new Error("Este evento está cancelado.");
    const [ev, fn, sub] = await Promise.all([
      g.getDoc<ChurchEvent>(`events/${a.eventId}`),
      g.getDoc<MinistryFunction>(`functions/${a.functionId}`),
      g.getDoc<Member>(`members/${data.memberId}`),
    ]);
    if (!ev || !fn || !sub) throw new Error("Dados não encontrados.");
    const sameDay = (await g.query<Assignment>("assignments", { where: [["eventDate", "==", ev.date]] })).filter((x) => x.id !== a.replacedById);
    const unav = (await g.query<Unavailability>("unavailabilities", { where: [["memberId", "==", sub.id]] })).filter((u) => u.startDate <= ev.date && u.endDate >= ev.date);
    const issues = checkCandidate({
      member: { ...sub, qualifiedFunctionIds: sub.qualifiedFunctionIds ?? [] },
      fn,
      event: ev,
      memberAssignments: sameDay.filter((x) => x.memberId === sub.id),
      unavailabilities: unav,
    });
    if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));

    const now = Date.now();
    const writes: Parameters<G["commit"]>[0] = [];
    if (a.replacedById) writes.push({ type: "delete", path: `assignments/${a.replacedById}` }); // previous invitation
    const id = crypto.randomUUID();
    const subA: Omit<Assignment, "id"> = {
      eventId: ev.id,
      eventDate: ev.date,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      eventStatus: "ativo",
      ministryId: a.ministryId,
      functionId: a.functionId,
      memberId: sub.id,
      userId: sub.userId,
      status: "pendente",
      reason: "",
      respondedAt: null,
      replacesId: a.id,
      replacedById: null,
      history: [{ at: now, by: c.uid, byName: c.displayName, action: "Convidado(a) para substituição", status: "pendente" }],
      createdAt: now,
      updatedAt: now,
    };
    writes.push({ type: "set", path: `assignments/${id}`, data: subA as never });
    writes.push({
      type: "set",
      path: `assignments/${a.id}`,
      data: {
        status: "substituicao_solicitada",
        replacedById: id,
        updatedAt: now,
        history: [...a.history, { at: now, by: c.uid, byName: c.displayName, action: `Substituição solicitada a ${sub.name}`, status: "substituicao_solicitada" }],
      },
      merge: true,
    });
    await g.commit(writes);
    const prevSub = a.replacedById ? await g.getDoc<Assignment>(`assignments/${a.replacedById}`) : null;
    await ctx.notify([
      ...(sub.userId
        ? [{ userId: sub.userId, kind: "substituicao_solicitada" as const, title: "Pedido de substituição", body: `Você pode servir em ${fn.name} · ${min.name} — ${label(ev)}? Confirme ou recuse.`, link: "/minhas-escalas", key: `subreq_${id}` }]
        : []),
      ...(prevSub?.userId ? [{ userId: prevSub.userId, kind: "escala_removida" as const, title: "Convite de substituição cancelado", body: label(ev), link: "/minhas-escalas", key: `subcancel_${prevSub.id}` }] : []),
    ]);
    await ctx.logActivity(c, `Solicitou substituição a ${sub.name}`, "escala", a.id, `${fn.name} · ${label(ev)}`);
    return { id };
  });
