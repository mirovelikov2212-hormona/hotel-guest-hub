export type IntegrationSystemType =
  | "pms"
  | "pos"
  | "payment"
  | "identity"
  | "crm";

export type IntegrationConnection = {
  connectionId: string;
  providerKey: string;
  systemType: IntegrationSystemType;
  displayName: string;
  externalHotelId: string;
  mode: "read_only" | "read_write";
  active: boolean;
  capabilities: readonly string[];
  credentialRef: string | null;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
};

export type IntegrationConnectionsConfig = {
  schemaVersion: "integration-connections-v1";
  revision: number;
  connections: readonly IntegrationConnection[];
};

export type CanonicalIntegrationEvent = {
  schemaVersion: "integration-event-v1";
  connectionId: string;
  providerKey: string;
  systemType: IntegrationSystemType;
  externalHotelId: string;
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  idempotencyKey: string;
  subject: Readonly<Record<string, string | null>>;
  payload: Readonly<Record<string, string | number | boolean | null>>;
  authority: {
    source: "external_provider";
    providerKey: string;
    directDatabaseWriteAllowed: false;
    normalizedMutationRequired: true;
  };
};

export type IntegrationCommand = {
  schemaVersion: "integration-command-v1";
  connectionId: string;
  providerKey: string;
  systemType: IntegrationSystemType;
  externalHotelId: string;
  actionType: string;
  capability: string;
  correlationId: string;
  idempotencyKey: string;
  target: Readonly<Record<string, string | null>>;
  input: Readonly<Record<string, string | number | boolean | null>>;
  executionPolicy: {
    directAiExecutionAllowed: false;
    directDatabaseWriteAllowed: false;
    approvalPolicy:
      | "read_only"
      | "deterministic_workflow"
      | "verified_workflow_or_human";
    deterministicHandlerRequired: true;
  };
};

export const INTEGRATION_CONNECTION_SCHEMA_VERSION:
  "integration-connections-v1";
export const INTEGRATION_EVENT_SCHEMA_VERSION: "integration-event-v1";
export const INTEGRATION_COMMAND_SCHEMA_VERSION: "integration-command-v1";
export const INTEGRATION_SYSTEM_TYPES: readonly IntegrationSystemType[];
export const INTEGRATION_CAPABILITIES: Readonly<
  Record<IntegrationSystemType, readonly string[]>
>;
export const INTEGRATION_EVENT_TYPES: readonly string[];
export const INTEGRATION_ACTION_TYPES: readonly string[];

export function normalizeIntegrationConnection(
  input: unknown,
): IntegrationConnection;

export function normalizeIntegrationConnectionsConfig(
  input: unknown,
): IntegrationConnectionsConfig;

export function buildIntegrationConnectionsConfig(input: {
  currentRevision?: number;
  connections?: unknown[];
}): IntegrationConnectionsConfig;

export function normalizeCanonicalIntegrationEvent(input: {
  connection: unknown;
  providerEventId: unknown;
  eventType: unknown;
  occurredAt: unknown;
  subject?: unknown;
  payload?: unknown;
}): CanonicalIntegrationEvent;

export function buildIntegrationCommand(input: {
  connection: unknown;
  actionType: unknown;
  correlationId: unknown;
  target?: unknown;
  input?: unknown;
}): IntegrationCommand;
