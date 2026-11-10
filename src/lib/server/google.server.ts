// Server-only Google/Firebase access via REST + Web Crypto (runs on Vercel Node and edge runtimes).
// Credentials: FIREBASE_SERVICE_ACCOUNT = the full service-account JSON from the Firebase console.
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet, decodeJwt } from "jose";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedSa: ServiceAccount | null = null;
export function serviceAccount(): ServiceAccount {
  if (cachedSa) return cachedSa;
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT não configurado no servidor.");
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Allow base64-encoded JSON (handy for some hosting dashboards).
    parsed = JSON.parse(atob(raw));
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key)
    throw new Error("FIREBASE_SERVICE_ACCOUNT inválido (faltam campos).");
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  cachedSa = parsed;
  return parsed;
}

export function projectId(): string {
  return process.env["FIREBASE_PROJECT_ID"] || serviceAccount().project_id;
}

const emulatorFirestore = () => process.env["FIRESTORE_EMULATOR_HOST"];
const emulatorAuth = () => process.env["FIREBASE_AUTH_EMULATOR_HOST"];

let token: { value: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (emulatorFirestore()) return "owner";
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const sa = serviceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: [
      "https://www.googleapis.com/auth/datastore",
      "https://www.googleapis.com/auth/firebase.messaging",
      "https://www.googleapis.com/auth/cloud-platform",
    ].join(" "),
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Falha ao autenticar a conta de serviço [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return token.value;
}

/* ------------------------------ ID tokens ------------------------------ */

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface VerifiedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export async function verifyIdToken(idToken: string): Promise<VerifiedUser> {
  const pid = projectId();
  let payload: Record<string, unknown>;
  if (emulatorAuth()) {
    payload = decodeJwt(idToken) as Record<string, unknown>;
  } else {
    const r = await jwtVerify(idToken, JWKS, { issuer: `https://securetoken.google.com/${pid}`, audience: pid });
    payload = r.payload as Record<string, unknown>;
  }
  const uid = String(payload["sub"] ?? payload["user_id"] ?? "");
  if (!uid) throw new Error("Token sem usuário.");
  return {
    uid,
    email: String(payload["email"] ?? "").toLowerCase(),
    emailVerified: payload["email_verified"] === true,
    name: String(payload["name"] ?? ""),
    picture: (payload["picture"] as string | undefined) ?? null,
  };
}

/* ------------------------------ Firestore ------------------------------ */

type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } }
  | { timestampValue: string };

export type Data = Record<string, unknown>;

function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v as Data) } };
  return { stringValue: String(v) };
}
function encodeFields(d: Data): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) out[k] = encode(v);
  return out;
}
function decode(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}
function decodeFields(f: Record<string, FsValue>): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(f)) out[k] = decode(v);
  return out;
}

function root() {
  const host = emulatorFirestore();
  const base = host ? `http://${host}` : "https://firestore.googleapis.com";
  return `${base}/v1/projects/${projectId()}/databases/(default)/documents`;
}
function docName(path: string) {
  return `projects/${projectId()}/databases/(default)/documents/${path}`;
}

async function call(url: string, init: RequestInit = {}) {
  const t = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  return res;
}

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text();
  console.error(`Firestore ${what} falhou [${res.status}]: ${body}`);
  throw new Error(`Erro no banco de dados (${what}, ${res.status}).`);
}

type WithId<T> = T & { id: string };

