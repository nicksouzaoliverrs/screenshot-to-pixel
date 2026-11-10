import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck2, BellRing, Repeat2, Church, Download } from "lucide-react";
import hero from "@/assets/hero-worship.jpg";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/app/brand";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Escala+ — Ministérios e escalas da MBCV" },
      { name: "description", content: "O aplicativo da MBCV para organizar ministérios, eventos e escalas, com confirmação de presença, substituições e lembretes." },
      { property: "og:title", content: "Escala+ — Ministérios e escalas da MBCV" },
      { property: "og:description", content: "Escalas, confirmações e lembretes de todos os ministérios da MBCV em um só lugar." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Church, title: "Todos os ministérios", text: "Louvor, Som, Recepção, Infantil e qualquer novo ministério — sem limites." },
  { icon: CalendarCheck2, title: "Confirmação com um toque", text: "Cada pessoa confirma presença ou avisa que não poderá ir." },
  { icon: Repeat2, title: "Substituições sem estresse", text: "O app sugere quem está livre e avisa o substituto." },
  { icon: BellRing, title: "Lembretes automáticos", text: "No dia, duas horas antes e quando falta confirmar." },
];

function Landing() {
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  return (
    <div className="min-h-screen bg-ink text-ink-foreground">
      <section className="relative flex min-h-[92vh] flex-col overflow-hidden">
        <img src={hero} alt="Equipe de louvor ministrando no culto" width={1280} height={1600} className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/60 to-ink" />
        <header className="relative z-10 flex items-center justify-between px-5 pt-6 pt-safe md:px-12">
          <BrandLockup light subtitle="MBCV" />
          <Button asChild variant="ghost" className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground">
            <Link to={signedIn ? "/inicio" : "/entrar"}>{signedIn ? "Abrir" : "Entrar"}</Link>
          </Button>
        </header>
        <div className="relative z-10 mt-auto px-5 pb-14 md:px-12 md:pb-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-gold">Organização · União · Propósito</p>
          <h1 className="mt-4 max-w-3xl text-[2.6rem] font-semibold leading-[1.02] md:text-7xl">
            Servir bem começa com uma <span className="text-gold">escala clara.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-ink-muted md:text-lg">
            O Escala+ reúne ministérios, eventos e escalas da MBCV. Cada integrante sabe onde serve, confirma presença e recebe lembretes no celular.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="gold" size="lg">
              <Link to={signedIn ? "/inicio" : "/entrar"}>{signedIn ? "Ir para o app" : "Entrar no Escala+"}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="border border-ink-foreground/25 text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground">
              <Link to="/instalar">
                <Download /> Instalar no celular
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="grid gap-4 px-5 py-14 md:grid-cols-4 md:px-12">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-3xl border border-ink-foreground/10 bg-ink-foreground/[0.04] p-5">
            <f.icon className="h-6 w-6 text-gold" />
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{f.text}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-ink-foreground/10 px-5 py-8 text-center text-xs text-ink-muted md:px-12">
        “Cada um exerça o dom que recebeu para servir os outros.” — 1 Pedro 4:10
      </footer>
    </div>
  );
}
