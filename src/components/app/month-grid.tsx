import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthMatrix, shiftMonth, WEEKDAY_INITIALS } from "@/lib/calendar";
import { fmtMonthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DayMark {
  color: string;
  tone?: "ok" | "wait" | "off" | "muted";
}

export function MonthGrid({
  month,
  onMonth,
  selected,
  onSelect,
  marks,
  today,
}: {
  month: string;
  onMonth: (ym: string) => void;
  selected: string | null;
  onSelect: (d: string) => void;
  marks: Record<string, DayMark[]>;
  today: string;
}) {
  const weeks = monthMatrix(month);
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-3 shadow-card md:p-4">
      <div className="mb-2 flex items-center justify-between">
        <button aria-label="Mês anterior" onClick={() => onMonth(shiftMonth(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-display text-lg font-semibold capitalize">{fmtMonthYear(`${month}-01`)}</p>
        <button aria-label="Próximo mês" onClick={() => onMonth(shiftMonth(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold text-muted-foreground">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="py-1">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((d) => {
          const inMonth = d.startsWith(month);
          const m = marks[d] ?? [];
          const isSel = selected === d;
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors",
                !inMonth && "text-muted-foreground/40",
                isSel ? "bg-ink text-ink-foreground" : "hover:bg-muted",
                d === today && !isSel && "font-extrabold text-gold-foreground ring-1 ring-gold dark:text-gold",
              )}
            >
              <span>{Number(d.slice(8))}</span>
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {m.slice(0, 4).map((x, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: x.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
