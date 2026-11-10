import { toast } from "sonner";

export function errMsg(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Você está sem internet. Tente de novo quando a conexão voltar.";
  if (e instanceof Error) {
    if (/permission|insufficient/i.test(e.message)) return "Você não tem permissão para isso.";
    return e.message;
  }
  return "Algo deu errado. Tente novamente.";
}

export function toastError(e: unknown) {
  toast.error(errMsg(e));
}
