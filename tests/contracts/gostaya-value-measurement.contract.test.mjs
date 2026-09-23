import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGostayaValueMeasurement,
  normalizeGostayaValueBaseline,
} from "../../lib/value/gostaya-value-measurement.mjs";

function baseline(overrides = {}) {
  return {
    schemaVersion: "gostaya-value-baseline-v1",
    revision: 1,
    currency: "EUR",
    baselinePeriod: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    },
    source: {
      type: "mixed",
      reference: "Hotel time study + finance report",
      notes: "Pre-Go-Live baseline",
    },
    assumptions: {
      receptionMinutesPerGuestRequest: 4,
      receptionInfoMinutesPerQuestion: 3,
      coordinationMinutesPerDirectDepartmentRequest: 2,
      baselineDirectDepartmentRoutingRate: 0.25,
      baselineInfoSelfServiceRate: 0.2,
      serviceRecoveryResolutionMinutes: 60,
      laborCostMinorPerHour: {
        reception: 1800,
        coordination: 2400,
        serviceRecovery: 3000,
      },
      gostayaMonthlyCostMinor: 10000,
      gostayaOneTimeCostMinor: 0,
      oneTimeAmortizationMonths: 12,
    },
    ...overrides,
  };
}

test("Value baseline is hotel-specific, finite and independent from Go-Live until measurement", () => {
  const normalized = normalizeGostayaValueBaseline(baseline());

  assert.equal(normalized.schemaVersion, "gostaya-value-baseline-v1");
  assert.equal(normalized.currency, "EUR");
  assert.equal(normalized.assumptions.receptionMinutesPerGuestRequest, 4);
  assert.equal(normalized.assumptions.baselineDirectDepartmentRoutingRate, 0.25);
  assert.equal("goLiveAt" in normalized, false);
});

test("Value Engine keeps Measured Value separate from Estimated Value", () => {
  const measurement = buildGostayaValueMeasurement({
    baseline: baseline(),
    goLiveAt: "2026-09-01T00:00:00.000Z",
    period: {
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-17T00:00:00.000Z",
    },
    requests: [
      {
        id: "r1",
        created_at: "2026-09-11T09:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "housekeeping" },
      },
      {
        id: "r2",
        created_at: "2026-09-11T10:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "maintenance" },
      },
      {
        id: "r3",
        created_at: "2026-09-11T11:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "restaurant" },
      },
      {
        id: "r4",
        created_at: "2026-09-11T12:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "reception" },
      },
    ],
    events: [
      {
        id: "q1",
        event_name: "ai_question_sent",
        created_at: "2026-09-12T09:00:00.000Z",
        is_test: false,
        extra: { aiInteractionId: "ai-1" },
      },
      {
        id: "a1",
        event_name: "ai_answer_shown",
        created_at: "2026-09-12T09:00:01.000Z",
        is_test: false,
        extra: {
          aiInteractionId: "ai-1",
          aiIntent: "hotel_info",
          aiOperationalActionStatus: "not_applicable",
        },
      },
      {
        id: "q2",
        event_name: "ai_question_sent",
        created_at: "2026-09-12T10:00:00.000Z",
        is_test: false,
        extra: { aiInteractionId: "ai-2" },
      },
      {
        id: "a2",
        event_name: "ai_answer_shown",
        created_at: "2026-09-12T10:00:01.000Z",
        is_test: false,
        extra: {
          aiInteractionId: "ai-2",
          aiIntent: "request_extra_towels",
          aiOperationalActionStatus: "confirmation_required",
        },
      },
      {
        id: "ret1",
        request_id: "r4",
        event_name: "request_returned",
        created_at: "2026-09-13T10:00:00.000Z",
        is_test: false,
        extra: { requestId: "r4" },
      },
      {
        id: "done1",
        request_id: "r4",
        event_name: "request_completed",
        created_at: "2026-09-13T10:30:00.000Z",
        is_test: false,
        extra: { requestId: "r4" },
      },
    ],
    revenueSnapshot: {
      moneyMinorByCurrency: {
        trackedRevenue: { EUR: 5000 },
      },
    },
  });

  assert.equal(measurement.measuredOperationalImpact.guestRequests, 4);
  assert.equal(measurement.measuredOperationalImpact.directDepartmentRequests, 3);
  assert.equal(measurement.measuredOperationalImpact.aiContainedInteractions, 1);
  assert.equal(measurement.measuredOperationalImpact.recoveredServiceIncidents, 1);

  assert.equal(
    measurement.estimatedOperationalImpact.attributableReceptionBypassRequests,
    2,
  );
  assert.equal(
    measurement.estimatedOperationalImpact.receptionBypassMinutesSaved,
    8,
  );
  assert.equal(
    measurement.estimatedOperationalImpact.coordinationMinutesSaved,
    4,
  );
  assert.equal(
    measurement.estimatedOperationalImpact.aiContainmentMinutesSaved,
    2.4,
  );
  assert.equal(
    measurement.estimatedOperationalImpact.serviceRecoveryMinutesSaved,
    30,
  );

  assert.equal(measurement.valueMinor.measured.ancillaryRevenue, 5000);
  assert.equal(measurement.valueMinor.measured.total, 5000);
  assert.equal(measurement.valueMinor.estimated.receptionBypass, 240);
  assert.equal(measurement.valueMinor.estimated.avoidedCoordination, 160);
  assert.equal(measurement.valueMinor.estimated.aiContainment, 72);
  assert.equal(measurement.valueMinor.estimated.serviceRecovery, 1500);
  assert.equal(measurement.valueMinor.estimated.total, 1972);
  assert.equal(measurement.valueMinor.combined, 6972);
  assert.notEqual(
    measurement.valueMinor.measured.total,
    measurement.valueMinor.combined,
  );
});

