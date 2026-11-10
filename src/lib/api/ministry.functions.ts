import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "./auth-middleware";
import type { Account, Member, MemberPrivate, Ministry, MinistryFunction } from "../types";

const ministryInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Informe o nome do ministério.").max(80),
  description: z.string().max(500).default(""),
  icon: z.string().max(40).default("sparkles"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logo: z.string().max(300_000).nullable().default(null),
  active: z.boolean().default(true),
  notes: z.string().max(2000).default(""),
  leaderMemberIds: z.array(z.string()).max(20).default([]),
  leadersCanSchedule: z.boolean().default(true),
  confirmDeadlineHours: z.number().int().min(0).max(24 * 14).default(0),
  order: z.number().int().default(0),
  functions: z
    .array(z.object({ name: z.string().trim().min(1).max(60), defaultCount: z.number().int().min(1).max(50).default(1), required: z.boolean().default(false) }))
    .max(40)
    .optional(),
});

/** Admin: create or update a ministry (leaders' account ids are derived here for the security rules). */
export const saveMinistry = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => ministryInput.parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    ctx.assertAdmin(context.caller);
    if (data.logo && !data.logo.startsWith("data:image/")) throw new Error("Imagem inválida.");
    const leaders = await g.getMany<Member>("members", data.leaderMemberIds);
    const leaderUserIds = leaders.map((m) => m.userId).filter((u): u is string => !!u);
    const id = data.id ?? crypto.randomUUID();
    const existing = data.id ? await g.getDoc<Ministry>(`ministries/${id}`) : null;
    if (data.id && !existing) throw new Error("Ministério não encontrado.");
    const { functions, id: _omit, ...fields } = data;
    void _omit;
    const doc = {
      ...fields,
      leaderUserIds,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const writes: Parameters<typeof g.commit>[0] = [{ type: "set", path: `ministries/${id}`, data: doc }];
    // Leaders are always members of the ministry.
    for (const m of leaders)
      if (!m.ministryIds.includes(id))
        writes.push({ type: "set", path: `members/${m.id}`, data: { ministryIds: [...m.ministryIds, id] }, merge: true });
    (functions ?? []).forEach((f, i) => {
      const fid = crypto.randomUUID();
      const fn: Omit<MinistryFunction, "id"> = {
        ministryId: id,
        name: f.name,
        required: f.required,
        defaultCount: f.defaultCount,
        allowMultiple: f.defaultCount > 1,
        requiresQualification: false,
        notes: "",
        order: i,
        active: true,
      };
      writes.push({ type: "set", path: `functions/${fid}`, data: fn as never });
    });
    await g.commit(writes);
    await ctx.logActivity(context.caller, existing ? "Ministério atualizado" : "Ministério criado", "ministerio", id, data.name);
    return { id };
  });

export const deleteMinistry = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    ctx.assertAdmin(context.caller);
    const used = await g.query("assignments", { where: [["ministryId", "==", data.id]], limit: 1 });
    if (used.length)
      throw new Error("Este ministério já tem escalas no histórico. Desative-o para preservar o histórico em vez de excluir.");
    const m = await g.getDoc<Ministry>(`ministries/${data.id}`);
    const fns = await g.query<MinistryFunction>("functions", { where: [["ministryId", "==", data.id]] });
    const members = await g.query<Member>("members", { where: [["ministryIds", "array-contains", data.id]] });
    const fnIds = new Set(fns.map((f) => f.id));
    await g.commit([
      { type: "delete", path: `ministries/${data.id}` },
      ...fns.map((f) => ({ type: "delete" as const, path: `functions/${f.id}` })),
      ...members.map((mm) => ({
        type: "set" as const,
        path: `members/${mm.id}`,
        data: {
          ministryIds: mm.ministryIds.filter((x) => x !== data.id),
          functionIds: mm.functionIds.filter((x) => !fnIds.has(x)),
          qualifiedFunctionIds: (mm.qualifiedFunctionIds ?? []).filter((x) => !fnIds.has(x)),
        },
        merge: true,
      })),
    ]);
    await ctx.logActivity(context.caller, "Ministério excluído", "ministerio", data.id, m?.name ?? "");
    return { ok: true };
  });

const memberInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Informe o nome completo.").max(120),
  active: z.boolean().default(true),
  ministryIds: z.array(z.string()).max(50).default([]),
  functionIds: z.array(z.string()).max(200).default([]),
  qualifiedFunctionIds: z.array(z.string()).max(200).default([]),
  photo: z.string().max(400_000).nullable().default(null),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").or(z.literal("")).default(""),
  phone: z.string().max(30).default(""),
  birthDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
  notes: z.string().max(2000).default(""),
});

/** Admin: create or update a person. One record per person, linked to many ministries and functions. */
export const saveMember = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => memberInput.parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    ctx.assertAdmin(context.caller);
    if (data.photo && !data.photo.startsWith("data:image/")) throw new Error("Foto inválida.");
    const id = data.id ?? crypto.randomUUID();
    const existing = data.id ? await g.getDoc<Member>(`members/${id}`) : null;
    if (data.id && !existing) throw new Error("Integrante não encontrado.");

    if (data.email) {
      const dup = await g.query<MemberPrivate>("memberPrivate", { where: [["email", "==", data.email]], limit: 3 });
      if (dup.some((d) => d.id !== id)) throw new Error("Já existe um cadastro com este e-mail. Cada pessoa tem um único cadastro.");
    }
    // Keep only functions that belong to the selected ministries.
    const fns = await g.getMany<MinistryFunction>("functions", [...data.functionIds, ...data.qualifiedFunctionIds]);
    const validFn = new Set(fns.filter((f) => data.ministryIds.includes(f.ministryId)).map((f) => f.id));

    const memberDoc = {
      name: data.name,
      nameLower: data.name.toLowerCase(),
      photo: data.photo,
      active: data.active,
      ministryIds: data.ministryIds,
      functionIds: data.functionIds.filter((f) => validFn.has(f)),
      qualifiedFunctionIds: data.qualifiedFunctionIds.filter((f) => validFn.has(f)),
      userId: existing?.userId ?? null,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const priv = {
      email: data.email,
      phone: data.phone,
      birthDate: data.birthDate,
      birthMonthDay: data.birthDate ? data.birthDate.slice(5) : "",
      notes: data.notes,
    };
    const writes: Parameters<typeof g.commit>[0] = [
      { type: "set", path: `members/${id}`, data: memberDoc },
      { type: "set", path: `memberPrivate/${id}`, data: priv },
    ];
    // Removed from a ministry → no longer its leader.
    if (existing) {
      const removed = existing.ministryIds.filter((m) => !data.ministryIds.includes(m));
      for (const mid of removed) {
        const min = await g.getDoc<Ministry>(`ministries/${mid}`);
        if (min?.leaderMemberIds.includes(id))
          writes.push({
            type: "set",
            path: `ministries/${mid}`,
            data: {
              leaderMemberIds: min.leaderMemberIds.filter((x) => x !== id),
              leaderUserIds: min.leaderUserIds.filter((x) => x !== existing.userId),
            },
            merge: true,
          });
      }
      if (existing.userId) writes.push({ type: "set", path: `accounts/${existing.userId}`, data: { status: data.active ? "ativo" : "bloqueado" }, merge: true });
    }
    await g.commit(writes);

    // A pending account with the same verified e-mail is linked automatically.
    if (!memberDoc.userId && data.email) {
      const accs = await g.query<Account>("accounts", { where: [["email", "==", data.email]], limit: 3 });
      const acc = accs.find((a) => a.emailVerified && !a.memberId);
      if (acc) {
        await g.commit([
          { type: "set", path: `members/${id}`, data: { userId: acc.id }, merge: true },
          { type: "set", path: `accounts/${acc.id}`, data: { memberId: id, status: data.active ? "ativo" : "bloqueado" }, merge: true },
        ]);
        await ctx.notify([
          {
            userId: acc.id,
            kind: "conta",
            title: "Seu acesso foi liberado",
            body: "Seu cadastro foi ligado à sua conta. Suas escalas aparecem no aplicativo.",
            link: "/inicio",
            key: `conta_liberada_${acc.id}_${id}`,
          },
        ]);
      }
    }
    await ctx.logActivity(context.caller, existing ? "Integrante atualizado" : "Integrante cadastrado", "integrante", id, data.name);
    return { id };
  });
