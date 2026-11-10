import { CalendarDays, Clock, MapPin, Repeat2 } from "lucide-react";
import type { Assignment, ChurchEvent, Ministry, MinistryFunction } from "@/lib/types";
import { fmtDateLong, timeRange } from "@/lib/format";
import { MinistryIcon, StatusBadge, mStyle } from "./status";
import { ResponseButtons } from "./response-buttons";
import { cn } from "@/lib/utils";

export function AssignmentCard({
  assignment,
  event,
  ministry,
  fn,
  deadlineHours,
  highlight,
}: {
  assignment: Assignment;
  event?: ChurchEvent;
  ministry?: Ministry;
  fn?: MinistryFunction;
  deadlineHours: number;
  highlight?: boolean;
}) {
  const cancelled = assignment.eventStatus === "cancelado";
  return (
    <article
      style={mStyle(ministry)}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/60 bg-card p-4 shadow-card",
        highlight && "ring-2 ring-gold/60",
        cancelled && "opacity-70",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1.5 bg-ministry" />
      <div className="flex items-start gap-3 pl-1">
        <MinistryIcon ministry={ministry} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-ministry">{ministry?.name ?? "Ministério"}</p>
            {assignment.replacesId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-swap-soft px-2 py-0.5 text-[10px] font-bold text-swap">
                <Repeat2 className="h-3 w-3" /> Substituição
              </span>
            )}
          </div>
          <h3 className="mt-0.5 truncate text-lg font-bold">{fn?.name ?? "Função"}</h3>
          <p className={cn("truncate text-sm font-semibold", cancelled && "line-through")}>{event?.title ?? "Evento"}</p>
        </div>
        {cancelled ? (
          <span className="rounded-full bg-off-soft px-2.5 py-1 text-[11px] font-bold text-off">Cancelado</span>
        ) : (
          <StatusBadge status={assignment.status} short />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtDateLong(assignment.eventDate)}</span>
        {event && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{timeRange(event.startTime, event.endTime)}</span>}
        {event?.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location}</span>}
      </div>
      {(event?.notes || fn?.notes) && !cancelled && (
        <p className="mt-2 rounded-2xl bg-muted px-3 py-2 pl-3 text-xs text-muted-foreground">{[fn?.notes, event?.notes].filter(Boolean).join(" · ")}</p>
      )}
      {assignment.reason && assignment.status === "indisponivel" && <p className="mt-2 pl-1 text-xs text-off">Motivo: {assignment.reason}</p>}
      {!cancelled && (
        <div className="mt-4">
          <ResponseButtons assignment={assignment} deadlineHours={deadlineHours} />
        </div>
      )}
    </article>
  );
}
