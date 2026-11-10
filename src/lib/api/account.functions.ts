import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "./auth-middleware";
import type { Account, Member, MemberPrivate, Ministry } from "../types";

/** Called after every sign-in: creates the account, links it to a member by verified e-mail, bootstraps the first admin. */
export const syncAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    const c = context.caller;
    const now = Date.now();
    let account = c.account;
    const existingAdmins = await ctx.adminUserIds();
    const firstUser = existingAdmins.length === 0;

    if (!account) {
      account = {
        id: c.uid,
        email: c.email,
        emailVerified: c.emailVerified,
        name: c.name || c.email.split("@")[0] || "Integrante",
        photoURL: c.picture,
        memberId: null,
        status: "pendente",
        createdAt: now,
        lastSeenAt: now,
      };
      await g.createDoc("accounts", c.uid, { ...account, id: undefined } as never);
    } else {
      await g.setDoc(`accounts/${c.uid}`, { lastSeenAt: now, emailVerified: c.emailVerified, email: c.email });
      account = { ...account, emailVerified: c.emailVerified, email: c.email };
    }

    if (firstUser) {
      // First person to sign in becomes the general administrator.
      await g.setDoc(`roles/${c.uid}`, { admin: true });
      await g.setDoc(`accounts/${c.uid}`, { status: "ativo" });
      account.status = "ativo";
      await ctx.logActivity({ uid: c.uid, displayName: account.name }, "Primeiro administrador criado", "conta", c.uid);
    }

    if (!account.memberId && (c.emailVerified || firstUser) && c.email) {
      const priv = await g.query<MemberPrivate>("memberPrivate", { where: [["email", "==", c.email]], limit: 5 });
      let linked: Member | null = null;
      for (const p of priv) {
        const m = await g.getDoc<Member>(`members/${p.id}`);
        if (m && !m.userId) {
          linked = m;
          break;
        }
      }
      if (!linked && firstUser) {
        const id = crypto.randomUUID();
        const m: Omit<Member, "id"> = {
          name: account.name,
          nameLower: account.name.toLowerCase(),
          photo: null,
          active: true,
          ministryIds: [],
          functionIds: [],
          qualifiedFunctionIds: [],
          userId: null,
          createdAt: now,
        };
        await g.commit([
          { type: "set", path: `members/${id}`, data: m as never },
          { type: "set", path: `memberPrivate/${id}`, data: { email: c.email, phone: "", birthDate: "", birthMonthDay: "", notes: "" } },
        ]);
        linked = { ...m, id };
      }
      if (linked) {
        await linkAccountToMember(c.uid, linked.id, linked.active);
        account.memberId = linked.id;
        if (linked.active) account.status = "ativo";
      }
    }

    if (account.status === "pendente") {
      const admins = firstUser ? [] : existingAdmins;
      await ctx.notify(
        admins.map((uid) => ({
          userId: uid,
          kind: "conta" as const,
          title: "Novo acesso aguardando liberação",
          body: `${account!.name} (${account!.email}) entrou no Escala+ e aguarda vínculo.`,
          link: "/configuracoes?aba=usuarios",
          key: `conta_${c.uid}_${uid}`,
        })),
      );
    }
    const role = await g.getDoc<{ admin: boolean }>(`roles/${c.uid}`);
    return { account, isAdmin: account.status === "ativo" && role?.admin === true };
  });

async function linkAccountToMember(uid: string, memberId: string, memberActive: boolean) {
  const g = await import("@/lib/server/google.server");
  const ministries = await g.query<Ministry>("ministries", { where: [["leaderMemberIds", "array-contains", memberId]] });
  await g.commit([
    { type: "set", path: `members/${memberId}`, data: { userId: uid }, merge: true },
    { type: "set", path: `accounts/${uid}`, data: { memberId, status: memberActive ? "ativo" : "bloqueado" }, merge: true },
    ...ministries.map((m) => ({
      type: "set" as const,
      path: `ministries/${m.id}`,
      data: { leaderUserIds: Array.from(new Set([...(m.leaderUserIds ?? []), uid])) },
      merge: true,
    })),
  ]);
  // Existing assignments of this member become visible to the new account.
  const assignments = await g.query<{ userId: string | null }>("assignments", { where: [["memberId", "==", memberId]] });
  const unav = await g.query<{ userId: string | null }>("unavailabilities", { where: [["memberId", "==", memberId]] });
  await g.commit([
    ...assignments.map((a) => ({ type: "set" as const, path: `assignments/${a.id}`, data: { userId: uid }, merge: true })),
    ...unav.map((a) => ({ type: "set" as const, path: `unavailabilities/${a.id}`, data: { userId: uid }, merge: true })),
  ]);
}

