// Firestore queries used by the screens. Only equality filters or one range field, so the
// project never needs composite indexes; sorting happens in memory.
import { collection, doc, limit, orderBy, query, where } from "firebase/firestore";
import { fbDb } from "./firebase/client";
import { useLiveDoc, useLiveQuery } from "./firebase/live";
import {
  DEFAULT_SETTINGS,
  type Account,
  type ActivityEntry,
  type AppNotification,
  type AppSettings,
  type Assignment,
  type ChurchEvent,
  type EventTemplate,
  type Member,
  type MemberPrivate,
  type Ministry,
  type MinistryFunction,
  type Notice,
  type Unavailability,
} from "./types";
import { useMemo } from "react";

const col = (name: string) => collection(fbDb(), name);

export function useSettings() {
  const r = useLiveDoc<AppSettings & { id: string }>("settings", () => doc(fbDb(), "settings", "app"));
  const settings: AppSettings = useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      ...(r.data ?? {}),
      reminders: { ...DEFAULT_SETTINGS.reminders, ...(r.data?.reminders ?? {}) },
      notify: { ...DEFAULT_SETTINGS.notify, ...(r.data?.notify ?? {}) },
    }),
    [r.data],
  );
  return { ...r, settings };
}

export function useMinistries(enabled = true) {
  const r = useLiveQuery<Ministry>(enabled ? "ministries" : null, () => col("ministries"));
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR")), [r.data]);
  const byId = useMemo(() => new Map(sorted.map((m) => [m.id, m])), [sorted]);
  return { ...r, data: sorted, byId };
}

export function useFunctions(ministryId?: string | null) {
  const key = ministryId === undefined ? "functions" : ministryId ? `functions:${ministryId}` : null;
  const r = useLiveQuery<MinistryFunction>(key, () =>
    ministryId ? query(col("functions"), where("ministryId", "==", ministryId)) : col("functions"),
  );
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR")), [r.data]);
  const byId = useMemo(() => new Map(sorted.map((f) => [f.id, f])), [sorted]);
  return { ...r, data: sorted, byId };
}

export function useMembers(enabled = true) {
  const r = useLiveQuery<Member>(enabled ? "members" : null, () => col("members"));
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [r.data]);
  const byId = useMemo(() => new Map(sorted.map((m) => [m.id, m])), [sorted]);
  return { ...r, data: sorted, byId };
}

export function useMemberPrivate(memberId: string | null | undefined) {
  return useLiveDoc<MemberPrivate>(memberId ? `memberPrivate:${memberId}` : null, () => doc(fbDb(), "memberPrivate", memberId!));
}
export function useAllMemberPrivate(enabled: boolean) {
  const r = useLiveQuery<MemberPrivate>(enabled ? "memberPrivate" : null, () => col("memberPrivate"));
  const byId = useMemo(() => new Map(r.data.map((m) => [m.id, m])), [r.data]);
  return { ...r, byId };
}

export function useEventsRange(start: string, end: string | null) {
  const r = useLiveQuery<ChurchEvent>(`events:${start}:${end ?? ""}`, () =>
    end
      ? query(col("events"), where("date", ">=", start), where("date", "<=", end))
      : query(col("events"), where("date", ">=", start), orderBy("date"), limit(200)),
  );
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.startsAt - b.startsAt), [r.data]);
  return { ...r, data: sorted };
}

export function usePastEvents(before: string, max = 60) {
  const r = useLiveQuery<ChurchEvent>(`events:past:${before}:${max}`, () =>
    query(col("events"), where("date", "<", before), orderBy("date", "desc"), limit(max)),
  );
  return r;
}

export function useEvent(id: string) {
  return useLiveDoc<ChurchEvent>(`event:${id}`, () => doc(fbDb(), "events", id));
}

export function useEventAssignments(eventId: string | null) {
  return useLiveQuery<Assignment>(eventId ? `asg:event:${eventId}` : null, () => query(col("assignments"), where("eventId", "==", eventId)));
}

