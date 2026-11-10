import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, action, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: boolean; eyebrow?: ReactNode }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <button onClick={() => router.history.back()} className="-ml-1 mb-2 inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
        )}
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-gold-foreground/80 dark:text-gold">{eyebrow}</p>}
        <h1 className="text-[1.7rem] font-semibold leading-tight md:text-4xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-3xl border border-border/60 bg-card p-4 shadow-card md:p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 mt-7 flex items-center justify-between gap-2", className)}>
      <h2 className="font-sans text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: ComponentType<{ className?: string }>; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function StatTile({ label, value, hint, icon: Icon, tone = "default", onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ComponentType<{ className?: string }>; tone?: "default" | "ok" | "wait" | "off" | "swap" | "gold"; onClick?: () => void }) {
  const tones = {
    default: "bg-accent text-accent-foreground",
    ok: "bg-ok-soft text-ok",
    wait: "bg-wait-soft text-wait-foreground",
    off: "bg-off-soft text-off",
    swap: "bg-swap-soft text-swap",
    gold: "bg-gold-soft text-gold-foreground dark:text-gold",
  } as const;
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("flex min-w-0 flex-col rounded-3xl border border-border/60 bg-card p-4 text-left shadow-card", onClick && "transition-transform active:scale-[0.98]")}>
      {Icon && (
        <span className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      )}
      <span className="font-display text-3xl font-semibold leading-none">{value}</span>
      <span className="mt-1.5 text-xs font-semibold text-muted-foreground">{label}</span>
      {hint && <span className="mt-1 text-[11px] text-muted-foreground">{hint}</span>}
    </Comp>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ProgressBar({ value, tone = "ok", className }: { value: number; tone?: "ok" | "wait" | "off" | "gold"; className?: string }) {
  const bar = { ok: "bg-ok", wait: "bg-wait", off: "bg-off", gold: "bg-gold" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
