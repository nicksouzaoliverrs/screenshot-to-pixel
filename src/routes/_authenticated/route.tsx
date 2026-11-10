import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { authReady } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";

// Firebase keeps the session in the browser, so this subtree renders client-side only.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!isFirebaseConfigured) throw redirect({ to: "/entrar" });
    const user = await authReady();
    if (!user) throw redirect({ to: "/entrar", search: { voltar: location.pathname } });
  },
  component: AppShell,
});
