import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { doc } from "firebase/firestore";
import { isFirebaseConfigured } from "./firebase/config";
import { fbDb } from "./firebase/client";
import { useLiveDoc } from "./firebase/live";
import type { Account, Member } from "./types";

export type AuthStatus = "loading" | "unconfigured" | "signedOut" | "signedIn";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  account: Account | null;
  member: Member | null;
  isAdmin: boolean;
  /** Ministry ids led by this person. */
  leaderOf: string[];
  isLeader: boolean;
  /** Active account (linked and released). */
  active: boolean;
  syncing: boolean;
  syncError: string | null;
  resync: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

let resolveReady: (u: User | null) => void = () => {};
let readyPromise: Promise<User | null> | null = null;
/** Resolves once Firebase reports the initial sign-in state (used by route guards). */
export function authReady(): Promise<User | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null);
  if (!readyPromise) readyPromise = new Promise((r) => (resolveReady = r));
  return readyPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isFirebaseConfigured ? "loading" : "unconfigured");
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    authReady();
    let unsub = () => {};
    (async () => {
      const { fbAuth } = await import("./firebase/client");
      const { onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(fbAuth(), (u) => {
        setUser(u);
        setStatus(u ? "signedIn" : "signedOut");
        resolveReady(u);
        readyPromise = Promise.resolve(u);
        if (!u) syncedFor.current = null;
      });
    })();
    return () => unsub();
  }, []);

  const sync = async (u: User) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const { syncAccount } = await import("./api/account.functions");
      await syncAccount();
      syncedFor.current = u.uid;
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Não foi possível carregar sua conta.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (user && syncedFor.current !== user.uid) void sync(user);
  }, [user]);

  const accountLive = useLiveDoc<Account>(user ? `account:${user.uid}` : null, () =>
    user ? doc(fbDb(), "accounts", user.uid) : null,
  );
  const roleLive = useLiveDoc<{ id: string; admin: boolean }>(user && accountLive.data?.status === "ativo" ? `role:${user.uid}` : null, () =>
    user ? doc(fbDb(), "roles", user.uid) : null,
  );
  const account = accountLive.data;
  const active = account?.status === "ativo";
  const memberLive = useLiveDoc<Member>(active && account?.memberId ? `me:${account.memberId}` : null, () =>
    doc(fbDb(), "members", account!.memberId!),
  );

  const value = useMemo<AuthValue>(() => {
    const leaderOf = active ? (account?.leaderOf ?? []) : [];
    return {
      status: status === "signedIn" && (accountLive.loading || (syncing && !account)) ? "loading" : status,
      user,
      account,
      member: memberLive.data,
      isAdmin: active && roleLive.data?.admin === true,
      leaderOf,
      isLeader: leaderOf.length > 0,
      active,
      syncing,
      syncError,
      resync: async () => {
        if (user) await sync(user);
      },
    };
  }, [status, user, account, accountLive.loading, memberLive.data, roleLive.data, active, syncing, syncError]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}

/** Signed-in, active member data — use inside the authenticated app only. */
export function useMe() {
  const a = useAuth();
  return { ...a, uid: a.user?.uid ?? "", canManage: (ministryId: string) => a.isAdmin || a.leaderOf.includes(ministryId) };
}

export async function signOutEverywhere() {
  const { fbAuth } = await import("./firebase/client");
  const { signOut } = await import("firebase/auth");
  await signOut(fbAuth());
}
