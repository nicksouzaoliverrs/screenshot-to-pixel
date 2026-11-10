import { Settings2 } from "lucide-react";

export function FirebaseSetupNotice() {
  return (
    <div className="rounded-3xl border border-gold/40 bg-gold-soft p-5 text-sm text-gold-foreground dark:text-foreground">
      <div className="flex items-center gap-2 font-bold">
        <Settings2 className="h-4 w-4" /> Falta conectar o Firebase
      </div>
      <p className="mt-2">
        O Escala+ já está pronto, mas ainda não recebeu os dados do projeto Firebase da igreja. Assim que eles forem informados, o login e
        os dados passam a funcionar.
      </p>
    </div>
  );
}
