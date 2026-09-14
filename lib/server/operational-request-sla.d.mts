export type OperationalRequestSlaPolicy = Readonly<{
  version: 1;
  firstResponseMinutes: number;
  escalationDepartments: readonly string[];
  sourceRequestDef: string | null;
  source: "request_def" | "platform_default";
}>;

export type OperationalRequestSlaState =
  | "pending"
  | "breached"
  | "acknowledged"
  | "acknowledged_after_breach"
  | "attention_required"
  | "closed"
  | "closed_after_breach"
  | "invalid_timestamp";

export type OperationalRequestSlaEvidence = Readonly<{
  state: OperationalRequestSlaState;
  breached: boolean;
  escalationRequired: boolean;
  requiresAttention: boolean;
  ageMinutes: number | null;
  firstResponseMinutes: number;
  deadlineAtIso: string | null;
  firstResponseAtIso: string | null;
  firstResponseDelayMinutes: number | null;
  escalationDepartments: readonly string[];
  policy: OperationalRequestSlaPolicy;
}>;

export const OPERATIONAL_SLA_SNAPSHOT_VERSION: 1;
export const DEFAULT_OPERATIONAL_FIRST_RESPONSE_SLA_MINUTES: 10;

export function normalizeOperationalRequestSlaPolicy(policy?: {
  firstResponseMinutes?: unknown;
  escalationDepartments?: unknown;
  sourceRequestDef?: unknown;
  source?: unknown;
}): OperationalRequestSlaPolicy;

export function buildOperationalRequestSlaSnapshot(input?: {
  requestDef?: {
    id?: unknown;
    slaMinutes?: unknown;
    escalationDepartments?: unknown;
  } | null;
  sourceRequestDef?: unknown;
}): OperationalRequestSlaPolicy;

export function getOperationalRequestAgeMinutes(
  createdAtIso: unknown,
  now?: Date | unknown,
): number | null;

export function evaluateOperationalRequestSla(input?: {
  status?: unknown;
  createdAtIso?: unknown;
  startedAtIso?: unknown;
  resolvedAtIso?: unknown;
  now?: Date | unknown;
  policy?: {
    firstResponseMinutes?: unknown;
    escalationDepartments?: unknown;
    sourceRequestDef?: unknown;
    source?: unknown;
  };
}): OperationalRequestSlaEvidence;