test("legacy AI answers without interaction lineage are not counted as measured containment", () => {
  const measurement = buildGostayaValueMeasurement({
    baseline: baseline(),
    goLiveAt: "2026-09-01T00:00:00.000Z",
    period: {
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-17T00:00:00.000Z",
    },
    requests: [],
    events: [
      {
        event_name: "ai_question_sent",
        created_at: "2026-09-12T09:00:00.000Z",
        is_test: false,
        extra: {},
      },
      {
        event_name: "ai_answer_shown",
        created_at: "2026-09-12T09:00:01.000Z",
        is_test: false,
        extra: {
          aiIntent: "hotel_info",
          aiOperationalActionStatus: "not_applicable",
        },
      },
    ],
    revenueSnapshot: {
      moneyMinorByCurrency: { trackedRevenue: {} },
    },
  });

  assert.equal(measurement.measuredOperationalImpact.aiContainedInteractions, 0);
  assert.equal(measurement.measuredOperationalImpact.aiLegacyUnscoredAnswers, 1);
  assert.equal(measurement.valueMinor.estimated.aiContainment, 0);
});

test("Estimated Value can be negative when post-Go-Live performance is worse than baseline", () => {
  const measurement = buildGostayaValueMeasurement({
    baseline: baseline({
      assumptions: {
        ...baseline().assumptions,
        baselineDirectDepartmentRoutingRate: 0.75,
        serviceRecoveryResolutionMinutes: 30,
      },
    }),
    goLiveAt: "2026-09-01T00:00:00.000Z",
    period: {
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-17T00:00:00.000Z",
    },
    requests: [
      {
        id: "r1",
        created_at: "2026-09-11T09:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "reception" },
      },
      {
        id: "r2",
        created_at: "2026-09-11T10:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "reception" },
      },
      {
        id: "r3",
        created_at: "2026-09-11T11:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "housekeeping" },
      },
      {
        id: "r4",
        created_at: "2026-09-11T12:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "reception" },
      },
    ],
    events: [
      {
        request_id: "r4",
        event_name: "request_returned",
        created_at: "2026-09-13T10:00:00.000Z",
        is_test: false,
        extra: { requestId: "r4" },
      },
      {
        request_id: "r4",
        event_name: "request_completed",
        created_at: "2026-09-13T11:30:00.000Z",
        is_test: false,
        extra: { requestId: "r4" },
      },
    ],
    revenueSnapshot: {
      moneyMinorByCurrency: { trackedRevenue: {} },
    },
  });

  assert.ok(measurement.valueMinor.estimated.total < 0);
  assert.ok(
    measurement.estimatedOperationalImpact.staffTimeSavedMinutes < 0,
  );
});

test("Value Engine uses actual Go-Live and rejects baseline periods that extend past it", () => {
  assert.throws(
    () =>
      buildGostayaValueMeasurement({
        baseline: baseline({
          baselinePeriod: {
            from: "2026-08-01T00:00:00.000Z",
            to: "2026-09-02T00:00:00.000Z",
          },
        }),
        goLiveAt: "2026-09-01T00:00:00.000Z",
        period: {
          from: "2026-09-02T00:00:00.000Z",
          to: "2026-09-03T00:00:00.000Z",
        },
        requests: [],
        events: [],
        revenueSnapshot: {
          moneyMinorByCurrency: { trackedRevenue: {} },
        },
      }),
    /VALUE_BASELINE_MUST_PRECEDE_GOLIVE/,
  );
});

test("Value Engine never converts foreign-currency revenue without FX authority", () => {
  const measurement = buildGostayaValueMeasurement({
    baseline: baseline(),
    goLiveAt: "2026-09-01T00:00:00.000Z",
    period: {
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-17T00:00:00.000Z",
    },
    requests: [],
    events: [],
    revenueSnapshot: {
      moneyMinorByCurrency: {
        trackedRevenue: { EUR: 1000, USD: 5000 },
      },
    },
  });

  assert.equal(measurement.valueMinor.measured.total, 1000);
  assert.deepEqual(measurement.valueMinor.excludedRevenueCurrencies, ["USD"]);
});

