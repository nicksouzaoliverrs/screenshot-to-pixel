import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { PageHeader, EmptyState, Loading, SectionTitle, StatTile } from "@/components/app/page";
import { AssignmentCard } from "@/components/app/assignment-card";
import { useMe } from "@/lib/auth";
import { useEventsRange, useFunctions, useMemberAssignments, useMinistries, useSettings } from "@/lib/data";
import { useToday } from "@/hooks/use-today";
import { firstName } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Início — Escala+" },
      { name: "description", content: "Sua próxima escala e confirmações pendentes nos ministérios da MBCV." },
      { property: "og:title", content: "Início — Escala+" },
      { property: "og:description", content: "Sua próxima escala e confirmações pendentes." },
    ],
  }),
  component: Home,
});

function Home() {
  const me = useMe();
  const { today } = useToday();
  const asg = useMemberAssignments(me.member?.id);
  const events = useEventsRange(today, null);
  const ministries = useMinistries();
  const fns = useFunctions();
  const { settings } = useSettings();
  const eventsById = useMemo(() => new Map(events.data.map((e) => [e.id, e])), [events.data]);
  const upcoming = asg.data.filter((a) => a.eventDate >= today && a.status !== "substituido" && a.eventStatus === "ativo");
  const pending = upcoming.filter((a) => a.status === "pendente");
  const mine = (me.member?.ministryIds ?? []).map((id) => ministries.byId.get(id)?.name).filter(Boolean);

  return (
    <>
      <PageHeader eyebrow={settings.churchName} title={`Olá, ${firstName(me.member?.name ?? me.account?.name) || "irmão(ã)"}`} subtitle={mine.length ? `Ministérios: ${mine.join(", ")}` : undefined} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Próximas escalas" value={upcoming.length} icon={CalendarDays} />
        <StatTile label="Aguardando você" value={pending.length} tone="wait" icon={CalendarDays} />
      </div>
      <SectionTitle action={<Link to="/minhas-escalas" className="text-sm font-semibold text-primary">Ver todas</Link>}>Próxima escala</SectionTitle>
      {asg.loading ? (
        <Loading />
      ) : upcoming[0] ? (
        <AssignmentCard
          assignment={upcoming[0]}
          event={eventsById.get(upcoming[0].eventId)}
          ministry={ministries.byId.get(upcoming[0].ministryId)}
          fn={fns.byId.get(upcoming[0].functionId)}
          deadlineHours={ministries.byId.get(upcoming[0].ministryId)?.confirmDeadlineHours || settings.defaultConfirmDeadlineHours}
          highlight={upcoming[0].status === "pendente"}
        />
      ) : (
        <EmptyState icon={CalendarDays} title="Nenhuma escala por enquanto">Quando você for escalado(a), ela aparece aqui.</EmptyState>
      )}
    </>
  );
}