export async function getDoc<T = Data>(path: string): Promise<WithId<T> | null> {
  const res = await call(`${root()}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) return fail(res, `ler ${path}`);
  const json = (await res.json()) as { name: string; fields?: Record<string, FsValue> };
  return { ...(decodeFields(json.fields ?? {}) as T), id: json.name.split("/").pop()! };
}

/** Creates a document only if it does not exist. Returns false when it already existed. */
export async function createDoc(collection: string, id: string, data: Data): Promise<boolean> {
  const res = await call(`${root()}/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (res.status === 409) return false;
  if (!res.ok) return fail(res, `criar ${collection}/${id}`);
  return true;
}

export type Write =
  | { type: "set"; path: string; data: Data; merge?: boolean; mustExist?: boolean; mustNotExist?: boolean }
  | { type: "delete"; path: string };

/** Atomic batch of writes. `merge` only touches the given top-level fields. */
export async function commit(writes: Write[]): Promise<void> {
  if (!writes.length) return;
  for (let i = 0; i < writes.length; i += 450) {
    const chunk = writes.slice(i, i + 450).map((w) => {
      if (w.type === "delete") return { delete: docName(w.path) };
      const out: Record<string, unknown> = { update: { name: docName(w.path), fields: encodeFields(w.data) } };
      if (w.merge) out["updateMask"] = { fieldPaths: Object.keys(w.data).map((k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `\`${k}\``)) };
      if (w.mustExist) out["currentDocument"] = { exists: true };
      if (w.mustNotExist) out["currentDocument"] = { exists: false };
      return out;
    });
    const res = await call(`${root()}:commit`, { method: "POST", body: JSON.stringify({ writes: chunk }) });
    if (!res.ok) await fail(res, "gravar");
  }
}

export const setDoc = (path: string, data: Data, merge = true) => commit([{ type: "set", path, data, merge }]);
export const deleteDoc = (path: string) => commit([{ type: "delete", path }]);

type Op = "==" | "<" | "<=" | ">" | ">=" | "array-contains" | "in" | "array-contains-any";
const OPS: Record<Op, string> = {
  "==": "EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_THAN_OR_EQUAL",
  "array-contains": "ARRAY_CONTAINS",
  in: "IN",
  "array-contains-any": "ARRAY_CONTAINS_ANY",
};

export interface QueryOpts {
  where?: [string, Op, unknown][];
  orderBy?: [string, "asc" | "desc"][];
  limit?: number;
}

/**
 * Query a collection. Keep to equality filters, or a single range field, so no composite
 * indexes are needed.
 */
export async function query<T = Data>(collection: string, opts: QueryOpts = {}): Promise<WithId<T>[]> {
  // "in" supports up to 30 values; split larger lists.
  const inFilter = opts.where?.find((w) => w[1] === "in" && Array.isArray(w[2]) && (w[2] as unknown[]).length > 30);
  if (inFilter) {
    const values = inFilter[2] as unknown[];
    const parts: WithId<T>[] = [];
    for (let i = 0; i < values.length; i += 30) {
      const where = opts.where!.map((w) => (w === inFilter ? ([w[0], "in", values.slice(i, i + 30)] as [string, Op, unknown]) : w));
      parts.push(...(await query<T>(collection, { ...opts, where })));
    }
    return parts;
  }
  if (opts.where?.some((w) => w[1] === "in" && Array.isArray(w[2]) && (w[2] as unknown[]).length === 0)) return [];
  const filters = (opts.where ?? []).map(([field, op, value]) => ({
    fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: encode(value) },
  }));
  const structuredQuery: Record<string, unknown> = { from: [{ collectionId: collection }] };
  if (filters.length === 1) structuredQuery["where"] = filters[0];
  else if (filters.length > 1) structuredQuery["where"] = { compositeFilter: { op: "AND", filters } };
  if (opts.orderBy) structuredQuery["orderBy"] = opts.orderBy.map(([f, d]) => ({ field: { fieldPath: f }, direction: d === "asc" ? "ASCENDING" : "DESCENDING" }));
  if (opts.limit) structuredQuery["limit"] = opts.limit;
  const res = await call(`${root()}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery }) });
  if (!res.ok) return fail(res, `consultar ${collection}`);
  const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, FsValue> } }[];
  return rows
    .filter((r) => r.document)
    .map((r) => ({ ...(decodeFields(r.document!.fields ?? {}) as T), id: r.document!.name.split("/").pop()! }));
}

export async function getMany<T = Data>(collection: string, ids: string[]): Promise<WithId<T>[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const res = await call(`${root()}:batchGet`, {
    method: "POST",
    body: JSON.stringify({ documents: unique.map((id) => docName(`${collection}/${id}`)) }),
  });
  if (!res.ok) return fail(res, `ler ${collection}`);
  const rows = (await res.json()) as { found?: { name: string; fields?: Record<string, FsValue> } }[];
  return rows
    .filter((r) => r.found)
    .map((r) => ({ ...(decodeFields(r.found!.fields ?? {}) as T), id: r.found!.name.split("/").pop()! }));
}

/* ------------------------------ FCM ------------------------------ */

export type PushResult = { ok: true } | { ok: false; stale: boolean; error: string };

export async function sendPush(
  deviceToken: string,
  msg: { title: string; body: string; url: string; tag: string },
): Promise<PushResult> {
  if (emulatorFirestore()) return { ok: false, stale: false, error: "emulador" };
  const t = await accessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId()}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        data: { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag },
        webpush: { headers: { Urgency: "high", TTL: "86400" }, fcm_options: { link: msg.url } },
      },
    }),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  const stale = res.status === 404 || (res.status === 400 && /INVALID_ARGUMENT|UNREGISTERED|registration-token/i.test(body));
  console.error(`FCM falhou [${res.status}]: ${body}`);
  return { ok: false, stale, error: `FCM ${res.status}` };
}
