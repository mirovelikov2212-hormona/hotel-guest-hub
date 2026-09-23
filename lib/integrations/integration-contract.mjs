import { createHash } from "node:crypto";

export const INTEGRATION_CONNECTION_SCHEMA_VERSION =
  "integration-connections-v1";
export const INTEGRATION_EVENT_SCHEMA_VERSION =
  "integration-event-v1";
export const INTEGRATION_COMMAND_SCHEMA_VERSION =
  "integration-command-v1";

export const INTEGRATION_SYSTEM_TYPES = Object.freeze([
  "pms",
  "pos",
  "payment",
  "identity",
  "crm",
]);

export const INTEGRATION_CAPABILITIES = Object.freeze({
  pms: Object.freeze([
    "reservation.read",
    "stay.read",
    "room_assignment.read",
    "stay.lifecycle.read",
    "folio.charge.post",
    "folio.note.post",
    "late_checkout.update",
  ]),
  pos: Object.freeze([
    "transaction.read",
    "charge.post",
  ]),
  payment: Object.freeze([
    "payment.status.read",
    "payment.intent.create",
    "payment.refund.request",
  ]),
  identity: Object.freeze([
    "access.status.read",
    "access.issue",
    "access.revoke",
  ]),
  crm: Object.freeze([
    "guest_profile.read",
    "guest_note.post",
  ]),
});

export const INTEGRATION_EVENT_TYPES = Object.freeze([
  "reservation.created",
  "reservation.updated",
  "reservation.cancelled",
  "stay.checked_in",
  "stay.room_changed",
  "stay.checked_out",
  "folio.charge_posted",
  "folio.charge_reversed",
  "pos.transaction_posted",
  "payment.succeeded",
  "payment.failed",
  "access.issued",
  "access.revoked",
]);

export const INTEGRATION_ACTION_TYPES = Object.freeze([
  "reservation.lookup",
  "stay.lookup",
  "folio.charge.post",
  "folio.note.post",
  "late_checkout.update",
  "pos.charge.post",
  "payment.intent.create",
  "payment.refund.request",
  "access.issue",
  "access.revoke",
  "guest_profile.lookup",
  "guest_note.post",
]);

const WRITE_CAPABILITIES = new Set([
  "folio.charge.post",
  "folio.note.post",
  "late_checkout.update",
  "charge.post",
  "payment.intent.create",
  "payment.refund.request",
  "access.issue",
  "access.revoke",
  "guest_note.post",
]);

