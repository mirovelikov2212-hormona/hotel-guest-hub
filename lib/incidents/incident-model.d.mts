export type IncidentStatus =
  | "detected"
  | "investigating"
  | "cause_identified"
  | "fixed"
  | "verified"
  | "closed";

export type IncidentKind =
  | "technical"
  | "configuration"
  | "integration"
  | "human_error"
  | "data_quality"
  | "workflow";

export type IncidentEnvelope = {
  schemaVersion: "gostaya-incident-v1";
  incidentId: string;
  fingerprint: string;
  kind: IncidentKind;
  status: IncidentStatus;
  reporterKind: string;
  reporterRole?: string;
  module: string;
  environment: string;
  releaseSha: string | null;
  deploymentId: string | null;
  errorCode: string | null;
};

export const INCIDENT_SCHEMA_VERSION: "gostaya-incident-v1";
export const INCIDENT_STATUSES: readonly IncidentStatus[];
export const INCIDENT_KINDS: readonly IncidentKind[];

export function buildAutomaticIncidentEnvelope(
  input?: Record<string, unknown>,
): IncidentEnvelope | null;

export function buildHumanIncidentEnvelope(
  input?: Record<string, unknown>,
): IncidentEnvelope;

export function assertIncidentTransition(
  from: unknown,
  to: unknown,
): { from: IncidentStatus; to: IncidentStatus; noop: boolean };

export function readIncidentEnvelope(
  metadata: unknown,
): IncidentEnvelope | null;

export function deriveIncidentProjections(
  events?: unknown[],
): Array<Record<string, unknown>>;
