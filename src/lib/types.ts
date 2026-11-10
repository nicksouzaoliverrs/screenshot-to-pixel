// Shared Firestore document shapes. All times are epoch milliseconds; dates are "YYYY-MM-DD"
// and clock times "HH:MM" in America/Sao_Paulo.

export type AccountStatus = "pendente" | "ativo" | "bloqueado";

export interface Account {
  id: string; // = auth uid
  email: string;
  emailVerified: boolean;
  name: string;
  photoURL: string | null;
  memberId: string | null;
  status: AccountStatus;
  /** Ministry ids this account leads (server-maintained; used by security rules). */
  leaderOf: string[];
  createdAt: number;
  lastSeenAt: number;
}

export interface RoleDoc {
  id: string; // = uid
  admin: boolean;
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon key
  color: string; // hex
  logo: string | null; // small data URL
  active: boolean;
  notes: string;
  leaderMemberIds: string[];
  leaderUserIds: string[]; // derived server-side for security rules
  /** Rules: leaders may build schedules for this ministry. */
  leadersCanSchedule: boolean;
  /** Rules: members may respond until N hours before the event. 0 = until start. */
  confirmDeadlineHours: number;
  order: number;
  createdAt: number;
}

export interface MinistryFunction {
  id: string;
  ministryId: string;
  name: string;
  required: boolean;
  defaultCount: number;
  allowMultiple: boolean;
  requiresQualification: boolean; // only members qualified for this function
  notes: string;
  order: number;
  active: boolean;
}

export interface Member {
  id: string;
  name: string;
  nameLower: string;
  photo: string | null; // small data URL
  active: boolean;
  ministryIds: string[];
  functionIds: string[]; // functions this person can perform
  qualifiedFunctionIds: string[]; // functions requiring special permission
  userId: string | null;
  createdAt: number;
}

/** Personal data — readable only by admins, leaders and the person. */
export interface MemberPrivate {
  id: string; // = member id
  email: string;
  phone: string;
  birthDate: string; // YYYY-MM-DD or ""
  birthMonthDay: string; // MM-DD or ""
  notes: string;
}

export interface EventSlot {
  ministryId: string;
  functionId: string;
  count: number;
}

export type EventStatus = "ativo" | "cancelado";

export interface ChurchEvent {
  id: string;
  title: string;
  kind: string; // template/category name (e.g. "Culto de domingo")
  date: string;
  startTime: string;
  endTime: string;
  startsAt: number;
  endsAt: number;
  description: string;
  location: string;
  notes: string;
  status: EventStatus;
  ministryIds: string[];
  slots: EventSlot[];
  seriesId: string | null;
  templateId: string | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

export interface EventTemplate {
  id: string;
  name: string;
  weekday: number | null; // 0=domingo
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  ministryIds: string[];
  slots: EventSlot[];
  createdAt: number;
}

export type AssignmentStatus =
  | "pendente"
  | "confirmado"
  | "indisponivel" // needs a substitute
  | "substituicao_solicitada" // substitute invited, waiting for them
  | "substituido";

export interface AssignmentHistoryEntry {
  at: number;
  by: string; // uid or "sistema"
  byName: string;
  action: string;
  status?: AssignmentStatus;
  note?: string;
}

export interface Assignment {
  id: string;
  eventId: string;
  eventDate: string;
  startsAt: number;
  endsAt: number;
  eventStatus: EventStatus;
  ministryId: string;
  functionId: string;
  memberId: string;
  userId: string | null;
  status: AssignmentStatus;
  reason: string;
  respondedAt: number | null;
  replacesId: string | null; // this assignment is a substitute for another
  replacedById: string | null;
  history: AssignmentHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface Unavailability {
  id: string;
  memberId: string;
  userId: string | null;
  startDate: string;
  endDate: string;
  /** Epoch ms of startDate 00:00 in the church timezone (used by security rules). */
  startMs: number;
  reason: string;
  createdAt: number;
  createdBy: string;
}

export type NoticePriority = "normal" | "importante" | "urgente";
export type NoticeAudience = "todos" | "ministerio" | "selecionados";

export interface Notice {
  id: string;
  title: string;
  body: string;
  priority: NoticePriority;
  audience: NoticeAudience;
  ministryIds: string[];
  memberIds: string[];
  /** Precomputed recipients (user ids) so members can query their notices. */
  recipientUserIds: string[];
  publishAt: number;
  expiresAt: number | null;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export type NotificationKind =
  | "escalado"
  | "escala_alterada"
  | "escala_removida"
  | "evento_cancelado"
  | "confirmacao"
  | "indisponibilidade"
  | "substituicao_solicitada"
  | "substituicao_confirmada"
  | "substituicao_recusada"
  | "lembrete_dia"
  | "lembrete_2h"
  | "lembrete_pendente"
  | "comunicado"
  | "conta";

export type DeliveryStatus = "pendente" | "enviado" | "falhou" | "sem_dispositivo" | "desativado";

export interface AppNotification {
  id: string; // = dedupe key
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: number;
  push: DeliveryStatus;
  pushError: string;
  pushAt: number | null;
}

export interface ActivityEntry {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: number;
}

export interface AppSettings {
  churchName: string;
  appName: string;
  logo: string | null;
  brandColor: string; // hex accent for the church
  timezone: string;
  reminders: {
    dayOf: boolean;
    dayOfHour: number; // hour of day (SP) to send the day-of reminder
    twoHours: boolean;
    pending: boolean;
    pendingHoursBefore: number;
  };
  notify: {
    escalado: boolean;
    alteracao: boolean;
    cancelamento: boolean;
    confirmacaoAdmin: boolean;
    indisponibilidadeAdmin: boolean;
    substituicao: boolean;
  };
  defaultConfirmDeadlineHours: number;
  unavailabilityLockDays: number; // members can edit future unavailability up to N days before
  allowSelfSignup: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  churchName: "MBCV",
  appName: "Escala+",
  logo: null,
  brandColor: "#C9A34E",
  timezone: "America/Sao_Paulo",
  reminders: { dayOf: true, dayOfHour: 8, twoHours: true, pending: true, pendingHoursBefore: 48 },
  notify: {
    escalado: true,
    alteracao: true,
    cancelamento: true,
    confirmacaoAdmin: true,
    indisponibilidadeAdmin: true,
    substituicao: true,
  },
  defaultConfirmDeadlineHours: 0,
  unavailabilityLockDays: 0,
  allowSelfSignup: true,
};