const SENSITIVE_METADATA_KEYS = new Set([
  "secret",
  "token",
  "password",
  "apikey",
  "api_key",
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "privatekey",
  "private_key",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeConnectionId(value) {
  const id = lower(value).replace(/[^a-z0-9_-]/g, "");
  if (!id || id.length > 80) {
    throw new Error("INTEGRATION_CONNECTION_ID_INVALID");
  }
  return id;
}

function normalizeProviderKey(value) {
  const providerKey = lower(value).replace(/[^a-z0-9_-]/g, "");
  if (!providerKey || providerKey.length > 80) {
    throw new Error("INTEGRATION_PROVIDER_KEY_INVALID");
  }
  return providerKey;
}

function normalizeSystemType(value) {
  const systemType = lower(value);
  if (!INTEGRATION_SYSTEM_TYPES.includes(systemType)) {
    throw new Error("INTEGRATION_SYSTEM_TYPE_INVALID");
  }
  return systemType;
}

function sanitizeMetadata(value) {
  const source = record(value);
  const result = {};

  for (const [key, entry] of Object.entries(source)) {
    const normalizedKey = lower(key);
    if (SENSITIVE_METADATA_KEYS.has(normalizedKey)) {
      throw new Error("INTEGRATION_METADATA_SECRET_FORBIDDEN");
    }

    if (
      entry === null
      || typeof entry === "string"
      || typeof entry === "number"
      || typeof entry === "boolean"
    ) {
      result[key] =
        typeof entry === "string"
          ? entry.slice(0, 500)
          : entry;
    }
  }

  return result;
}

function normalizeCapabilities(systemType, values) {
  if (!Array.isArray(values)) {
    throw new Error("INTEGRATION_CAPABILITIES_INVALID");
  }

  const allowed = new Set(INTEGRATION_CAPABILITIES[systemType] || []);
  const capabilities = [
    ...new Set(values.map((value) => lower(value)).filter(Boolean)),
  ].sort();

  for (const capability of capabilities) {
    if (!allowed.has(capability)) {
      throw new Error(
        `INTEGRATION_CAPABILITY_NOT_ALLOWED:${systemType}:${capability}`,
      );
    }
  }

  return capabilities;
}

function normalizeMode(value) {
  const mode = lower(value) || "read_only";
  if (!["read_only", "read_write"].includes(mode)) {
    throw new Error("INTEGRATION_MODE_INVALID");
  }
  return mode;
}

function assertModeCapabilities(mode, capabilities) {
  if (
    mode === "read_only"
    && capabilities.some((capability) => WRITE_CAPABILITIES.has(capability))
  ) {
    throw new Error("INTEGRATION_READ_ONLY_WRITE_CAPABILITY_FORBIDDEN");
  }
}

export function normalizeIntegrationConnection(input) {
  const source = record(input);
  const systemType = normalizeSystemType(source.systemType);
  const mode = normalizeMode(source.mode);
  const capabilities = normalizeCapabilities(
    systemType,
    source.capabilities,
  );
  assertModeCapabilities(mode, capabilities);

  const externalHotelId = clean(source.externalHotelId);
  if (!externalHotelId || externalHotelId.length > 200) {
    throw new Error("INTEGRATION_EXTERNAL_HOTEL_ID_INVALID");
  }

  const credentialRef = clean(source.credentialRef);
  if (credentialRef && credentialRef.length > 200) {
    throw new Error("INTEGRATION_CREDENTIAL_REF_INVALID");
  }

  return Object.freeze({
    connectionId: normalizeConnectionId(source.connectionId),
    providerKey: normalizeProviderKey(source.providerKey),
    systemType,
    displayName: clean(source.displayName).slice(0, 120)
      || normalizeProviderKey(source.providerKey),
    externalHotelId,
    mode,
    active: source.active === true,
    capabilities: Object.freeze(capabilities),
    credentialRef: credentialRef || null,
    metadata: Object.freeze(sanitizeMetadata(source.metadata)),
  });
}

export function normalizeIntegrationConnectionsConfig(input) {
  const source = record(input);
  if (
    lower(source.schemaVersion)
    !== INTEGRATION_CONNECTION_SCHEMA_VERSION
  ) {
    throw new Error("INTEGRATION_CONFIG_SCHEMA_INVALID");
  }

  const revision = Number(source.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("INTEGRATION_CONFIG_REVISION_INVALID");
  }

  if (!Array.isArray(source.connections)) {
    throw new Error("INTEGRATION_CONNECTIONS_INVALID");
  }

  const connections = source.connections.map(normalizeIntegrationConnection);
  const ids = new Set();

  for (const connection of connections) {
    if (ids.has(connection.connectionId)) {
      throw new Error("INTEGRATION_CONNECTION_ID_DUPLICATE");
    }
    ids.add(connection.connectionId);
  }

  return Object.freeze({
    schemaVersion: INTEGRATION_CONNECTION_SCHEMA_VERSION,
    revision,
    connections: Object.freeze(connections),
  });
}

export function buildIntegrationConnectionsConfig(input) {
  const currentRevision = Number(input?.currentRevision || 0);
  const nextRevision =
    Number.isSafeInteger(currentRevision) && currentRevision >= 0
      ? currentRevision + 1
      : 1;

  return normalizeIntegrationConnectionsConfig({
    schemaVersion: INTEGRATION_CONNECTION_SCHEMA_VERSION,
    revision: nextRevision,
    connections: Array.isArray(input?.connections)
      ? input.connections
      : [],
  });
}

function requireConnectionCapability(connection, capability) {
  const normalized = lower(capability);
  if (!connection.capabilities.includes(normalized)) {
    throw new Error(
      `INTEGRATION_CAPABILITY_REQUIRED:${connection.connectionId}:${normalized}`,
    );
  }
}

function eventCapability(eventType) {
  const map = {
    "reservation.created": "reservation.read",
    "reservation.updated": "reservation.read",
    "reservation.cancelled": "reservation.read",
    "stay.checked_in": "stay.lifecycle.read",
    "stay.room_changed": "room_assignment.read",
    "stay.checked_out": "stay.lifecycle.read",
    "folio.charge_posted": "stay.read",
    "folio.charge_reversed": "stay.read",
    "pos.transaction_posted": "transaction.read",
    "payment.succeeded": "payment.status.read",
    "payment.failed": "payment.status.read",
    "access.issued": "access.status.read",
    "access.revoked": "access.status.read",
  };
  return map[eventType] || null;
}

function actionCapability(actionType) {
  const map = {
    "reservation.lookup": "reservation.read",
    "stay.lookup": "stay.read",
    "folio.charge.post": "folio.charge.post",
    "folio.note.post": "folio.note.post",
    "late_checkout.update": "late_checkout.update",
    "pos.charge.post": "charge.post",
    "payment.intent.create": "payment.intent.create",
    "payment.refund.request": "payment.refund.request",
    "access.issue": "access.issue",
    "access.revoke": "access.revoke",
    "guest_profile.lookup": "guest_profile.read",
    "guest_note.post": "guest_note.post",
  };
  return map[actionType] || null;
}

function normalizeOccurredAt(value) {
  const raw = clean(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) {
    throw new Error("INTEGRATION_OCCURRED_AT_INVALID");
  }
  return new Date(parsed).toISOString();
}

function normalizeProviderEventId(value) {
  const id = clean(value);
  if (!id || id.length > 240) {
    throw new Error("INTEGRATION_PROVIDER_EVENT_ID_INVALID");
  }
  return id;
}

function normalizeExternalSubject(value) {
  const source = record(value);
  return Object.freeze({
    reservationExternalId:
      clean(source.reservationExternalId).slice(0, 240) || null,
    stayExternalId:
      clean(source.stayExternalId).slice(0, 240) || null,
    roomExternalId:
      clean(source.roomExternalId).slice(0, 240) || null,
    transactionExternalId:
      clean(source.transactionExternalId).slice(0, 240) || null,
    guestExternalId:
      clean(source.guestExternalId).slice(0, 240) || null,
  });
}

export function normalizeCanonicalIntegrationEvent(input) {
  const source = record(input);
  const connection = normalizeIntegrationConnection(source.connection);

  if (!connection.active) {
    throw new Error("INTEGRATION_CONNECTION_INACTIVE");
  }

  const eventType = lower(source.eventType);
  if (!INTEGRATION_EVENT_TYPES.includes(eventType)) {
    throw new Error("INTEGRATION_EVENT_TYPE_INVALID");
  }

  const capability = eventCapability(eventType);
  if (!capability) {
    throw new Error("INTEGRATION_EVENT_CAPABILITY_UNMAPPED");
  }
  requireConnectionCapability(connection, capability);

  const providerEventId = normalizeProviderEventId(
    source.providerEventId,
  );
  const occurredAt = normalizeOccurredAt(source.occurredAt);

  return Object.freeze({
    schemaVersion: INTEGRATION_EVENT_SCHEMA_VERSION,
    connectionId: connection.connectionId,
    providerKey: connection.providerKey,
    systemType: connection.systemType,
    externalHotelId: connection.externalHotelId,
    providerEventId,
    eventType,
    occurredAt,
    idempotencyKey: sha256(
      [
        connection.connectionId,
        providerEventId,
        eventType,
      ].join("|"),
    ),
    subject: normalizeExternalSubject(source.subject),
    payload: Object.freeze(sanitizeMetadata(source.payload)),
    authority: Object.freeze({
      source: "external_provider",
      providerKey: connection.providerKey,
      directDatabaseWriteAllowed: false,
      normalizedMutationRequired: true,
    }),
  });
}

function normalizeCorrelationId(value) {
  const id = clean(value);
  if (!id || id.length > 240) {
    throw new Error("INTEGRATION_CORRELATION_ID_INVALID");
  }
  return id;
}

function commandApprovalPolicy(actionType) {
  if (
    actionType === "folio.charge.post"
    || actionType === "pos.charge.post"
    || actionType === "payment.refund.request"
    || actionType === "access.issue"
    || actionType === "access.revoke"
    || actionType === "late_checkout.update"
  ) {
    return "verified_workflow_or_human";
  }

  if (
    actionType === "payment.intent.create"
    || actionType === "folio.note.post"
    || actionType === "guest_note.post"
  ) {
    return "deterministic_workflow";
  }

  return "read_only";
}

export function buildIntegrationCommand(input) {
  const source = record(input);
  const connection = normalizeIntegrationConnection(source.connection);

  if (!connection.active) {
    throw new Error("INTEGRATION_CONNECTION_INACTIVE");
  }

  const actionType = lower(source.actionType);
  if (!INTEGRATION_ACTION_TYPES.includes(actionType)) {
    throw new Error("INTEGRATION_ACTION_TYPE_INVALID");
  }

  const capability = actionCapability(actionType);
  if (!capability) {
    throw new Error("INTEGRATION_ACTION_CAPABILITY_UNMAPPED");
  }
  requireConnectionCapability(connection, capability);

  if (
    WRITE_CAPABILITIES.has(capability)
    && connection.mode !== "read_write"
  ) {
    throw new Error("INTEGRATION_WRITE_CONNECTION_REQUIRED");
  }

  const correlationId = normalizeCorrelationId(source.correlationId);
  const approvalPolicy = commandApprovalPolicy(actionType);

  return Object.freeze({
    schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
    connectionId: connection.connectionId,
    providerKey: connection.providerKey,
    systemType: connection.systemType,
    externalHotelId: connection.externalHotelId,
    actionType,
    capability,
    correlationId,
    idempotencyKey: sha256(
      [
        connection.connectionId,
        actionType,
        correlationId,
      ].join("|"),
    ),
    target: normalizeExternalSubject(source.target),
    input: Object.freeze(sanitizeMetadata(source.input)),
    executionPolicy: Object.freeze({
      directAiExecutionAllowed: false,
      directDatabaseWriteAllowed: false,
      approvalPolicy,
      deterministicHandlerRequired: true,
    }),
  });
}
