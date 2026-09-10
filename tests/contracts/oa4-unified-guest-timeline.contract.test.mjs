import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildUnifiedGuestTimeline,
  UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS,
} from "../../lib/server/unified-guest-timeline.mjs";

const stay = {
  id: "StayVIP",
  room_number: "103",
  lifecycle_state: "active",
  check_in_at: "2026-09-10T08:00:00.000Z",
  created_at: "2026-09-10T07:59:00.000Z",
  check_in_date: "2026-09-10",
  check_out_date: "2026-09-14",
};

test("OA4 projects a deterministic chronological timeline from canonical stay evidence", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay,
    requests: [{
      id: "ReqVIP",
      request_type: "housekeeping",
      created_at: "2026-09-10T08:10:00.000Z",
      started_at: "2026-09-10T08:15:00.000Z",
      resolved_at: "2026-09-10T08:22:00.000Z",
      metadata_json: { sourceRequestDef: "ExtraTowel", department: "housekeeping" },
    }],
  });

  assert.equal(timeline.stayId, "StayVIP");
  assert.deepEqual(timeline.items.map((item) => item.eventType), [
    "stay_started",
    "request_created",
    "request_in_progress",
    "request_completed",
  ]);
  assert.equal(timeline.firstActivityAt, "2026-09-10T08:00:00.000Z");
  assert.equal(timeline.lastActivityAt, "2026-09-10T08:22:00.000Z");
});

test("OA4 preserves opaque canonical identifiers exactly", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay,
    requests: [{
      id: "ReqVIP",
      request_type: "service",
      created_at: "2026-09-10T08:10:00.000Z",
      metadata_json: { sourceRequestDef: "SpaVIP" },
    }],
  });
  const created = timeline.items.find((item) => item.eventType === "request_created");
  assert.equal(created?.requestId, "ReqVIP");
  assert.equal(created?.metadata.sourceRequestDef, "SpaVIP");
});

test("OA4 whitelists meaningful lifecycle evidence and excludes clickstream noise", () => {
  assert.ok(UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS.includes("room_confirmed"));
  assert.ok(UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS.includes("ai_action_clicked"));
  assert.ok(!UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS.includes("section_opened"));
  assert.ok(!UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS.includes("button_clicked"));

  const timeline = buildUnifiedGuestTimeline({
    stay,
    hubEvents: [
      { id: "e1", event_name: "section_opened", created_at: "2026-09-10T08:01:00.000Z", value: "SPA" },
      { id: "e2", event_name: "room_confirmed", created_at: "2026-09-10T08:02:00.000Z", value: "103" },
      { id: "e3", event_name: "ai_question_sent", created_at: "2026-09-10T08:03:00.000Z", value: "private raw question" },
    ],
  });

  assert.deepEqual(timeline.items.map((item) => item.eventType), ["stay_started", "room_confirmed", "ai_question_sent"]);
  assert.ok(!JSON.stringify(timeline).includes("private raw question"));
  assert.ok(!JSON.stringify(timeline).includes("SPA"));
});

test("OA4 keeps free-text communication and survey bodies outside the timeline read model", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay,
    communications: [{
      id: "comm-1",
      audience_type: "direct_guest",
      sender_type: "guest",
      actor_role: "guest",
      category: "service_recovery",
      body: "private guest message",
      title: "private title",
      source_language: "de",
      status: "sent",
      created_at: "2026-09-10T09:00:00.000Z",
    }],
    surveys: [{
      id: "survey-1",
      survey_type: "day3",
      rating: 2,
      selected_categories: ["room", "staff"],
      improvement_text: "private improvement text",
      problem_text: "private problem text",
      resolution_status: "open",
      language: "de",
      guest_submitted_at: "2026-09-10T09:05:00.000Z",
    }],
  });
  const serialized = JSON.stringify(timeline);
  assert.ok(!serialized.includes("private guest message"));
  assert.ok(!serialized.includes("private title"));
  assert.ok(!serialized.includes("private improvement text"));
  assert.ok(!serialized.includes("private problem text"));
  assert.equal(timeline.items.find((item) => item.eventType === "survey_submitted")?.metadata.rating, 2);
});

