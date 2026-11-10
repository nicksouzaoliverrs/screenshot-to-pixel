import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Mail, Lock, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLockup } from "@/components/app/brand";
import { FirebaseSetupNotice } from "@/components/app/setup-notice";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/entrar")({
  validateSearch: (s) => z.object({ voltar: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Entrar — Escala+" },
      { name: "description", content: "Entre no Escala+ para ver suas escalas e confirmar presença nos ministérios da MBCV." },
      { property: "og:title", content: "Entrar — Escala+" },
      { property: "og:description", content: "Acesse suas escalas e confirmações nos ministérios da MBCV." },
    ],
  }),
  component: SignIn,
});

function authError(code: string) {
  const map: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não encontramos uma conta com este e-mail.",
    "auth/email-already-in-use": "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes de concluir.",
    "auth/network-request-failed": "Sem conexão com a internet.",
    "auth/unauthorized-domain": "Este endereço ainda não foi autorizado no Firebase (Authentication → Settings → Authorized domains).",
    "auth/operation-not-allowed": "Este tipo de login ainda não foi ativado no Firebase.",
  };
  return map[code] ?? "Não foi possível entrar. Tente novamente.";
}

function SignIn() {
  const { voltar } = Route.useSearch();
  const navigate = useNavigate();
  const auth = useAuth();
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signedIn") navigate({ to: voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/inicio", replace: true });
  }, [auth.status, voltar, navigate]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      toast.error(authError(code));
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run(async () => {
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
      const { fbAuth } = await import("@/lib/firebase/client");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(fbAuth(), provider);
      } catch (e) {
        if ((e as { code?: string }).code === "auth/popup-blocked") await signInWithRedirect(fbAuth(), provider);
        else throw e;
      }
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const a = await import("firebase/auth");
      const { fbAuth } = await import("@/lib/firebase/client");
      const fa = fbAuth();
      if (mode === "recuperar") {
        await a.sendPasswordResetEmail(fa, email.trim());
        toast.success("Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.");
        setMode("entrar");
        return;
      }
      if (mode === "criar") {
        if (name.trim().length < 2) throw Object.assign(new Error(), { code: "nome" });
        const cred = await a.createUserWithEmailAndPassword(fa, email.trim(), password);
        await a.updateProfile(cred.user, { displayName: name.trim() });
        await a.sendEmailVerification(cred.user);
        await cred.user.getIdToken(true);
        toast.success("Conta criada! Enviamos um e-mail para confirmar seu endereço.");
        return;
      }
      await a.signInWithEmailAndPassword(fa, email.trim(), password);
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink-gradient md:flex-row">
      <div className="flex flex-col justify-between px-6 pb-8 pt-10 pt-safe md:w-1/2 md:p-14">
        <Link to="/">
          <BrandLockup light subtitle="MBCV" />
        </Link>
        <div className="mt-10 hidden md:block">
          <h1 className="max-w-md text-5xl font-semibold leading-[1.05] text-ink-foreground">
            Cada ministério no seu lugar. <span className="text-gold">Cada pessoa no seu chamado.</span>
          </h1>
          <p className="mt-5 max-w-sm text-ink-muted">Escalas, confirmações e lembretes de todos os ministérios da MBCV em um só aplicativo.</p>
        </div>
        <p className="hidden text-xs text-ink-muted md:block">“Tudo, porém, seja feito com decência e ordem.” — 1 Coríntios 14:40</p>
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pb-10 md:items-center md:bg-background md:px-10">
        <div className="w-full max-w-md rounded-[2rem] bg-card p-6 shadow-float md:p-8 md:shadow-none">
          <h2 className="text-3xl font-semibold">{mode === "criar" ? "Criar conta" : mode === "recuperar" ? "Recuperar senha" : "Bem-vindo(a)"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "criar" ? "Use o mesmo e-mail que você informou à liderança." : mode === "recuperar" ? "Enviaremos um link para você criar uma nova senha." : "Entre para ver suas escalas."}
          </p>

          {!isFirebaseConfigured ? (
            <div className="mt-6">
              <FirebaseSetupNotice />
            </div>
          ) : (
            <>
              {mode !== "recuperar" && (
                <>
                  <Button type="button" variant="outline" size="lg" className="mt-6 w-full" disabled={busy} onClick={google}>
                    <GoogleIcon /> Continuar com Google
                  </Button>
                  <div className="my-5 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}
              <form onSubmit={submit} className={mode === "recuperar" ? "mt-6 space-y-3" : "space-y-3"}>
                {mode === "criar" && (
                  <IconInput icon={UserIcon} placeholder="Nome completo" value={name} onChange={setName} autoComplete="name" />
                )}
                <IconInput icon={Mail} type="email" placeholder="E-mail" value={email} onChange={setEmail} autoComplete="email" />
                {mode !== "recuperar" && (
                  <IconInput icon={Lock} type="password" placeholder="Senha" value={password} onChange={setPassword} autoComplete={mode === "criar" ? "new-password" : "current-password"} />
                )}
                <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === "criar" ? "Criar conta" : mode === "recuperar" ? "Enviar link" : "Entrar"}
                </Button>
              </form>
              <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
                {mode === "entrar" ? (
                  <>
                    <button className="font-semibold text-primary" onClick={() => setMode("criar")}>Criar conta</button>
                    <button className="text-muted-foreground" onClick={() => setMode("recuperar")}>Esqueci a senha</button>
                  </>
                ) : (
                  <button className="font-semibold text-primary" onClick={() => setMode("entrar")}>Já tenho conta</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon: Icon, value, onChange, ...rest }: { icon: typeof Mail; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input {...rest} value={value} onChange={(e) => onChange(e.target.value)} required className="h-12 rounded-2xl pl-10 text-base" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}
