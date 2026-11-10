import type { Assignment, ChurchEvent, Member, MinistryFunction, Unavailability } from "../types";
import { dateInRange, rangesOverlap } from "./time";

export type IssueLevel = "erro" | "aviso";
export interface Issue {
  level: IssueLevel;
  code:
    | "inativo"
    | "fora_do_ministerio"
    | "sem_funcao"
    | "sem_qualificacao"
    | "indisponivel"
    | "conflito_horario"
    | "mesmo_evento"
    | "duplicado";
  message: string;
}

const ACTIVE_STATUSES = new Set(["pendente", "confirmado", "substituicao_solicitada"]);

export interface CandidateContext {
  member: Member;
  fn: MinistryFunction;
  event: Pick<ChurchEvent, "id" | "date" | "startsAt" | "endsAt" | "title">;
  /** All assignments of this member on the event date (any event), excluding the one being edited. */
  memberAssignments: Pick<Assignment, "id" | "eventId" | "functionId" | "status" | "startsAt" | "endsAt">[];
  unavailabilities: Pick<Unavailability, "startDate" | "endDate" | "reason">[];
  /** Titles of other events by id, for messages. */
  eventTitles?: Record<string, string>;
}

/**
 * Validation rules for placing a member on a function of an event.
 * Errors block saving; warnings require the admin to confirm.
 */
export function checkCandidate(ctx: CandidateContext): Issue[] {
  const { member, fn, event } = ctx;
  const issues: Issue[] = [];
  if (!member.active) issues.push({ level: "erro", code: "inativo", message: `${member.name} está inativo(a).` });
  if (!member.ministryIds.includes(fn.ministryId))
    issues.push({ level: "erro", code: "fora_do_ministerio", message: `${member.name} não pertence a este ministério.` });
  if (fn.requiresQualification && !member.qualifiedFunctionIds.includes(fn.id))
    issues.push({ level: "erro", code: "sem_qualificacao", message: `${fn.name} exige permissão específica que ${member.name} não tem.` });
  else if (!member.functionIds.includes(fn.id))
    issues.push({ level: "aviso", code: "sem_funcao", message: `${member.name} não está cadastrado(a) para ${fn.name}.` });

  const off = ctx.unavailabilities.find((u) => dateInRange(event.date, u.startDate, u.endDate));
  if (off)
    issues.push({
      level: "aviso",
      code: "indisponivel",
      message: `${member.name} informou indisponibilidade nesta data${off.reason ? ` (${off.reason})` : ""}.`,
    });

  for (const a of ctx.memberAssignments) {
    if (!ACTIVE_STATUSES.has(a.status)) continue;
    if (a.eventId === event.id) {
      if (a.functionId === fn.id)
        issues.push({ level: "erro", code: "duplicado", message: `${member.name} já está nesta função neste evento.` });
      else issues.push({ level: "aviso", code: "mesmo_evento", message: `${member.name} já tem outra função neste evento.` });
    } else if (rangesOverlap(a.startsAt, a.endsAt, event.startsAt, event.endsAt)) {
      const t = ctx.eventTitles?.[a.eventId];
      issues.push({
        level: "aviso",
        code: "conflito_horario",
        message: `${member.name} já está escalado(a) em outro evento no mesmo horário${t ? ` (${t})` : ""}.`,
      });
    }
  }
  return issues;
}

export const hasBlocking = (issues: Issue[]) => issues.some((i) => i.level === "erro");