/** Admin: link a pending account to an existing member, or create a new member for it. */
export const linkAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().min(1), memberId: z.string().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    ctx.assertAdmin(context.caller);
    const acc = await g.getDoc<Account>(`accounts/${data.accountId}`);
    if (!acc) throw new Error("Conta não encontrada.");
    let memberId = data.memberId;
    if (memberId) {
      const m = await g.getDoc<Member>(`members/${memberId}`);
      if (!m) throw new Error("Integrante não encontrado.");
      if (m.userId && m.userId !== acc.id) throw new Error("Este integrante já está ligado a outra conta.");
    } else {
      memberId = crypto.randomUUID();
      await g.commit([
        {
          type: "set",
          path: `members/${memberId}`,
          data: {
            name: acc.name,
            nameLower: acc.name.toLowerCase(),
            photo: null,
            active: true,
            ministryIds: [],
            functionIds: [],
            qualifiedFunctionIds: [],
            userId: null,
            createdAt: Date.now(),
          },
        },
        { type: "set", path: `memberPrivate/${memberId}`, data: { email: acc.email, phone: "", birthDate: "", birthMonthDay: "", notes: "" } },
      ]);
    }
    await linkAccountToMember(acc.id, memberId, true);
    await g.setDoc(`accounts/${acc.id}`, { status: "ativo" });
    await ctx.logActivity(context.caller, "Acesso liberado", "conta", acc.id, acc.email);
    await ctx.notify([
      {
        userId: acc.id,
        kind: "conta",
        title: "Seu acesso foi liberado",
        body: "Bem-vindo(a) ao Escala+! Suas escalas já aparecem no aplicativo.",
        link: "/inicio",
        key: `conta_liberada_${acc.id}_${memberId}`,
      },
    ]);
    return { memberId };
  });

export const setAccountAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(1), admin: z.boolean().optional(), status: z.enum(["ativo", "bloqueado", "pendente"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const ctx = await import("@/lib/server/context.server");
    ctx.assertAdmin(context.caller);
    if (data.accountId === context.caller.uid && (data.admin === false || (data.status && data.status !== "ativo")))
      throw new Error("Você não pode remover o seu próprio acesso de administrador.");
    if (data.admin !== undefined) {
      if (data.admin === false) {
        const admins = await ctx.adminUserIds();
        if (admins.length <= 1 && admins.includes(data.accountId)) throw new Error("É preciso manter pelo menos um administrador.");
      }
      await g.setDoc(`roles/${data.accountId}`, { admin: data.admin });
      await ctx.logActivity(context.caller, data.admin ? "Tornou administrador" : "Removeu administrador", "conta", data.accountId);
    }
    if (data.status) {
      await g.setDoc(`accounts/${data.accountId}`, { status: data.status });
      await ctx.logActivity(context.caller, `Acesso ${data.status}`, "conta", data.accountId);
    }
    return { ok: true };
  });

/** Profile fields a member may change about themselves. */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone: z.string().max(30),
        birthDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
        photo: z.string().max(400_000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const m = context.caller.member;
    if (!m) throw new Error("Sua conta ainda não está ligada a um cadastro.");
    if (data.photo && !data.photo.startsWith("data:image/")) throw new Error("Foto inválida.");
    await g.commit([
      { type: "set", path: `members/${m.id}`, data: { photo: data.photo }, merge: true },
      {
        type: "set",
        path: `memberPrivate/${m.id}`,
        data: { phone: data.phone, birthDate: data.birthDate, birthMonthDay: data.birthDate ? data.birthDate.slice(5) : "" },
        merge: true,
      },
    ]);
    return { ok: true };
  });