test("OA4 captures direct communication direction without copying message content", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay,
    communications: [
      { id: "c1", audience_type: "all_active_guests", sender_type: "staff", body: "broadcast", created_at: "2026-09-10T09:00:00.000Z" },
      { id: "c2", audience_type: "direct_guest", sender_type: "staff", actor_role: "reception", category: "direct", body: "secret", sent_at: "2026-09-10T09:01:00.000Z" },
    ],
  });
  const direct = timeline.items.find((item) => item.communicationId === "c2");
  assert.equal(direct?.actorType, "staff");
  assert.equal(direct?.actorRole, "reception");
  assert.ok(!timeline.items.some((item) => item.communicationId === "c1"));
  assert.ok(!JSON.stringify(timeline).includes("secret"));
});

test("OA4 captures survey and massage evidence without duplicating operational authority", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay,
    surveys: [{ id: "s1", survey_type: "day3", rating: 5, guest_submitted_at: "2026-09-10T09:10:00.000Z" }],
    massageBookings: [{
      id: "m1",
      service_id: "relax-60",
      resource_key: "room-a",
      status: "confirmed",
      price: "80",
      currency: "EUR",
      starts_at: "2026-09-11T10:00:00.000Z",
      duration_minutes: 60,
      created_at: "2026-09-10T09:15:00.000Z",
      cancel_reason: "private cancellation reason",
      cancelled_at: "2026-09-10T09:20:00.000Z",
    }],
  });
  assert.deepEqual(
    timeline.items.filter((item) => item.category === "booking").map((item) => item.eventType),
    ["massage_booking_created", "massage_booking_cancelled"],
  );
  assert.ok(!JSON.stringify(timeline).includes("private cancellation reason"));
});

test("OA4 retains returned and billing transition evidence from canonical event ledger", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay,
    hubEvents: [
      {
        id: "evt-return",
        event_name: "request_returned",
        created_at: "2026-09-10T10:00:00.000Z",
        extra: { requestId: "ReqVIP", role: "manager", previousStatus: "in_progress", nextStatus: "returned" },
      },
      {
        id: "evt-bill",
        event_name: "request_billing_waived",
        created_at: "2026-09-10T10:05:00.000Z",
        request_id: "ReqVIP",
        extra: { role: "reception" },
      },
    ],
  });
  const returned = timeline.items.find((item) => item.eventType === "request_returned");
  const billed = timeline.items.find((item) => item.eventType === "request_billing_waived");
  assert.equal(returned?.requestId, "ReqVIP");
  assert.equal(returned?.status, "returned");
  assert.equal(billed?.requestId, "ReqVIP");
  assert.equal(billed?.category, "billing");
});

test("OA4 skips malformed timestamps instead of fabricating chronology", () => {
  const timeline = buildUnifiedGuestTimeline({
    stay: { id: "stay", created_at: "not-a-date" },
    requests: [{ id: "r1", created_at: "bad" }],
    hubEvents: [{ id: "e1", event_name: "room_confirmed", created_at: "bad" }],
  });
  assert.equal(timeline.items.length, 0);
  assert.equal(timeline.firstActivityAt, null);
  assert.equal(timeline.lastActivityAt, null);
});

test("OA4 de-duplicates stable source evidence deterministically", () => {
  const row = { id: "e1", event_name: "room_confirmed", created_at: "2026-09-10T08:02:00.000Z" };
  const timeline = buildUnifiedGuestTimeline({ stay, hubEvents: [row, { ...row }] });
  assert.equal(timeline.items.filter((item) => item.sourceId === "e1").length, 1);
});

test("OA4 projector has no database or operational write authority", async () => {
  const source = await readFile(new URL("../../lib/server/unified-guest-timeline.mjs", import.meta.url), "utf8");
  assert.ok(!source.includes("supabaseAdmin"));
  assert.ok(!source.includes(".insert("));
  assert.ok(!source.includes(".update("));
  assert.ok(!source.includes(".delete("));
  assert.ok(!source.includes("fetch("));
});
