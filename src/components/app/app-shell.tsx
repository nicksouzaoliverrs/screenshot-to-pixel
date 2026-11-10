import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import {
  Home, CalendarDays, CalendarRange, Bell, UserCircle2, Church, Users, BarChart3, Settings2, CalendarOff, Megaphone,
  Download, LayoutGrid, WifiOff, RefreshCw, Loader2, MailCheck, LogOut, ClipboardList, ShieldAlert,
} from "lucide-react";
import { useAuth, signOutEverywhere } from "@/lib/auth";
import { useNotifications } from "@/lib/data";
import { useOnline } from "@/hooks/use-online";
import { onAppUpdate } from "@/lib/pwa";
import { BrandLockup, LogoMark } from "./brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Only pages that already exist are shown in the menus.
const READY = new Set(["/inicio", "/minhas-escalas", "/instalar"]);

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; badge?: number };

export function AppShell() {
  const auth = useAuth();
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const { unread } = useNotifications(auth.active ? auth.user?.uid : null);
  const [update, setUpdate] = useState<(() => void) | null>(null);

  useEffect(() => onAppUpdate((apply) => setUpdate(() => apply)), []);
  useEffect(() => setMore(false), [location.pathname]);

  if (auth.status === "loading" || (auth.status === "signedIn" && !auth.account)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink-gradient">
        <LogoMark size={84} className="animate-glow shadow-float" />
        {auth.syncError ? (
          <div className="max-w-xs text-center text-sm text-ink-foreground">
            <p>{auth.syncError}</p>
            <Button variant="gold" className="mt-4" onClick={() => auth.resync()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        )}
      </div>
    );
  }
  if (auth.status !== "signedIn" || !auth.account) return null;
  if (!auth.active) return <PendingAccess />;

  const isAdmin = auth.isAdmin;
  const canManage = isAdmin || auth.isLeader;
  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + "/");

  const primaryAll: NavItem[] = isAdmin
    ? [
        { to: "/inicio", label: "Painel", icon: Home },
        { to: "/eventos", label: "Escalas", icon: ClipboardList },
        { to: "/calendario", label: "Calendário", icon: CalendarRange },
        { to: "/notificacoes", label: "Avisos", icon: Bell, badge: unread },
      ]
    : [
        { to: "/inicio", label: "Início", icon: Home },
        { to: "/minhas-escalas", label: "Escalas", icon: CalendarDays },
        { to: "/calendario", label: "Calendário", icon: CalendarRange },
        { to: "/notificacoes", label: "Avisos", icon: Bell, badge: unread },
        { to: "/perfil", label: "Perfil", icon: UserCircle2 },
      ];

  const primary = primaryAll.filter((i) => READY.has(i.to));
  const groupsAll: { title: string; items: NavItem[] }[] = [
    {
      title: "Pessoal",
      items: [
        { to: "/minhas-escalas", label: "Minhas escalas", icon: CalendarDays },
        { to: "/indisponibilidades", label: "Indisponibilidades", icon: CalendarOff },
        { to: "/comunicados", label: "Comunicados", icon: Megaphone },
        { to: "/perfil", label: "Meu perfil", icon: UserCircle2 },
      ],
    },
    ...(canManage
      ? [
          {
            title: isAdmin ? "Administração" : "Liderança",
            items: [
              { to: "/eventos", label: "Eventos e escalas", icon: ClipboardList },
              { to: "/ministerios", label: "Ministérios", icon: Church },
              ...(isAdmin ? [{ to: "/integrantes", label: "Integrantes", icon: Users }] : []),
              { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
              ...(isAdmin ? [{ to: "/configuracoes", label: "Configurações", icon: Settings2 }] : []),
            ],
          },
        ]
      : []),
    { title: "App", items: [{ to: "/instalar", label: "Instalar no celular", icon: Download }] },
  ];
  const groups = groupsAll.map((g) => ({ ...g, items: g.items.filter((i) => READY.has(i.to)) })).filter((g) => g.items.length);

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col overflow-y-auto bg-sidebar p-5 text-sidebar-foreground md:flex">
        <Link to="/inicio" className="mb-7 px-1">
          <BrandLockup light subtitle="MBCV" />
        </Link>
        <nav className="space-y-1">
          {primary.filter((p) => p.to !== "/perfil").map((i) => (
            <SideLink key={i.to} item={i} active={isActive(i.to)} />
          ))}
        </nav>
        {groups.map((g) => (
          <div key={g.title} className="mt-6">
            <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-ink-muted">{g.title}</p>
            <nav className="space-y-1">
              {g.items.filter((s) => !primary.some((p) => p.to === s.to && p.to !== "/perfil")).map((i) => (
                <SideLink key={i.to} item={i} active={isActive(i.to)} />
              ))}
            </nav>
          </div>
        ))}
        <div className="mt-auto pt-6">
          <button
            onClick={async () => {
              await signOutEverywhere();
              navigate({ to: "/entrar", replace: true });
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {!online && (
          <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-off px-4 py-2 pt-safe text-center text-xs font-semibold text-destructive-foreground">
            <WifiOff className="h-4 w-4" /> Sem conexão — dados podem estar desatualizados. Confirmações só são enviadas com internet.
          </div>
        )}
        {update && (
          <div className="sticky top-0 z-40 flex items-center justify-center gap-3 bg-gold-gradient px-4 py-2 text-xs font-bold text-gold-foreground">
            Nova versão do Escala+ disponível.
            <button onClick={() => update()} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-ink-foreground">
              <RefreshCw className="h-3 w-3" /> Atualizar
            </button>
          </div>
        )}
        <main className="mx-auto max-w-4xl px-4 pb-32 pt-6 pt-safe md:px-10 md:pb-14 md:pt-10">
          <div key={location.pathname} className="animate-rise">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card/95 pb-safe backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {primary.map((i) => (
            <BottomLink key={i.to} item={i} active={isActive(i.to)} />
          ))}
          {isAdmin && (
            <button onClick={() => setMore(true)} className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold">
              <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", more ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
                <LayoutGrid className="h-5 w-5" />
              </span>
              <span className="text-muted-foreground">Mais</span>
            </button>
          )}
        </div>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-10">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">Menu</SheetTitle>
          </SheetHeader>
          {groups.map((g) => (
            <div key={g.title} className="mt-4">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">{g.title}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((i) => (
                  <Link key={i.to} to={i.to} className={cn("flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center text-xs font-semibold", isActive(i.to) && "border-gold bg-gold-soft")}>
                    <i.icon className="h-5 w-5 text-primary" />
                    {i.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className={cn("h-4.5 w-4.5", active && "text-sidebar-primary")} />
      <span className="flex-1">{item.label}</span>
      {!!item.badge && <span className="rounded-full bg-gold px-1.5 text-[11px] font-extrabold text-gold-foreground">{item.badge > 99 ? "99+" : item.badge}</span>}
    </Link>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link to={item.to} className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold">
      <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active ? "bg-ink text-gold" : "text-muted-foreground")}>
        <item.icon className="h-5 w-5" />
      </span>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
      {!!item.badge && (
        <span className="absolute right-[calc(50%-24px)] top-1.5 min-w-[18px] rounded-full bg-off px-1 text-center text-[10px] leading-[18px] text-destructive-foreground">
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
    </Link>
  );
}

function PendingAccess() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const needsVerify = auth.user && !auth.user.emailVerified && auth.user.providerData.some((p) => p.providerId === "password");
  const blocked = auth.account?.status === "bloqueado";
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-gradient p-5">
      <div className="w-full max-w-md rounded-[2rem] bg-card p-7 shadow-float">
        <LogoMark size={56} />
        {blocked ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold">Acesso desativado</h1>
            <p className="mt-2 text-sm text-muted-foreground">Seu cadastro está inativo. Fale com a liderança da MBCV se isso for um engano.</p>
          </>
        ) : needsVerify ? (
          <>
            <span className="mt-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-soft text-gold-foreground"><MailCheck className="h-5 w-5" /></span>
            <h1 className="mt-3 text-2xl font-semibold">Confirme seu e-mail</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enviamos um link para <b>{auth.user?.email}</b>. Abra o e-mail, confirme e depois toque em “Já confirmei”.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="gold"
                onClick={async () => {
                  await auth.user?.reload();
                  await auth.user?.getIdToken(true);
                  await auth.resync();
                  if (!auth.user?.emailVerified) toast.info("Ainda não recebemos a confirmação.");
                }}
              >
                Já confirmei
              </Button>
              <Button
                variant="outline"
                disabled={sending}
                onClick={async () => {
                  setSending(true);
                  try {
                    const { sendEmailVerification } = await import("firebase/auth");
                    if (auth.user) await sendEmailVerification(auth.user);
                    toast.success("E-mail reenviado.");
                  } catch {
                    toast.error("Aguarde um pouco antes de pedir outro e-mail.");
                  } finally {
                    setSending(false);
                  }
                }}
              >
                Reenviar e-mail
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="mt-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-wait-soft text-wait-foreground"><ShieldAlert className="h-5 w-5" /></span>
            <h1 className="mt-3 text-2xl font-semibold">Aguardando liberação</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sua conta (<b>{auth.account?.email}</b>) foi criada. Um administrador precisa ligá-la ao seu cadastro de integrante. Se o administrador já te cadastrou com este e-mail, a liberação é automática.
            </p>
            <Button variant="outline" className="mt-5" onClick={() => auth.resync()}>
              <RefreshCw /> Verificar novamente
            </Button>
          </>
        )}
        <button
          className="mt-6 block text-sm font-semibold text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await signOutEverywhere();
            navigate({ to: "/entrar", replace: true });
          }}
        >
          Sair e usar outra conta
        </button>
      </div>
    </div>
  );
}
