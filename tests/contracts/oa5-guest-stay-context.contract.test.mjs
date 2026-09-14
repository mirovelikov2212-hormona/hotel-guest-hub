import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildGuestStayContext } from "../../lib/server/guest-stay-context.mjs";
import { buildUnifiedGuestTimeline } from "../../lib/server/unified-guest-timeline.mjs";

const staySnapshot = {
  id: "StayVIP",
  roomNumber: "412",
  lifecycleState: "active",
  status: "active",
  checkInDate: "2026-09-10",
  checkOutDate: "2026-09-14",
  effectiveCheckOutAt: "2026-09-14T09:00:00.000Z",
  lastSeenAt: "2026-09-10T12:00:00.000Z",
  isTest: false,
};

function contextFrom(input, now = "2026-09-10T12:30:00.000Z") {
  const timeline = buildUnifiedGuestTimeline({
    stay: {
      id: staySnapshot.id,
      room_number: staySnapshot.roomNumber,
      lifecycle_state: staySnapshot.lifecycleState,
      check_in_date: staySnapshot.checkInDate,
      check_out_date: staySnapshot.checkOutDate,
      check_in_at: "2026-09-10T08:00:00.000Z",
    },
    ...input,
  });

  return buildGuestStayContext({ stay: staySnapshot, timeline, now });
}

test("OA5 stays explicitly scoped to the current stay and carries no personal identity profile", () => {
  const context = contextFrom({});
  assert.equal(context.version, 1);
  assert.equal(context.scope, "current_stay");
  assert.equal(context.stay.id, "StayVIP");
  assert.equal(context.stay.roomNumber, "412");
  assert.deepEqual(context.privacy, {
    personalIdentityStored: false,
    crossStayProfile: false,
    freeTextIncluded: false,
  });
  assert.deepEqual(context.preferences, {
    scope: "current_stay",
    explicit: [],
    inferred: false,
  });
});

test("OA5 derives request state and active SLA breach from OA3 authority", () => {
  const context = contextFrom({
    requests: [
      {
        id: "req-new",
        request_type: "housekeeping",
        created_at: "2026-09-10T12:00:00.000Z",
        metadata_json: {
          sourceRequestDef: "ExtraTowel",
          operationalSla: { firstResponseMinutes: 10 },
        },
      },
      {
        id: "req-done",
        request_type: "maintenance",
        created_at: "2026-09-10T08:10:00.000Z",
        started_at: "2026-09-10T08:15:00.000Z",
        resolved_at: "2026-09-10T08:30:00.000Z",
        metadata_json: {
          sourceRequestDef: "AirConditioning",
          operationalSla: { firstResponseMinutes: 10 },
        },
      },
    ],
  });

  assert.deepEqual(context.requests, {
    total: 2,
    active: 1,
    completed: 1,
    returned: 0,
    firstResponseBreaches: 1,
    activeSlaBreaches: 1,
  });
  assert.ok(context.attention.some((item) => item.type === "sla_breach" && item.requestId === "req-new"));
});

test("OA5 treats returned requests as active attention without inventing escalation", () => {
  const context = contextFrom({
    requests: [
      {
        id: "req-return",
        request_type: "maintenance",
        created_at: "2026-09-10T11:50:00.000Z",
        started_at: "2026-09-10T11:55:00.000Z",
        metadata_json: {
          sourceRequestDef: "TvIssue",
          operationalSla: { firstResponseMinutes: 10 },
        },
      },
    ],
    hubEvents: [
      {
        id: "evt-return",
        event_name: "returned_to_pending",
        request_id: "req-return",
        created_at: "2026-09-10T12:10:00.000Z",
        extra: { requestId: "req-return", previousStatus: "in_progress", nextStatus: "returned" },
      },
    ],
  });

  assert.equal(context.requests.active, 1);
  assert.equal(context.requests.returned, 1);
  assert.equal(context.requests.activeSlaBreaches, 0);
  assert.ok(context.attention.some((item) => item.type === "returned_request" && item.requestId === "req-return"));
});

