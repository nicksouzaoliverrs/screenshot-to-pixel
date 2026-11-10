import { cn } from "@/lib/utils";

export function LogoMark({ className, size = 40 }: { className?: string; size?: number }) {
  return <img src="/icons/mark.svg" alt="" width={size} height={size} className={cn("shrink-0 rounded-[22%]", className)} />;
}

export function Wordmark({ className, light }: { className?: string | undefined; light?: boolean | undefined }) {
  return (
    <span className={cn("font-display font-semibold tracking-tight", light ? "text-ink-foreground" : "text-foreground", className)}>
      Escala<span className="text-gold">+</span>
    </span>
  );
}

export function BrandLockup({ light, subtitle, className }: { light?: boolean | undefined; subtitle?: string | undefined; className?: string | undefined }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <LogoMark size={38} />
      <span className="leading-tight">
        <Wordmark light={light} className="block text-xl" />
        {subtitle && <span className={cn("block text-[11px] font-bold uppercase tracking-[0.22em]", light ? "text-ink-muted" : "text-muted-foreground")}>{subtitle}</span>}
      </span>
    </span>
  );
}
