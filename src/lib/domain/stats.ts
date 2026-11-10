import type { Assignment, ChurchEvent, MinistryFunction } from "../types";

export interface FunctionStats {
  functionId: string;
  needed: number;
  required: boolean;
  assigned: number; // people currently holding a seat (not replaced)
  confirmed: number;
}

export interface MinistryStats {
  ministryId: string;
  needed: number;
  assigned: number;
  confirmed: number;
  pending: number;
  unavailable: number; // needs substitution
  substitutionPending: number; // substitute invited, waiting
  percent: number;
  complete: boolean;
  missingRequired: number; // required seats without a confirmed person
  functions: FunctionStats[];
}

export interface EventStats {
  needed: number;
  assigned: number;
  confirmed: number;
  pending: number;
  unavailable: number;
  substitutionPending: number;
  percent: number;
  complete: boolean;
  ministries: MinistryStats[];
}

/** Assignments that currently occupy a seat (the person is expected to serve). */
export function isSeat(a: Pick<Assignment, "status">) {
  return a.status === "pendente" || a.status === "confirmado";
}

/**
 * Confirmation indicators for an event. Seats come from the event slots; a schedule is only
 * complete when every required seat has a confirmed person and there is no open substitution.
 */
export function eventStats(
  event: Pick<ChurchEvent, "slots" | "ministryIds">,
  assignments: Pick<Assignment, "ministryId" | "functionId" | "status" | "replacesId">[],
  functions: Pick<MinistryFunction, "id" | "ministryId" | "required">[],
): EventStats {
  const fnById = new Map(functions.map((f) => [f.id, f]));
  const ministryIds = Array.from(new Set([...event.ministryIds, ...event.slots.map((s) => s.ministryId), ...assignments.map((a) => a.ministryId)]));
  const ministries: MinistryStats[] = ministryIds.map((mid) => {
    const slots = event.slots.filter((s) => s.ministryId === mid);
    const own = assignments.filter((a) => a.ministryId === mid);
    const fnIds = Array.from(new Set([...slots.map((s) => s.functionId), ...own.map((a) => a.functionId)]));
    const fstats: FunctionStats[] = fnIds.map((fid) => {
      const slot = slots.find((s) => s.functionId === fid);
      const list = own.filter((a) => a.functionId === fid);
      return {
        functionId: fid,
        needed: slot?.count ?? 0,
        required: fnById.get(fid)?.required ?? false,
        assigned: list.filter(isSeat).length,
        confirmed: list.filter((a) => a.status === "confirmado").length,
      };
    });
    const neededSum = fstats.reduce((s, f) => s + Math.max(f.needed, f.assigned), 0);
    const confirmed = own.filter((a) => a.status === "confirmado").length;
    const pending = own.filter((a) => a.status === "pendente").length;
    const unavailable = own.filter((a) => a.status === "indisponivel").length;
    const substitutionPending = own.filter((a) => a.status === "substituicao_solicitada").length;
    const missingRequired = fstats
      .filter((f) => f.required)
      .reduce((s, f) => s + Math.max(0, Math.max(f.needed, 1) - f.confirmed), 0);
    const seatsFilled = fstats.every((f) => f.confirmed >= f.needed);
    return {
      ministryId: mid,
      needed: neededSum,
      assigned: own.filter(isSeat).length,
      confirmed,
      pending,
      unavailable,
      substitutionPending,
      percent: neededSum ? Math.round((Math.min(confirmed, neededSum) / neededSum) * 100) : 0,
      complete: seatsFilled && missingRequired === 0 && unavailable === 0 && substitutionPending === 0 && neededSum > 0,
      missingRequired,
      functions: fstats,
    };
  });
  const sum = (k: keyof MinistryStats) => ministries.reduce((s, m) => s + (m[k] as number), 0);
  const needed = sum("needed");
  const confirmed = sum("confirmed");
  return {
    needed,
    assigned: sum("assigned"),
    confirmed,
    pending: sum("pending"),
    unavailable: sum("unavailable"),
    substitutionPending: sum("substitutionPending"),
    percent: needed ? Math.round((Math.min(confirmed, needed) / needed) * 100) : 0,
    complete: ministries.length > 0 && ministries.every((m) => m.complete),
    ministries,
  };
}
