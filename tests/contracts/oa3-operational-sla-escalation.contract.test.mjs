import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_OPERATIONAL_FIRST_RESPONSE_SLA_MINUTES,
  buildOperationalRequestSlaSnapshot,
  evaluateOperationalRequestSla,
  getOperationalRequestAgeMinutes,
  normalizeOperationalRequestSlaPolicy,
} from "../../lib/server/operational-request-sla.mjs";

const CREATED = "2026-09-10T10:00:00.000Z";

function at(minutes) {
  return new Date(Date.parse(CREATED) + minutes * 60_000);
}

test("OA3 keeps the existing 10-minute first-response rule as the deterministic default", () => {
  assert.equal(DEFAULT_OPERATIONAL_FIRST_RESPONSE_SLA_MINUTES, 10);
  assert.equal(getOperationalRequestAgeMinutes(CREATED, at(9)), 9);

  const pending = evaluateOperationalRequestSla({
    status: "new",
    createdAtIso: CREATED,
    now: at(9),
  });
  assert.equal(pending.state, "pending");
  assert.equal(pending.breached, false);
  assert.equal(pending.escalationRequired, false);

  const breached = evaluateOperationalRequestSla({
    status: "new",
    createdAtIso: CREATED,
    now: at(10),
  });
  assert.equal(breached.state, "breached");
  assert.equal(breached.breached, true);
  assert.equal(breached.escalationRequired, true);
  assert.equal(breached.firstResponseMinutes, 10);
});

test("OA3 snapshots hotel RequestDef SLA policy and does not invent escalation recipients", () => {
  const snapshot = buildOperationalRequestSlaSnapshot({
    requestDef: {
      id: "SpaVIP",
      slaMinutes: 4,
      escalationDepartments: ["reception", "manager", "reception", "  "],
    },
  });

  assert.deepEqual(snapshot, {
    version: 1,
    firstResponseMinutes: 4,
    escalationDepartments: ["reception", "manager"],
    sourceRequestDef: "SpaVIP",
    source: "request_def",
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.escalationDepartments), true);

  const defaultSnapshot = buildOperationalRequestSlaSnapshot({
    requestDef: { id: "towels" },
  });
  assert.equal(defaultSnapshot.firstResponseMinutes, 10);
  assert.deepEqual(defaultSnapshot.escalationDepartments, []);
  assert.equal(defaultSnapshot.source, "platform_default");
});

test("OA3 normalizes malformed SLA policy fail-safe without creating invalid deadlines", () => {
  for (const invalid of [0, -1, "", "nope", Number.NaN, Number.POSITIVE_INFINITY]) {
    const policy = normalizeOperationalRequestSlaPolicy({
      firstResponseMinutes: invalid,
      escalationDepartments: "manager",
    });
    assert.equal(policy.firstResponseMinutes, 10);
    assert.deepEqual(policy.escalationDepartments, []);
  }

  const bounded = normalizeOperationalRequestSlaPolicy({
    firstResponseMinutes: 999999,
  });
  assert.equal(bounded.firstResponseMinutes, 10080);
});

test("OA3 preserves late first-response evidence after a request leaves NEW", () => {
  const policy = { firstResponseMinutes: 10 };
  const acknowledged = evaluateOperationalRequestSla({
    status: "in_progress",
    createdAtIso: CREATED,
    startedAtIso: at(12).toISOString(),
    now: at(20),
    policy,
  });
  assert.equal(acknowledged.state, "acknowledged_after_breach");
  assert.equal(acknowledged.breached, true);
  assert.equal(acknowledged.escalationRequired, false);
  assert.equal(acknowledged.firstResponseDelayMinutes, 12);

  const closed = evaluateOperationalRequestSla({
    status: "completed",
    createdAtIso: CREATED,
    resolvedAtIso: at(15).toISOString(),
    now: at(20),
    policy,
  });
  assert.equal(closed.state, "closed_after_breach");
  assert.equal(closed.breached, true);
  assert.equal(closed.escalationRequired, false);
});

test("OA3 treats RETURNED as attention-required without fabricating an escalation target", () => {
  const evidence = evaluateOperationalRequestSla({
    status: "returned",
    createdAtIso: CREATED,
    now: at(3),
  });
  assert.equal(evidence.state, "attention_required");
  assert.equal(evidence.requiresAttention, true);
  assert.equal(evidence.escalationRequired, false);
  assert.deepEqual(evidence.escalationDepartments, []);
});

test("OA3 fails closed on invalid timestamps", () => {
  const evidence = evaluateOperationalRequestSla({
    status: "new",
    createdAtIso: "not-a-date",
    now: at(20),
  });
  assert.equal(evidence.state, "invalid_timestamp");
  assert.equal(evidence.breached, false);
  assert.equal(evidence.escalationRequired, false);
  assert.equal(evidence.deadlineAtIso, null);
});

test("OA3 SLA evaluator is pure and has no operational write authority", async () => {
  const source = await readFile(
    new URL("../../lib/server/operational-request-sla.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /supabase|\.insert\(|\.update\(|\.delete\(|\.rpc\(|fetch\(|sendStaffPush|sendManagerPush/i,
  );
});
