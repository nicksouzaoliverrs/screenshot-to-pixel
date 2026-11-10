// Server-only helpers shared by server functions: caller identity, settings, notifications, audit log.
import { commit, createDoc, getDoc, getMany, query, sendPush, setDoc, type Data } from "./google.server";
import type { VerifiedUser } from "./google.server";
import {
  DEFAULT_SETTINGS,
  type Account,
  type AppNotification,
  type AppSettings,
  type Member,
  type Ministry,
  type NotificationKind,
} from "../types";

export interface Caller extends VerifiedUser {
  account: Account | null;
  isAdmin: boolean;
  member: Member | null;
  leaderMinistryIds: string[];
  displayName: string;
}

export async function loadCaller(user: VerifiedUser): Promise<Caller> {
  const [account, role] = await Promise.all([
    getDoc<Omit<Account, "id">>(`accounts/${user.uid}`),
    getDoc<{ admin: boolean }>(`roles/${user.uid}`),
  ]);
  const active = account?.status === "ativo";
  const member = active && account?.memberId ? await getDoc<Omit<Member, "id">>(`members/${account.memberId}`) : null;
  const leaderMinistryIds = member
    ? (await query<Ministry>("ministries", { where: [["leaderMemberIds", "array-contains", member.id]] }))
        .filter((m) => m.active)
        .map((m) => m.id)
    : [];
  return {
    ...user,
    account: account as Account | null,
    isAdmin: active && role?.admin === true,
    member: member as Member | null,
    leaderMinistryIds,
    displayName: member?.name || account?.name || user.name || user.email,
  };
}

export function assertActive(c: Caller) {
  if (c.account?.status !== "ativo") throw new Error("Sua conta ainda não foi liberada.");
}
export function assertAdmin(c: Caller) {
  if (!c.isAdmin) throw new Error("Apenas administradores podem fazer isso.");
}
export function canManageMinistry(c: Caller, ministry: Pick<Ministry, "id" | "leadersCanSchedule">) {
  return c.isAdmin || (ministry.leadersCanSchedule && c.leaderMinistryIds.includes(ministry.id));
}

export async function getSettings(): Promise<AppSettings> {
  const s = await getDoc<Partial<AppSettings>>("settings/app");
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(s?.reminders ?? {}) },
    notify: { ...DEFAULT_SETTINGS.notify, ...(s?.notify ?? {}) },
  };
}

export async function adminUserIds(): Promise<string[]> {
  const roles = await query<{ admin: boolean }>("roles", { where: [["admin", "==", true]] });
  return roles.map((r) => r.id);
}

/** Admins plus leaders of the given ministry (deduplicated). */
export async function managersOf(ministryId: string | null): Promise<string[]> {
  const ids = new Set(await adminUserIds());
  if (ministryId) {
    const m = await getDoc<Ministry>(`ministries/${ministryId}`);
    for (const u of m?.leaderUserIds ?? []) ids.add(u);
  }
  return Array.from(ids);
}

const KIND_TOGGLE: Partial<Record<NotificationKind, keyof AppSettings["notify"]>> = {
  escalado: "escalado",
  escala_alterada: "alteracao",
  escala_removida: "alteracao",
  evento_cancelado: "cancelamento",
  confirmacao: "confirmacaoAdmin",
  indisponibilidade: "indisponibilidadeAdmin",
  substituicao_solicitada: "substituicao",
  substituicao_confirmada: "substituicao",
  substituicao_recusada: "substituicao",
};

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  /** Unique key; the same key is never delivered twice. */
  key: string;
}

/**
 * Create notifications (deduplicated by key) and deliver push to the users' devices.
 * Returns ids that were newly created.
 */
export async function notify(items: NewNotification[], settings?: AppSettings): Promise<string[]> {
  if (!items.length) return [];
  const s = settings ?? (await getSettings());
  const created: AppNotification[] = [];
  for (const n of items) {
    if (!n.userId) continue;
    const toggle = KIND_TOGGLE[n.kind];
    if (toggle && !s.notify[toggle]) continue;
    const id = n.key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
    const doc: Omit<AppNotification, "id"> = {
      userId: n.userId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      read: false,
      createdAt: Date.now(),
      push: "pendente",
      pushError: "",
      pushAt: null,
    };
    if (await createDoc("notifications", id, doc as unknown as Data)) created.push({ ...doc, id });
  }
  await deliver(created);
  return created.map((c) => c.id);
}

/** Send web push for notifications and record the outcome on each notification. */
export async function deliver(list: Pick<AppNotification, "id" | "userId" | "title" | "body" | "link">[]) {
  if (!list.length) return;
  const userIds = Array.from(new Set(list.map((n) => n.userId)));
  const tokens = await query<{ userId: string; token: string }>("pushTokens", { where: [["userId", "in", userIds]] });
  const byUser = new Map<string, { id: string; token: string }[]>();
  for (const t of tokens) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), { id: t.id, token: t.token }]);
  const stale = new Set<string>();
  const updates: { path: string; data: Data }[] = [];
  await Promise.all(
    list.map(async (n) => {
      const devices = byUser.get(n.userId) ?? [];
      if (!devices.length) {
        updates.push({ path: `notifications/${n.id}`, data: { push: "sem_dispositivo", pushAt: Date.now() } });
        return;
      }
      let ok = false;
      let lastError = "";
      for (const d of devices) {
        const r = await sendPush(d.token, { title: n.title, body: n.body, url: n.link || "/notificacoes", tag: n.id });
        if (r.ok) ok = true;
        else {
          lastError = r.error;
          if (r.stale) stale.add(d.id);
        }
      }
      updates.push({
        path: `notifications/${n.id}`,
        data: { push: ok ? "enviado" : "falhou", pushError: ok ? "" : lastError, pushAt: Date.now() },
      });
    }),
  );
  await commit([
    ...updates.map((u) => ({ type: "set" as const, path: u.path, data: u.data, merge: true })),
    ...Array.from(stale).map((id) => ({ type: "delete" as const, path: `pushTokens/${id}` })),
  ]);
}

export async function logActivity(c: Pick<Caller, "uid" | "displayName"> | null, action: string, entity: string, entityId: string, details = "") {
  const id = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await createDoc("activity", id, {
    actorUid: c?.uid ?? "sistema",
    actorName: c?.displayName ?? "Sistema",
    action,
    entity,
    entityId,
    details,
    createdAt: Date.now(),
  });
}

export async function membersById(ids: string[]) {
  const list = await getMany<Member>("members", ids);
  return new Map(list.map((m) => [m.id, m]));
}

/** Recompute accounts.leaderOf for the given users (used by the security rules). */
export async function refreshLeaderOf(uids: string[]) {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const writes = [];
  for (const uid of unique) {
    const ms = await query<Ministry>("ministries", { where: [["leaderUserIds", "array-contains", uid]] });
    writes.push({ type: "set" as const, path: `accounts/${uid}`, data: { leaderOf: ms.filter((m) => m.active).map((m) => m.id) }, merge: true });
  }
  await commit(writes);
}

export { setDoc };
