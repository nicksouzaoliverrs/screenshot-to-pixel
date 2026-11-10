import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Share, PlusSquare, MoreVertical, Download, CheckCircle2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/app/brand";
import { isIOS, isStandalone } from "@/lib/pwa";

export const Route = createFileRoute("/instalar")({
  head: () => ({
    meta: [
      { title: "Instalar o Escala+ no celular" },
      { name: "description", content: "Adicione o Escala+ à tela inicial do Android ou iPhone, sem loja de aplicativos." },
      { property: "og:title", content: "Instalar o Escala+ no celular" },
      { property: "og:description", content: "Passo a passo para instalar o Escala+ no Android e no iPhone." },
    ],
  }),
  component: Install,
});

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function Install() {
  const [platform, setPlatform] = useState<"ios" | "android">("android");
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);

  useEffect(() => {
    setPlatform(isIOS() ? "ios" : "android");
    setInstalled(isStandalone());
    const h = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const steps =
    platform === "ios"
      ? [
          { icon: Smartphone, text: "Abra este endereço no Safari (no iPhone, a instalação só funciona pelo Safari)." },
          { icon: Share, text: "Toque no botão Compartilhar, na barra de baixo." },
          { icon: PlusSquare, text: "Escolha “Adicionar à Tela de Início” e confirme." },
          { icon: CheckCircle2, text: "Abra o Escala+ pelo ícone e ative as notificações no seu perfil (iOS 16.4 ou mais novo)." },
        ]
      : [
          { icon: Smartphone, text: "Abra este endereço no Chrome." },
          { icon: MoreVertical, text: "Toque no menu ⋮ no canto superior." },
          { icon: Download, text: "Escolha “Instalar app” ou “Adicionar à tela inicial”." },
          { icon: CheckCircle2, text: "Abra o Escala+ pelo ícone e ative as notificações no seu perfil." },
        ];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-ink-gradient px-5 pb-16 pt-8 pt-safe text-ink-foreground md:px-12">
        <Link to="/">
          <BrandLockup light subtitle="MBCV" />
        </Link>
        <h1 className="mt-10 text-4xl font-semibold">Instale no celular</h1>
        <p className="mt-2 max-w-md text-ink-muted">O Escala+ funciona como um aplicativo, direto da tela inicial — sem Play Store ou App Store.</p>
      </div>
      <div className="mx-auto -mt-8 max-w-xl px-4 pb-16">
        <div className="rounded-[2rem] bg-card p-6 shadow-float">
          {installed ? (
            <div className="flex items-center gap-3 text-ok">
              <CheckCircle2 className="h-6 w-6" />
              <p className="font-semibold">O Escala+ já está instalado neste aparelho.</p>
            </div>
          ) : (
            <>
              <div className="mb-5 inline-flex rounded-full bg-muted p-1 text-sm font-semibold">
                {(["android", "ios"] as const).map((p) => (
                  <button key={p} onClick={() => setPlatform(p)} className={`rounded-full px-4 py-1.5 ${platform === p ? "bg-card shadow-card" : "text-muted-foreground"}`}>
                    {p === "ios" ? "iPhone" : "Android"}
                  </button>
                ))}
              </div>
              {prompt && platform === "android" && (
                <Button
                  variant="gold"
                  size="lg"
                  className="mb-5 w-full"
                  onClick={async () => {
                    await prompt.prompt();
                    await prompt.userChoice;
                    setPrompt(null);
                  }}
                >
                  <Download /> Instalar agora
                </Button>
              )}
              <ol className="space-y-4">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <s.icon className="h-4.5 w-4.5" />
                    </span>
                    <p className="pt-1.5 text-sm">{s.text}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/inicio" className="font-semibold text-primary">Voltar para o app</Link>
        </p>
      </div>
    </div>
  );
}
