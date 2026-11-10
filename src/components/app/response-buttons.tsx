import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { respondAssignment } from "@/lib/api/respond.functions";
import { canRespond } from "@/lib/domain/reminders";
import { toastError } from "@/lib/errors";
import { useOnline } from "@/hooks/use-online";
import type { Assignment } from "@/lib/types";

export function ResponseButtons({ assignment, deadlineHours, compact }: { assignment: Assignment; deadlineHours: number; compact?: boolean }) {
  const [busy, setBusy] = useState<"confirmado" | "indisponivel" | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const online = useOnline();
  const open_ = assignment.eventStatus === "ativo" && canRespond(assignment.startsAt, deadlineHours, Date.now());
  if (!open_ || assignment.status === "substituido" || assignment.status === "substituicao_solicitada") return null;

  const send = async (response: "confirmado" | "indisponivel") => {
    if (!online) {
      toast.error("Sem internet: sua resposta só vale depois de enviada. Tente quando a conexão voltar.");
      return;
    }
    setBusy(response);
    try {
      await respondAssignment({ data: { id: assignment.id, response, reason: response === "indisponivel" ? reason.trim() : "" } });
      toast.success(response === "confirmado" ? "Presença confirmada. Deus abençoe seu serviço!" : "Indisponibilidade registrada. A liderança foi avisada.");
      setOpen(false);
      setReason("");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const isSub = !!assignment.replacesId;
  return (
    <>
      <div className="flex gap-2">
        {assignment.status !== "confirmado" && (
          <Button variant="confirm" size={compact ? "sm" : "default"} className="flex-1" disabled={!!busy} onClick={() => send("confirmado")}>
            {busy === "confirmado" ? <Loader2 className="animate-spin" /> : <Check />} {isSub ? "Aceitar substituição" : "Confirmar presença"}
          </Button>
        )}
        {assignment.status !== "indisponivel" && (
          <Button variant="decline" size={compact ? "sm" : "default"} className={assignment.status === "confirmado" ? "" : "flex-1"} disabled={!!busy} onClick={() => setOpen(true)}>
            <X /> {assignment.status === "confirmado" ? "Não poderei mais" : isSub ? "Recusar" : "Não poderei ir"}
          </Button>
        )}
        {assignment.status === "indisponivel" && (
          <p className="text-xs text-muted-foreground">Mudou de ideia? Você ainda pode confirmar.</p>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>{isSub ? "Recusar substituição" : "Informar indisponibilidade"}</DialogTitle>
            <DialogDescription>A liderança será avisada para providenciar {isSub ? "outra pessoa" : "um substituto"}.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Motivo (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
            <Button variant="destructive" disabled={!!busy} onClick={() => send("indisponivel")}>
              {busy === "indisponivel" && <Loader2 className="animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
