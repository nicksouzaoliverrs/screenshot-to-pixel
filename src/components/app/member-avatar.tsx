import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MemberAvatar({ name, photo, size = "md", className }: { name?: string | null; photo?: string | null; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" }[size];
  if (photo) return <img src={photo} alt={name ?? ""} className={cn(s, "shrink-0 rounded-full object-cover", className)} />;
  return <span className={cn(s, "flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground", className)}>{initials(name)}</span>;
}
