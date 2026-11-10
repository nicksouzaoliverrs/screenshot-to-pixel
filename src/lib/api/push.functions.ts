import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "./auth-middleware";

async function tokenId(token: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(4096), ua: z.string().max(400).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const id = await tokenId(data.token);
    await g.setDoc(`pushTokens/${id}`, { userId: context.caller.uid, token: data.token, ua: data.ua, createdAt: Date.now() }, false);
    return { ok: true };
  });

export const unregisterPushToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(4096) }).parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/server/google.server");
    const id = await tokenId(data.token);
    const t = await g.getDoc<{ userId: string }>(`pushTokens/${id}`);
    if (t && t.userId === context.caller.uid) await g.deleteDoc(`pushTokens/${id}`);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const ctx = await import("@/lib/server/context.server");
    await ctx.notify([
      {
        userId: context.caller.uid,
        kind: "conta",
        title: "Notificações ativadas",
        body: "Tudo certo! Você vai receber avisos de escalas neste aparelho.",
        link: "/notificacoes",
        key: `teste_${context.caller.uid}_${Date.now()}`,
      },
    ]);
    return { ok: true };
  });

/** Status of the server configuration for the admin settings screen (no secret values). */
export const integrationStatus = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    if (!context.caller.isAdmin) throw new Error("Apenas administradores.");
    return {
      serviceAccount: Boolean(process.env["FIREBASE_SERVICE_ACCOUNT"]),
      cronSecret: Boolean(process.env["CRON_SECRET"]),
      whatsappApi: false,
    };
  });
