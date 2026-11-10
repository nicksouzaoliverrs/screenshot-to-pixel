import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, List, CalendarX2 } from "lucide-react";
import { PageHeader, EmptyState, Loading, SectionTitle } from "@/components/app/page";
import { AssignmentCard } from "@/components/app/assignment-card";
import { MonthGrid } from "@/components/app/month-grid";
import { useMe } from "@/lib/auth";
import { useEventsByIds, useFunctions, useMemberAssignments, useMinistries, useSettings } from "@/lib/data";
import { useToday } from "@/hooks/use-today";
import { fmtDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/minhas-escalas")({
  head: () => ({
    meta: [
      { title: "Minhas escalas — Escala+" },
      { name: "description", content: "Suas escalas nos ministérios da MBCV, com confirmação de presença." },
      { property: "og:title", content: "Minhas escalas — Escala+" },
      { property: "og:description", content: "Veja onde você serve e confirme sua presença." },
    ],
  }),
  component: MySchedules,
});

function MySchedules() {
  const me = useMe();
  const { today } = useToday();
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [tab, setTab] = useState<"proximas" | "historico">("proximas");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const asg = useMemberAssignments(me.member?.id);
  const ministries = useMinistries();
  const fns = useFunctions();
  const { settings } = useSettings();

  const relevant = asg.data.filter((a) => a.status !== "substituido" || a.eventDate < today);
  const upcoming = relevant.filter((a) => a.eventDate >= today);
  const past = [...relevant.filter((a) => a.eventDate < today)].reverse();
  const visibleIds = useMemo(() => Array.from(new Set([...upcoming, ...past.slice(0, 20)].map((a) => a.eventId))), [upcoming, past]);
  const events = useEventsByIds(visibleIds.slice(0, 30));
  const pending = upcoming.filter((a) => a.status === "pendente" && a.eventStatus === "ativo");

  const marks = useMemo(() => {
    const r: Record<string, { color: string }[]> = {};
    for (const a of relevant) (r[a.eventDate] ??= []).push({ color: ministries.byId.get(a.ministryId)?.color ?? "#888" });
    return r;
  }, [relevant, ministries.byId]);

  const deadline = (mid: string) => ministries.byId.get(mid)?.confirmDeadlineHours || settings.defaultConfirmDeadlineHours;
  const card = (a: (typeof relevant)[number]) => (
    <AssignmentCard
      key={a.id}
      assignment={a}
      event={events.byId.get(a.eventId)}
      ministry={ministries.byId.get(a.ministryId)}
      fn={fns.byId.get(a.functionId)}
      deadlineHours={deadline(a.ministryId)}
      highlight={a.status === "pendente"}
    />
  );

  if (!me.member) return <EmptyState icon={CalendarX2} title="Sem cadastro de integrante">Sua conta ainda não está ligada a um cadastro.</EmptyState>;

  return (
    <>
      <PageHeader
        eyebrow="Pessoal"
        title="Minhas escalas"
        subtitle={pending.length ? `${pending.length} aguardando sua confirmação` : "Tudo respondido por aqui"}
        action={
          <div className="flex rounded-xl bg-muted p-1">
            {([["lista", List], ["calendario", CalendarDays]] as const).map(([v, Icon]) => (
              <button key={v} aria-label={v} onClick={() => setView(v)} className={cn("rounded-lg px-2.5 py-1.5", view === v ? "bg-card shadow-card" : "text-muted-foreground")}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        }
      />
      {asg.loading ? (
        <Loading />
      ) : view === "calendario" ? (
        <>
          <MonthGrid month={month} onMonth={setMonth} selected={selected} onSelect={setSelected} marks={marks} today={today} />
          {selected && (
            <>
              <SectionTitle>{fmtDateLong(selected)}</SectionTitle>
              <div className="space-y-3">
                {relevant.filter((a) => a.eventDate === selected).map(card)}
                {!relevant.some((a) => a.eventDate === selected) && <p className="text-sm text-muted-foreground">Nenhuma escala neste dia.</p>}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-full bg-muted p-1 text-sm font-semibold">
            {([["proximas", "Próximas"], ["historico", "Histórico"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className={cn("rounded-full px-4 py-1.5", tab === v ? "bg-card shadow-card" : "text-muted-foreground")}>
                {l}
              </button>
            ))}
          </div>
          {tab === "proximas" ? (
            upcoming.length ? (
              <div className="space-y-3">{upcoming.map(card)}</div>
            ) : (
              <EmptyState icon={CalendarDays} title="Nenhuma escala futura">Quando você for escalado(a), a escala aparece aqui e você recebe uma notificação.</EmptyState>
            )
          ) : past.length ? (
            <div className="space-y-3">{past.slice(0, 40).map(card)}</div>
          ) : (
            <EmptyState icon={CalendarDays} title="Sem histórico ainda" />
          )}
        </>
      )}
    </>
  );
}
