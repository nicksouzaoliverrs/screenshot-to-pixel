import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/** Verifies the Firebase ID token sent by the browser and loads the caller (account, roles, member). */
export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Você precisa entrar na sua conta.");
  const { verifyIdToken } = await import("@/lib/server/google.server");
  const { loadCaller } = await import("@/lib/server/context.server");
  let user;
  try {
    user = await verifyIdToken(token);
  } catch {
    throw new Error("Sessão expirada. Entre novamente.");
  }
  const caller = await loadCaller(user);
  return next({ context: { caller } });
});
