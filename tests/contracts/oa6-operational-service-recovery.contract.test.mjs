import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  answerFromGuestStayContext,
  detectGuestStayContextIntent,
} from "../../lib/ai/guest-stay-context.mjs";
import {
  buildGuestStayContext,
} from "../../lib/server/guest-stay-context.mjs";
import {
  buildOperationalServiceRecoveryState,
} from "../../lib/server/operational-service-recovery.mjs";

test("OA6 recovery state is deterministic and human-owned", () => {
  const recovery = buildOperationalServiceRecoveryState({
    attention: [
      {
        type: "sla_breach",
        requestId: "request-1",
        occurredAt: "2026-09-23T08:00:00.000Z",
        serviceKey: "extra_towels",
      },
      {
        type: "returned_request",
        requestId: "request-2",
        occurredAt: "2026-09-23T08:05:00.000Z",
        serviceKey: "maintenance",
      },
      {
        type: "critical_feedback",
        surveyId: "survey-1",
        occurredAt: "2026-09-23T08:10:00.000Z",
        rating: 2,
        resolutionStatus: "unresolved",
      },
    ],
  });

  assert.equal(recovery.status, "human_followup_required");
  assert.equal(recovery.needsHumanFollowup, true);
  assert.equal(recovery.signalCount, 3);
  assert.deepEqual(recovery.byType, {
    slaBreach: 1,
    returnedRequest: 1,
    criticalFeedback: 1,
  });
  assert.equal(recovery.decisionAuthority, "human_hotel_staff");
  assert.equal(recovery.aiRole, "explain_verified_status_only");
  assert.equal(recovery.automaticGuestCommunication, false);
  assert.equal(recovery.automaticCompensation, false);
  assert.equal(recovery.automaticResolution, false);
});

test("OA6 ignores unknown or invalid recovery signals and deduplicates canonical sources", () => {
  const recovery = buildOperationalServiceRecoveryState({
    attention: [
      { type: "unknown", requestId: "request-1" },
      { type: "sla_breach", requestId: "" },
      {
        type: "returned_request",
        requestId: "request-2",
        occurredAt: "2026-09-23T08:05:00.000Z",
      },
      {
        type: "returned_request",
        requestId: "request-2",
        occurredAt: "2026-09-23T08:06:00.000Z",
      },
    ],
  });

  assert.equal(recovery.signalCount, 1);
  assert.equal(recovery.signals[0].signalId, "returned_request:request-2");
});

test("OA5 current-stay evidence projects OA6 recovery without free-text authority", () => {
  const context = buildGuestStayContext({
    now: new Date("2026-09-23T09:00:00.000Z"),
    stay: {
      id: "stay-1",
      roomNumber: "101",
      lifecycleState: "active",
    },
    timeline: {
      items: [
        {
          eventType: "request_created",
          requestId: "request-1",
          occurredAt: "2026-09-23T07:00:00.000Z",
          label: "extra_towels",
          metadata: {
            sourceRequestDef: "extra_towels",
            requestType: "extra_towels",
            slaMinutes: 30,
          },
        },
        {
          eventType: "request_returned",
          requestId: "request-2",
          occurredAt: "2026-09-23T08:00:00.000Z",
          label: "maintenance",
          metadata: {
            sourceRequestDef: "maintenance",
            requestType: "maintenance",
          },
        },
        {
          eventType: "survey_submitted",
          surveyId: "survey-1",
          occurredAt: "2026-09-23T08:30:00.000Z",
          status: "unresolved",
          metadata: {
            rating: 2,
            selectedCategories: ["service"],
          },
        },
      ],
    },
  });

  assert.equal(context.serviceRecovery.needsHumanFollowup, true);
  assert.equal(context.serviceRecovery.signalCount, 3);
  assert.equal(context.privacy.freeTextIncluded, false);
  assert.equal(context.privacy.crossStayProfile, false);
});

test("OA6 guest answer is based only on verified recovery aggregate and makes no hotel promise", () => {
  const intent = detectGuestStayContextIntent(
    "Решен ли е проблемът ми или трябва още някой да реагира?",
  );
  assert.equal(intent, "stay_context_service_recovery");

  const result = answerFromGuestStayContext({
    intent,
    lang: "bg",
    stayContext: {
      scope: "current_stay",
      stay: {},
      requests: {},
      bookings: {},
      observedServiceUsage: [],
      serviceRecovery: {
        status: "human_followup_required",
        needsHumanFollowup: true,
        signalCount: 2,
      },
    },
  });

  assert.ok(result);
  assert.equal(result.intent, "stay_context_service_recovery");
  assert.equal(result.guestSafeContext.serviceRecovery.signalCount, 2);
  assert.match(result.answer, /изискват внимание/);
  assert.match(result.answer, /Не мога да обещая компенсация/);
});

test("OA6 remains read-only across service recovery model and UI integration", () => {
  const model = readFileSync(
    new URL("../../lib/server/operational-service-recovery.mjs", import.meta.url),
    "utf8",
  );
  const ai = readFileSync(
    new URL("../../lib/ai/guest-stay-context.mjs", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/ai/route.ts", import.meta.url),
    "utf8",
  );
  const timeline = readFileSync(
    new URL(
      "../../components/staff/guest-timeline/GuestTimelineProvider.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(model, /supabase|fetch\(|send|insert|update|delete|rpc\(/i);
  assert.doesNotMatch(model, /compensation.*true/i);
  assert.match(model, /automaticGuestCommunication: false/);
  assert.match(model, /automaticCompensation: false/);
  assert.match(model, /automaticResolution: false/);
  assert.match(ai, /stay_context_service_recovery/);
  assert.match(route, /requireGuestStayReadAccess/);
  assert.match(timeline, /OA4\/OA5\/OA6/);
  assert.match(timeline, /serviceRecovery\.needsHumanFollowup/);
});
