import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildIntegrationCommand,
  buildIntegrationConnectionsConfig,
  normalizeCanonicalIntegrationEvent,
  normalizeIntegrationConnection,
} from "../../lib/integrations/integration-contract.mjs";

function pmsConnection(overrides = {}) {
  return {
    connectionId: "pms_main",
    providerKey: "generic_pms",
    systemType: "pms",
    displayName: "Primary PMS",
    externalHotelId: "HOTEL-001",
    mode: "read_only",
    active: true,
    capabilities: [
      "reservation.read",
      "stay.read",
      "room_assignment.read",
      "stay.lifecycle.read",
    ],
    credentialRef: "secret-manager://hotel-001/pms",
    metadata: {
      region: "eu",
    },
    ...overrides,
  };
}

test("Integration connection model is provider-neutral and capability-scoped", () => {
  const connection = normalizeIntegrationConnection(pmsConnection());

  assert.equal(connection.systemType, "pms");
  assert.equal(connection.providerKey, "generic_pms");
  assert.equal(connection.mode, "read_only");
  assert.deepEqual(connection.capabilities, [
    "reservation.read",
    "room_assignment.read",
    "stay.lifecycle.read",
    "stay.read",
  ]);
});

test("read-only integration cannot claim write capabilities", () => {
  assert.throws(
    () =>
      normalizeIntegrationConnection(
        pmsConnection({
          capabilities: [
            "stay.read",
            "folio.charge.post",
          ],
        }),
      ),
    /INTEGRATION_READ_ONLY_WRITE_CAPABILITY_FORBIDDEN/,
  );
});

test("integration metadata rejects secrets and tokens", () => {
  assert.throws(
    () =>
      normalizeIntegrationConnection(
        pmsConnection({
          metadata: {
            api_key: "must-not-live-here",
          },
        }),
      ),
    /INTEGRATION_METADATA_SECRET_FORBIDDEN/,
  );
});

test("canonical inbound event has deterministic idempotency and no direct database authority", () => {
  const input = {
    connection: pmsConnection(),
    providerEventId: "evt-123",
    eventType: "stay.checked_in",
    occurredAt: "2026-09-23T10:00:00.000Z",
    subject: {
      reservationExternalId: "res-1",
      stayExternalId: "stay-1",
      roomExternalId: "room-101",
    },
    payload: {
      roomNumber: "101",
    },
  };

  const first = normalizeCanonicalIntegrationEvent(input);
  const second = normalizeCanonicalIntegrationEvent(input);

  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.idempotencyKey.length, 64);
  assert.equal(first.authority.directDatabaseWriteAllowed, false);
  assert.equal(first.authority.normalizedMutationRequired, true);
});

test("outbound financial and identity actions never grant AI direct execution authority", () => {
  const pmsCommand = buildIntegrationCommand({
    connection: pmsConnection({
      mode: "read_write",
      capabilities: ["stay.read", "folio.charge.post"],
    }),
    actionType: "folio.charge.post",
    correlationId: "request-123",
    target: { stayExternalId: "stay-1" },
    input: { amountMinor: 2500, currency: "EUR" },
  });

  assert.equal(
    pmsCommand.executionPolicy.approvalPolicy,
    "verified_workflow_or_human",
  );
  assert.equal(pmsCommand.executionPolicy.directAiExecutionAllowed, false);
  assert.equal(pmsCommand.executionPolicy.directDatabaseWriteAllowed, false);

  const identityCommand = buildIntegrationCommand({
    connection: {
      connectionId: "door_access",
      providerKey: "generic_identity",
      systemType: "identity",
      displayName: "Door Access",
      externalHotelId: "HOTEL-001",
      mode: "read_write",
      active: true,
      capabilities: ["access.status.read", "access.issue"],
      credentialRef: "secret-manager://hotel-001/identity",
      metadata: {},
    },
    actionType: "access.issue",
    correlationId: "stay-1",
    target: { stayExternalId: "stay-1", roomExternalId: "101" },
    input: { accessProfile: "guest_room" },
  });

  assert.equal(
    identityCommand.executionPolicy.approvalPolicy,
    "verified_workflow_or_human",
  );
  assert.equal(identityCommand.executionPolicy.directAiExecutionAllowed, false);
});

test("connection config revisions are deterministic and reject duplicate connection ids", () => {
  const config = buildIntegrationConnectionsConfig({
    currentRevision: 4,
    connections: [pmsConnection()],
  });

  assert.equal(config.revision, 5);
  assert.equal(config.connections.length, 1);

  assert.throws(
    () =>
      buildIntegrationConnectionsConfig({
        currentRevision: 5,
        connections: [pmsConnection(), pmsConnection()],
      }),
    /INTEGRATION_CONNECTION_ID_DUPLICATE/,
  );
});

test("Integration Layer config is hotel-scoped, entitled, Platform Admin audited and CAS protected", () => {
  const server = readFileSync(
    new URL("../../lib/server/integration-connections.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/control-plane/integrations/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /"integration_layer"/);
  assert.match(server, /\.eq\("hotel_id", hotelId\)/);
  assert.match(server, /\.eq\("key", SETTING_KEY\)/);
  assert.match(server, /canMutateControlPlane\(input\.authority\.role\)/);
  assert.match(server, /INTEGRATION_REVISION_CONFLICT/);
  assert.match(server, /\.eq\("updated_at", currentRow\.updated_at\)/);
  assert.match(server, /logControlPlaneAudit/);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/);
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
  assert.doesNotMatch(route, /body\.hotelId/);
});

test("Manager integration projection is read-only and hides credential references", () => {
  const server = readFileSync(
    new URL("../../lib/server/integration-status.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/staff/integrations/status/route.ts", import.meta.url),
    "utf8",
  );
  const card = readFileSync(
    new URL("../../components/staff/IntegrationStatusCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(server, /getCurrentStaffSession\(hotelSlug, "manager"\)/);
  assert.match(server, /hotelManagerCanEdit: false/);
  assert.match(server, /platformAdminOwnsConfiguration: true/);
  assert.match(server, /directProviderDatabaseWritesAllowed: false/);
  assert.match(server, /credentialConfigured: Boolean\(connection\.credentialRef\)/);
  assert.doesNotMatch(card, /credentialRef/);
  assert.match(route, /integration_module_not_entitled/);
});

test("Control Plane editor explicitly prohibits secret values", () => {
  const panel = readFileSync(
    new URL("../../app/control-plane/IntegrationConnectionsPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(panel, /Do not enter API keys, tokens or passwords/);
  assert.match(panel, /Credential reference/);
  assert.match(panel, /Digital-key \/ door-access capabilities are adapter actions only/);
});

test("Integration foundation stays generic and does not hardcode vendor-specific behavior", () => {
  const model = readFileSync(
    new URL("../../lib/integrations/integration-contract.mjs", import.meta.url),
    "utf8",
  );
  const server = readFileSync(
    new URL("../../lib/server/integration-connections.ts", import.meta.url),
    "utf8",
  );
  const combined = `${model}\n${server}`.toLowerCase();

  assert.doesNotMatch(combined, /dormakaba/);
  assert.doesNotMatch(combined, /alliants/);
  assert.doesNotMatch(combined, /mews/);
  assert.doesNotMatch(combined, /opera cloud/);
});
