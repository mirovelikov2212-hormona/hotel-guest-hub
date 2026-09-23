import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertIncidentTransition,
  buildAutomaticIncidentEnvelope,
  buildHumanIncidentEnvelope,
  deriveIncidentProjections,
} from "../../lib/incidents/incident-model.mjs";

test("automatic errors correlate across hotels without merging hotel incidents", () => {
  const one = buildAutomaticIncidentEnvelope({
    hotelId: "11111111-1111-4111-8111-111111111111",
    severity: "error",
    source: "api",
    eventType: "request_write_failed",
    errorCode: "DB_TIMEOUT",
    module: "staff_operations",
    environment: "production",
    releaseSha: "a".repeat(40),
  });
  const two = buildAutomaticIncidentEnvelope({
    hotelId: "22222222-2222-4222-8222-222222222222",
    severity: "critical",
    source: "api",
    eventType: "request_write_failed",
    errorCode: "DB_TIMEOUT",
    module: "staff_operations",
    environment: "production",
    releaseSha: "a".repeat(40),
  });

  assert.ok(one);
  assert.ok(two);
  assert.equal(one.fingerprint, two.fingerprint);
  assert.notEqual(one.incidentId, two.incidentId);
  assert.equal(one.status, "detected");
  assert.equal(two.status, "detected");
});

test("info and warning events do not automatically become incidents", () => {
  assert.equal(
    buildAutomaticIncidentEnvelope({
      severity: "warning",
      source: "api",
      eventType: "slow_request",
    }),
    null,
  );
  assert.equal(
    buildAutomaticIncidentEnvelope({
      severity: "info",
      source: "api",
      eventType: "request_ok",
    }),
    null,
  );
});

test("human reports produce stable recurrence fingerprint per hotel/module/problem", () => {
  const input = {
    hotelId: "11111111-1111-4111-8111-111111111111",
    kind: "human_error",
    module: "staff_operations",
    summary: "Reception clicked the wrong request 311",
    reporterRole: "manager",
    environment: "production",
  };
  const one = buildHumanIncidentEnvelope(input);
  const two = buildHumanIncidentEnvelope({
    ...input,
    summary: "Reception clicked the wrong request 406",
  });

  assert.equal(one.fingerprint, two.fingerprint);
  assert.equal(one.incidentId, two.incidentId);
  assert.equal(one.reporterKind, "human");
});

test("incident lifecycle is explicit and rejects invalid jumps", () => {
  assert.deepEqual(
    assertIncidentTransition("detected", "investigating"),
    { from: "detected", to: "investigating", noop: false },
  );
  assert.deepEqual(
    assertIncidentTransition("fixed", "verified"),
    { from: "fixed", to: "verified", noop: false },
  );
  assert.throws(
    () => assertIncidentTransition("detected", "verified"),
    /INCIDENT_STATUS_TRANSITION_INVALID/,
  );
});

test("projection groups recurrence and identifies same fingerprint across hotels", () => {
  const envelopeA = buildAutomaticIncidentEnvelope({
    hotelId: "11111111-1111-4111-8111-111111111111",
    severity: "error",
    source: "api",
    eventType: "same_problem",
  });
  const envelopeB = buildAutomaticIncidentEnvelope({
    hotelId: "22222222-2222-4222-8222-222222222222",
    severity: "error",
    source: "api",
    eventType: "same_problem",
  });

  const projections = deriveIncidentProjections([
    {
      id: "e1",
      hotel_id: "11111111-1111-4111-8111-111111111111",
      severity: "error",
      source: "api",
      event_type: "same_problem",
      message: "Same problem",
      created_at: "2026-09-23T10:00:00.000Z",
      metadata_json: { incident: envelopeA },
    },
    {
      id: "e2",
      hotel_id: "11111111-1111-4111-8111-111111111111",
      severity: "error",
      source: "api",
      event_type: "same_problem",
      message: "Same problem again",
      created_at: "2026-09-23T10:05:00.000Z",
      metadata_json: { incident: envelopeA },
    },
    {
      id: "e3",
      hotel_id: "22222222-2222-4222-8222-222222222222",
      severity: "error",
      source: "api",
      event_type: "same_problem",
      message: "Same problem",
      created_at: "2026-09-23T10:10:00.000Z",
      metadata_json: { incident: envelopeB },
    },
  ]);

  assert.equal(projections.length, 2);
  const hotelA = projections.find(
    (incident) =>
      incident.incidentId === envelopeA.incidentId,
  );
  assert.equal(hotelA.occurrenceCount, 2);
  assert.equal(hotelA.hotelsWithSameFingerprint, 2);
});

test("system error logger automatically enriches errors but preserves explicit human incident envelopes", () => {
  const source = readFileSync(
    new URL("../../lib/server/system-events.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /buildAutomaticIncidentEnvelope/);
  assert.match(source, /hasExplicitIncident/);
  assert.match(source, /automaticIncident/);
  assert.match(source, /incident: automaticIncident/);
  assert.match(source, /severity.*error/);
});

test("Manager problem reports derive hotel scope from the authenticated Manager session", () => {
  const server = readFileSync(
    new URL("../../lib/server/incident-center.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/staff/incidents/report/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /getCurrentStaffSession\(hotelSlug, "manager"\)/);
  assert.match(server, /String\(hotel\.id\) !== String\(session\.hotel_id\)/);
  assert.match(server, /buildHumanIncidentEnvelope/);
  assert.match(server, /eventType: "incident_human_reported"/);
  assert.match(route, /enforceStaffSameOrigin\(req\)/);
  assert.doesNotMatch(route, /body\.hotelId/);
});

test("Platform Incident Center is append-only and Platform Admin controlled", () => {
  const server = readFileSync(
    new URL("../../lib/server/incident-center.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/control-plane/incidents/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /canMutateControlPlane\(input\.authority\.role\)/);
  assert.match(server, /eventType: "incident_status_changed"/);
  assert.match(server, /assertIncidentTransition/);
  assert.match(server, /logControlPlaneAudit/);
  assert.doesNotMatch(server, /\.from\("incidents"\)/);
  assert.match(server, /\.from\("system_events"\)/);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/);
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
});

test("Incident Center UI exposes global lifecycle and Manager report surfaces", () => {
  const control = readFileSync(
    new URL("../../app/control-plane/IncidentCenterPanel.tsx", import.meta.url),
    "utf8",
  );
  const manager = readFileSync(
    new URL("../../components/staff/ManagerProblemReportCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(control, /GOSTAYA Incident Center/);
  assert.match(control, /criticalOpen/);
  assert.match(control, /hotelsWithSameFingerprint/);
  assert.match(control, /cause_identified/);
  assert.match(manager, /Report a problem/);
  assert.match(manager, /incident_human_reported|\/api\/staff\/incidents\/report/);
});