test("Baseline authority is Platform Admin-only, CAS protected and immutable after Go-Live", () => {
  const server = readFileSync(
    new URL("../../lib/server/gostaya-value-baseline.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/control-plane/value-baseline/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /canMutateControlPlane\(input\.authority\.role\)/);
  assert.match(server, /factory_production_live_activation_runs/);
  assert.match(server, /VALUE_BASELINE_LOCKED_AFTER_GOLIVE/);
  assert.match(server, /capturedAfterGoLive: Boolean\(input\.goLiveAt\)/);
  assert.match(server, /VALUE_BASELINE_REVISION_CONFLICT/);
  assert.match(server, /\.eq\("updated_at", currentRow\.updated_at\)/);
  assert.match(server, /logControlPlaneAudit/);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/);
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
  assert.doesNotMatch(route, /body\.hotelId/);
});

test("Manager Value runtime requires Manager Intelligence and Revenue entitlements", () => {
  const server = readFileSync(
    new URL("../../lib/server/gostaya-value-measurement.ts", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL(
      "../../app/staff/[hotelSlug]/manager/value/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const card = readFileSync(
    new URL("../../components/staff/GostayaValueAccessCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(server, /getCurrentStaffSession\(hotelSlug, "manager"\)/);
  assert.match(server, /"manager_intelligence"/);
  assert.match(server, /"revenue_intelligence"/);
  assert.match(server, /getHotelActualGoLiveAt/);
  assert.match(server, /getHotelGostayaValueBaseline/);
  assert.match(server, /getAncillaryRevenueManagerSnapshot/);
  assert.match(server, /VALUE_REQUEST_CAP_EXCEEDED/);
  assert.match(server, /VALUE_EVENT_CAP_EXCEEDED/);
  assert.match(page, /requireStaffAccess\(hotelSlug, "manager"\)/);
  assert.match(card, /managerIntelligence/);
  assert.match(card, /revenueIntelligence/);
});

test("AI analytics emits durable interaction lineage and request persistence keeps it", () => {
  const guestHub = readFileSync(
    new URL("../../components/GuestHub.tsx", import.meta.url),
    "utf8",
  );
  const validation = readFileSync(
    new URL(
      "../../lib/server/guest-request-input-validation.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const requestCreate = readFileSync(
    new URL("../../app/api/guest/request-create/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(guestHub, /crypto\.randomUUID/);
  assert.match(guestHub, /aiInteractionId/);
  assert.match(guestHub, /aiOperationalActionStatus/);
  assert.match(validation, /aiInteractionId/);
  assert.match(requestCreate, /aiInteractionId: aiInteractionId \|\| null/);
});

test("Manager dashboard visibly separates Measured, Estimated and future benchmarks", () => {
  const dashboard = readFileSync(
    new URL(
      "../../components/staff/value/GostayaValueDashboard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(dashboard, /Measured Value/);
  assert.match(dashboard, /Estimated Value/);
  assert.match(dashboard, /Combined ROI/);
  assert.match(dashboard, /Reception Bypass/);
  assert.match(dashboard, /AI Containment/);
  assert.match(dashboard, /Direct Department Routing/);
  assert.match(dashboard, /Avoided Coordination/);
  assert.match(dashboard, /Staff Time Saved/);
  assert.match(dashboard, /Service Recovery/);
  assert.match(dashboard, /Industry Benchmarks/);
  assert.match(dashboard, /anonymized cohort/i);
});


test("Staff-originated operational requests cannot inflate Reception Bypass or Direct Routing value", () => {
  const measurement = buildGostayaValueMeasurement({
    baseline: baseline(),
    goLiveAt: "2026-09-01T00:00:00.000Z",
    period: {
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-17T00:00:00.000Z",
    },
    requests: [
      {
        id: "guest-request",
        created_at: "2026-09-11T09:00:00.000Z",
        is_test: false,
        source: "guest_hub",
        channel: "pwa",
        metadata_json: { department: "housekeeping" },
      },
      {
        id: "staff-request",
        created_at: "2026-09-11T10:00:00.000Z",
        is_test: false,
        source: "staff_hub",
        channel: "staff",
        metadata_json: { department: "maintenance" },
      },
    ],
    events: [],
    revenueSnapshot: {
      moneyMinorByCurrency: { trackedRevenue: {} },
    },
  });

  assert.equal(measurement.measuredOperationalImpact.guestRequests, 1);
  assert.equal(
    measurement.measuredOperationalImpact.directDepartmentRequests,
    1,
  );
});
