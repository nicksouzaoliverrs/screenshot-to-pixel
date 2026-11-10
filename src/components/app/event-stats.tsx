import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, MapPin } from "lucide-react";
import type { ChurchEvent, Ministry } from "@/lib/types";
import type { EventStats } from "@/lib/domain/stats";
import { fmtDateShort, timeRange } from "@/lib/format";
import { ProgressBar } from "./page";
import { mStyle } from "./status";
import { cn } from "@/lib/utils";

export function EventStatsCard({ event, stats, ministries, compact }: { event: ChurchEvent; stats: EventStats; ministries: Map<string, Ministry>; compact?: boolean }) {
  const cancelled = event.status === "cancelado";
  const issues = stats.unavailable + stats.substitutionPending;
  return (
    <Link
      to="/eventos/$id"
      params={{ id: event.id }}
      className={cn("block rounded-3xl border border-border/60 bg-card p-4 shadow-card transition-transform active:scale-[0.99]", cancelled && "opacity-60")}
    >
      <div className="flex items-start gap-3">
        <div className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-ink py-2 text-ink-foreground">
          <span className="text-[10px] font-bold uppercase text-gold">{fmtDateShort(event.date).split(",")[0]}</span>
          <span className="font-display text-xl font-semibold leading-none">{Number(event.date.slice(8))}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-bold", cancelled && "line-through")}>{event.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeRange(event.startTime, event.endTime)}</span>
            {event.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}
          </p>
        </div>
        <div className="text-right">
          {cancelled ? (
            <span className="text-xs font-bold text-off">Cancelado</span>
          ) : stats.needed === 0 && stats.assigned === 0 ? (
            <span className="text-xs font-semibold text-muted-foreground">Sem escala</span>
          ) : (
            <>
              <p className="font-display text-xl font-semibold leading-none">{stats.percent}%</p>
              <p className="text-[11px] text-muted-foreground">{stats.confirmed} de {stats.needed}</p>
            </>
          )}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      {!cancelled && stats.ministries.length > 0 && (
        <div className={cn("mt-3 grid gap-2", compact ? "" : "sm:grid-cols-2")}>
          {stats.ministries.map((m) => {
            const min = ministries.get(m.ministryId);
            return (
              <div key={m.ministryId} style={mStyle(min)} className="rounded-2xl bg-muted/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 font-bold">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-ministry" />
                    <span className="truncate">{min?.name ?? "Ministério"}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-muted-foreground">
                    {m.complete ? <CheckCircle2 className="inline h-3.5 w-3.5 text-ok" /> : m.unavailable + m.substitutionPending > 0 ? <AlertTriangle className="inline h-3.5 w-3.5 text-off" /> : null}{" "}
                    {m.confirmed} de {m.needed} confirmados
                  </span>
                </div>
                <ProgressBar className="mt-1.5 h-1.5" value={m.percent} tone={m.complete ? "ok" : m.unavailable ? "off" : "wait"} />
              </div>
            );
          })}
        </div>
      )}
      {!cancelled && issues > 0 && (
        <p className="mt-2 text-xs font-semibold text-off">
          {stats.unavailable > 0 && `${stats.unavailable} precisa(m) de substituição`}
          {stats.unavailable > 0 && stats.substitutionPending > 0 && " · "}
          {stats.substitutionPending > 0 && `${stats.substitutionPending} substituição(ões) aguardando`}
        </p>
      )}
    </Link>
  );
}