export function useAssignmentsRange(start: string, end: string) {
  return useLiveQuery<Assignment>(`asg:range:${start}:${end}`, () =>
    query(col("assignments"), where("eventDate", ">=", start), where("eventDate", "<=", end)),
  );
}

export function useMemberAssignments(memberId: string | null | undefined) {
  const r = useLiveQuery<Assignment>(memberId ? `asg:member:${memberId}` : null, () =>
    query(col("assignments"), where("memberId", "==", memberId)),
  );
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.startsAt - b.startsAt), [r.data]);
  return { ...r, data: sorted };
}

export function useEventsByIds(ids: string[]) {
  const key = ids.length ? `events:ids:${[...ids].sort().join(",").slice(0, 2000)}` : null;
  const chunk = ids.slice(0, 30);
  const r = useLiveQuery<ChurchEvent>(key, () => query(col("events"), where("__name__", "in", chunk.map((id) => doc(fbDb(), "events", id)))));
  const byId = useMemo(() => new Map(r.data.map((e) => [e.id, e])), [r.data]);
  return { ...r, byId };
}

export function useMyUnavailabilities(uid: string | null | undefined) {
  const r = useLiveQuery<Unavailability>(uid ? `unav:mine:${uid}` : null, () => query(col("unavailabilities"), where("userId", "==", uid)));
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.startDate.localeCompare(b.startDate)), [r.data]);
  return { ...r, data: sorted };
}

export function useUnavailabilitiesFrom(fromDate: string, enabled: boolean) {
  const r = useLiveQuery<Unavailability>(enabled ? `unav:from:${fromDate}` : null, () =>
    query(col("unavailabilities"), where("endDate", ">=", fromDate)),
  );
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.startDate.localeCompare(b.startDate)), [r.data]);
  return { ...r, data: sorted };
}

export function useNotifications(uid: string | null | undefined, max = 100) {
  const r = useLiveQuery<AppNotification>(uid ? `notif:${uid}:${max}` : null, () =>
    query(col("notifications"), where("userId", "==", uid)),
  );
  const sorted = useMemo(() => [...r.data].sort((a, b) => b.createdAt - a.createdAt).slice(0, max), [r.data, max]);
  return { ...r, data: sorted, unread: r.data.filter((n) => !n.read).length };
}

export function useNotices(uid: string | null | undefined, isAdmin: boolean) {
  const r = useLiveQuery<Notice>(uid ? `notices:${isAdmin ? "all" : uid}` : null, () =>
    isAdmin ? col("notices") : query(col("notices"), where("recipientUserIds", "array-contains", uid)),
  );
  const sorted = useMemo(() => [...r.data].sort((a, b) => b.publishAt - a.publishAt), [r.data]);
  return { ...r, data: sorted };
}

export function useTemplates(enabled = true) {
  const r = useLiveQuery<EventTemplate>(enabled ? "templates" : null, () => col("eventTemplates"));
  const sorted = useMemo(() => [...r.data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [r.data]);
  return { ...r, data: sorted };
}

export function useAccounts(enabled: boolean) {
  const r = useLiveQuery<Account>(enabled ? "accounts" : null, () => col("accounts"));
  const sorted = useMemo(() => [...r.data].sort((a, b) => b.createdAt - a.createdAt), [r.data]);
  return { ...r, data: sorted };
}
export function useAdminRoles(enabled: boolean) {
  const r = useLiveQuery<{ id: string; admin: boolean }>(enabled ? "roles" : null, () => query(col("roles"), where("admin", "==", true)));
  return { ...r, ids: new Set(r.data.map((x) => x.id)) };
}

export function useActivity(enabled: boolean, max = 200) {
  return useLiveQuery<ActivityEntry>(enabled ? `activity:${max}` : null, () => query(col("activity"), orderBy("createdAt", "desc"), limit(max)));
}