test("OA5 counts observed service usage as evidence, not as inferred preference", () => {
  const context = contextFrom({
    requests: [
      { id: "r1", request_type: "housekeeping", created_at: "2026-09-10T08:10:00.000Z", metadata_json: { sourceRequestDef: "ExtraTowel" } },
      { id: "r2", request_type: "housekeeping", created_at: "2026-09-10T09:10:00.000Z", metadata_json: { sourceRequestDef: "ExtraTowel" } },
      { id: "r3", request_type: "reception", created_at: "2026-09-10T10:10:00.000Z", metadata_json: { sourceRequestDef: "LateCheckout" } },
    ],
  });

  assert.deepEqual(context.observedServiceUsage, [
    { serviceKey: "ExtraTowel", count: 2 },
    { serviceKey: "LateCheckout", count: 1 },
  ]);
  assert.equal(context.preferences.inferred, false);
  assert.deepEqual(context.preferences.explicit, []);
});

test("OA5 preserves communication direction and latest observed language without message bodies", () => {
  const context = contextFrom({
    communications: [
      {
        id: "c1",
        audience_type: "direct_guest",
        sender_type: "guest",
        actor_role: "guest",
        source_language: "de",
        body: "private guest body",
        created_at: "2026-09-10T09:00:00.000Z",
      },
      {
        id: "c2",
        audience_type: "direct_guest",
        sender_type: "staff",
        actor_role: "reception",
        source_language: "bg",
        body: "private staff body",
        created_at: "2026-09-10T10:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(context.communications, {
    total: 2,
    fromGuest: 1,
    fromStaff: 1,
    lastActivityAt: "2026-09-10T10:00:00.000Z",
  });
  assert.equal(context.observedLanguage, "bg");
  assert.ok(!JSON.stringify(context).includes("private guest body"));
  assert.ok(!JSON.stringify(context).includes("private staff body"));
});

test("OA5 keeps critical and partially resolved survey feedback visible until fully resolved", () => {
  const partial = contextFrom({
    surveys: [
      {
        id: "s1",
        survey_type: "day3",
        rating: 2,
        selected_categories: ["room", "staff"],
        resolution_status: "partially_resolved",
        language: "de",
        guest_submitted_at: "2026-09-10T10:30:00.000Z",
      },
    ],
  });
  assert.equal(partial.feedback.needsAttention, true);
  assert.equal(partial.feedback.latestRating, 2);
  assert.ok(partial.attention.some((item) => item.type === "critical_feedback"));

  const resolved = contextFrom({
    surveys: [
      {
        id: "s2",
        survey_type: "day3",
        rating: 2,
        selected_categories: ["room"],
        resolution_status: "fully_resolved",
        language: "de",
        guest_submitted_at: "2026-09-10T10:35:00.000Z",
      },
    ],
  });
  assert.equal(resolved.feedback.needsAttention, false);
  assert.ok(!resolved.attention.some((item) => item.type === "critical_feedback"));
});

test("OA5 does not coerce missing ratings into zero", () => {
  const context = contextFrom({
    surveys: [
      {
        id: "s-null",
        survey_type: "day3",
        rating: null,
        resolution_status: null,
        guest_submitted_at: "2026-09-10T10:40:00.000Z",
      },
    ],
  });
  assert.equal(context.feedback.latestRating, null);
  assert.equal(context.feedback.averageRating, null);
  assert.equal(context.feedback.needsAttention, false);
});

test("OA5 derives booking facts from OA4 booking evidence", () => {
  const context = contextFrom({
    massageBookings: [
      {
        id: "m-upcoming",
        service_id: "relax-60",
        starts_at: "2026-09-11T10:00:00.000Z",
        status: "confirmed",
        created_at: "2026-09-10T09:15:00.000Z",
      },
      {
        id: "m-cancelled",
        service_id: "classic-30",
        starts_at: "2026-09-11T12:00:00.000Z",
        status: "cancelled",
        created_at: "2026-09-10T09:20:00.000Z",
        cancelled_at: "2026-09-10T09:25:00.000Z",
      },
    ],
  });
  assert.deepEqual(context.bookings, {
    total: 2,
    active: 1,
    cancelled: 1,
    upcoming: 1,
  });
});

test("OA5 projector remains pure with no DB, network or model authority", async () => {
  const source = await readFile(new URL("../../lib/server/guest-stay-context.mjs", import.meta.url), "utf8");
  assert.ok(!source.includes("supabaseAdmin"));
  assert.ok(!source.includes("fetch("));
  assert.ok(!source.includes("OpenAI"));
  assert.ok(!source.includes(".insert("));
  assert.ok(!source.includes(".update("));
  assert.ok(!source.includes(".delete("));
  assert.ok(source.includes("evaluateOperationalRequestSla"));
});
