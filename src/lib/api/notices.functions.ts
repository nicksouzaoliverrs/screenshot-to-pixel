import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "./auth-middleware";
import type { Member, Notice } from "../types";

export const publishNotice = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(2, "Informe o título.").max(120),
        body: z.string().trim().min(2, "Escreva a mensagem.").max(4000),
        priority: z.enum(["normal", "importante", "urgente"]),
        audience: z.enum(["todos", "ministerio", "selecionados"]),
        ministryIds: z.array(z.string()).max(60).default([]),
        memberIds: z.array(z.string()).max(500).default([]),
        publishAt: z.number().int().optional(),
        expiresAt: z.number().int().nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    const c = context.caller;
    ctx.assertActive(c);
    if (!c.isAdmin) {
      // Leaders can send notices only to their own ministries.
      if (data.audience !== "ministerio" || !data.ministryIds.length || data.ministryIds.some((m) => !c.leaderMinistryIds.includes(m)))
        throw new Error("Líderes só podem enviar comunicados para os próprios ministérios.");
    }
    let members: Member[] = [];
    if (data.audience === "todos") members = await g.query<Member>("members", { where: [["active", "==", true]] });
    else if (data.audience === "ministerio") {
      if (!data.ministryIds.length) throw new Error("Escolha pelo menos um ministério.");
      members = await g.query<Member>("members", { where: [["ministryIds", "array-contains-any", data.ministryIds.slice(0, 30)]] });
    } else {
      if (!data.memberIds.length) throw new Error("Escolha pelo menos um integrante.");
      members = await g.getMany<Member>("members", data.memberIds);
    }
    const recipientUserIds = Array.from(new Set(members.filter((m) => m.active && m.userId).map((m) => m.userId!)));
    if (!recipientUserIds.includes(c.uid)) recipientUserIds.push(c.uid);
    const now = Date.now();
    const id = crypto.randomUUID();
    const notice: Omit<Notice, "id"> = {
      title: data.title,
      body: data.body,
      priority: data.priority,
      audience: data.audience,
      ministryIds: data.ministryIds,
      memberIds: data.memberIds,
      recipientUserIds,
      publishAt: data.publishAt ?? now,
      expiresAt: data.expiresAt,
      createdAt: now,
      createdBy: c.uid,
      createdByName: c.displayName,
    };
    await g.setDoc(`notices/${id}`, notice as never, false);
    // Scheduled notices are delivered by the reminders job once publishAt passes.
    if (notice.publishAt <= now + 60_000) await deliverNotice(id);
    await ctx.logActivity(c, "Publicou comunicado", "comunicado", id, data.title);
    return { id, recipients: recipientUserIds.length };
  });

export async function deliverNotice(id: string) {
  const g = await import("@/lib/server/google.server");
  const ctx = await import("@/lib/server/context.server");
  const n = await g.getDoc<Notice>(`notices/${id}`);
  if (!n) return;
  const prefix = n.priority === "urgente" ? "Urgente: " : n.priority === "importante" ? "Importante: " : "";
  await ctx.notify(
    n.recipientUserIds.map((u) => ({
      userId: u,
      kind: "comunicado" as const,
      title: `${prefix}${n.title}`,
      body: n.body.slice(0, 180),
      link: "/comunicados",
      key: `comunicado_${id}_${u}`,
    })),
  );
  await g.setDoc(`notices/${id}`, { delivered: true });
}

export const deleteNotice = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    const n = await g.getDoc<Notice>(`notices/${data.id}`);
    if (!n) return { ok: true };
    if (!context.caller.isAdmin && n.createdBy !== context.caller.uid) throw new Error("Sem permissão.");
    await g.deleteDoc(`notices/${data.id}`);
    await ctx.logActivity(context.caller, "Excluiu comunicado", "comunicado", data.id, n.title);
    return { ok: true };
  });
