import type { CSSProperties } from "react";
import {
  Music, MonitorPlay, Volume2, Megaphone, HandHeart, DoorOpen, HeartHandshake, BookOpen, Baby, Flame, Sparkles,
  Users, Globe2, Drama, Footprints, Flower2, CalendarCheck, Camera, Radio, Video, Mic2, Church, Coffee, Shield, Heart, Star,
} from "lucide-react";
import type { AssignmentStatus, Ministry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<AssignmentStatus, { label: string; short: string; className: string }> = {
  pendente: { label: "Aguardando confirmação", short: "Aguardando", className: "bg-wait-soft text-wait-foreground" },
  confirmado: { label: "Confirmado", short: "Confirmado", className: "bg-ok-soft text-ok" },
  indisponivel: { label: "Necessita de substituição", short: "Indisponível", className: "bg-off-soft text-off" },
  substituicao_solicitada: { label: "Substituição solicitada", short: "Substituição", className: "bg-swap-soft text-swap" },
  substituido: { label: "Substituído", short: "Substituído", className: "bg-done-soft text-done" },
};

export function StatusBadge({ status, short, className }: { status: AssignmentStatus; short?: boolean; className?: string }) {
  const m = STATUS_META[status];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold", m.className, className)}>{short ? m.short : m.label}</span>;
}

export const MINISTRY_ICONS = {
  music: Music, monitor: MonitorPlay, volume: Volume2, megaphone: Megaphone, pray: HandHeart, door: DoorOpen,
  serve: HeartHandshake, book: BookOpen, baby: Baby, flame: Flame, sparkles: Sparkles, users: Users, globe: Globe2,
  drama: Drama, dance: Footprints, flower: Flower2, calendar: CalendarCheck, camera: Camera, radio: Radio, video: Video,
  mic: Mic2, church: Church, coffee: Coffee, shield: Shield, heart: Heart, star: Star,
} as const;
export type MinistryIconKey = keyof typeof MINISTRY_ICONS;

export const MINISTRY_COLORS = ["#2F3E8C", "#C9A34E", "#2E8B6E", "#C2553A", "#7A4FB3", "#2C7DA0", "#B5446E", "#5B7F2B", "#D07A1F", "#4A5568", "#1F8A8A", "#9C6B3E"];

export const mStyle = (m?: Pick<Ministry, "color"> | null) => ({ "--m": m?.color ?? "#2F3E8C" }) as CSSProperties;

export function MinistryIcon({ ministry, size = "md", className }: { ministry?: Pick<Ministry, "icon" | "color" | "logo"> | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = MINISTRY_ICONS[(ministry?.icon as MinistryIconKey) ?? "sparkles"] ?? Sparkles;
  const box = { sm: "h-7 w-7 rounded-lg", md: "h-10 w-10 rounded-xl", lg: "h-14 w-14 rounded-2xl" }[size];
  const ic = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-7 w-7" }[size];
  if (ministry?.logo) return <img src={ministry.logo} alt="" className={cn(box, "shrink-0 object-cover", className)} />;
  return (
    <span style={mStyle(ministry)} className={cn(box, "flex shrink-0 items-center justify-center bg-ministry-soft text-ministry", className)}>
      <Icon className={ic} />
    </span>
  );
}

export function MinistryChip({ ministry, className }: { ministry?: Pick<Ministry, "name" | "color"> | null | undefined; className?: string }) {
  if (!ministry) return null;
  return (
    <span style={mStyle(ministry)} className={cn("inline-flex items-center gap-1.5 rounded-full bg-ministry-soft px-2.5 py-1 text-[11px] font-bold text-ministry", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-ministry" />
      {ministry.name}
    </span>
  );
}
