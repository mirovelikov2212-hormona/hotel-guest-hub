import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecommendationCandidates,
  buildManagerIntelligenceKpis,
  detectAiIntentConversionPattern,
  detectDelayedRequestPattern,
  measureRecommendationImpact,
} from "../../lib/manager-intelligence/action-loop.mjs";
import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const BEFORE_FROM = "2026-09-01T00:00:00.000Z";
const BEFORE_TO = "2026-09-08T00:00:00.000Z";
const AFTER_FROM = "2026-09-08T00:00:00.000Z";
const AFTER_TO = "2026-09-15T00:00:00.000Z";

function request({
  id,
  createdAt,
  department = "housekeeping",
  status = "completed",
  aiInteractionId = null,
  billingStatus = null,
  price = null,
  currency = "EUR",
}) {
  return {
    id,
    created_at: createdAt,
    started_at: null,
    resolved_at: status === "completed" ? createdAt : null,
    status,
    is_test: false,
    source: "guest_hub",
    channel: "pwa",
    metadata_json: {
      department,
      ...(aiInteractionId ? { aiInteractionId } : {}),
      ...(billingStatus ? { billingStatus } : {}),
      ...(price !== null ? { price } : {}),
      ...(currency ? { currency } : {}),
    },
  };
}

function seenEvent(id, createdAt) {
  return {
    id: `seen-${id}`,
    event_name: "request_seen_by_staff",
    request_id: id,
    created_at: createdAt,
    is_test: false,
    extra: { requestId: id },
  };
}

function delayedPatternFixture() {
  const requests = [];
  const events = [];

  for (let index = 0; index < 8; index += 1) {
    const day = String(index + 1).padStart(2, "0");
    const id = `hk-delay-${index}`;
    requests.push(request({
      id,
      createdAt: `2026-09-${day}T16:10:00.000Z`,
    }));
    events.push(seenEvent(id, `2026-09-${day}T16:30:00.000Z`));
  }

  for (let index = 0; index < 3; index += 1) {
    const id = `hk-ok-${index}`;
    requests.push(request({
      id,
      createdAt: `2026-09-0${index + 1}T10:10:00.000Z`,
    }));
    events.push(seenEvent(id, `2026-09-0${index + 1}T10:14:00.000Z`));
  }

  return { requests, events };
}

function afterDelayedFixture({ delayed = 1, total = 6 }) {
  const requests = [];
  const events = [];
  for (let index = 0; index < total; index += 1) {
    const id = `after-hk-${index}`;
    const day = String(8 + index).padStart(2, "0");
    requests.push(request({
      id,
      createdAt: `2026-09-${day}T16:10:00.000Z`,
    }));
    events.push(seenEvent(
      id,
      `2026-09-${day}T16:${index < delayed ? "30" : "14"}:00.000Z`,
    ));
  }
  return { requests, events };
}

function aiAnswer(interactionId, intent, createdAt) {
  return {
    id: `answer-${interactionId}`,
    event_name: "ai_answer_shown",
    created_at: createdAt,
    is_test: false,
    extra: {
      aiInteractionId: interactionId,
      aiIntent: intent,
      aiMatchedIds: ["service:massage"],
    },
  };
}

function aiFixture({
  fromDay = 1,
  questions = 6,
  conversions = 1,
  charged = 1,
  price = 40,
}) {
  const events = [];
  const requests = [];

  for (let index = 0; index < questions; index += 1) {
    const interactionId = `ai-${fromDay}-${index}`;
    const day = String(fromDay + index).padStart(2, "0");
    const createdAt = `2026-09-${day}T12:00:00.000Z`;
    events.push(aiAnswer(interactionId, "massage_booking", createdAt));

    if (index < conversions) {
      requests.push(request({
        id: `req-${interactionId}`,
        createdAt: `2026-09-${day}T12:05:00.000Z`,
        department: "reception",
        aiInteractionId: interactionId,
        billingStatus: index < charged ? "charged" : "pending",
        price,
        currency: "EUR",
      }));
    }
  }

  return { events, requests };
}

test("1. pattern detected: delayed Housekeeping concentration produces a structured recommendation", () => {
  const fixture = delayedPatternFixture();
  const recommendation = detectDelayedRequestPattern({
    ...fixture,
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
    timeZone: "UTC",
  });

  assert.ok(recommendation);
  assert.equal(recommendation.sourceType, "request_pattern");
  assert.equal(recommendation.department, "housekeeping");
  assert.equal(recommendation.evidence.pattern, "delayed_request_window");
  assert.equal(recommendation.baseline.basis, "measured");
  assert.equal(recommendation.actionPayload.safeConfigurationHandoff, "manager_change_workflow");
});

test("2. recommendation generated: candidate builder emits deterministic evidence-backed action", () => {
  const fixture = delayedPatternFixture();
  const first = buildRecommendationCandidates({
    ...fixture,
    systemEvents: [],
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
    timeZone: "UTC",
  });
  const second = buildRecommendationCandidates({
    ...fixture,
    systemEvents: [],
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
    timeZone: "UTC",
  });

  assert.ok(first.length >= 1);
  assert.equal(first[0].fingerprint, second[0].fingerprint);
  assert.ok(first[0].recommendation);
  assert.ok(first[0].expectedOutcome);
});

test("3. manager approves: approval is permission-scoped, persisted and audit-evented", async () => {
  const source = await readProjectFile("lib/server/manager-intelligence-actions.ts");

  assertContains(source, "resolveManagerIntelligenceScope(input.hotelSlug)");
  assertContains(source, 'const approved = decision === "approved"');
  assertContains(source, 'manager_decision: decision');
  assertContains(source, 'eventType: approved ? "approved" : "rejected"');
  assertContains(source, "decided_by_session_id: scope.sessionId");
});

test("4. action executed: approved configuration actions use the existing Manager Change workflow end-to-end", async () => {
  const actions = await readProjectFile("lib/server/manager-intelligence-actions.ts");
  const lifecycle = await readProjectFile("lib/server/manager-change-lifecycle.ts");
  const panel = await readProjectFile("components/staff/manager-intelligence/ManagerIntelligenceActionsPanel.tsx");

  assertContains(actions, 'handoff !== "manager_change_workflow"');
  assertContains(actions, "createManagerLifecycleDraft");
  assertContains(actions, "saveManagerLifecycleTypedDraft");
  assertContains(actions, "confirmManagerLifecycleDraft");
  assertContains(actions, "createManagerLifecycleCandidate");
  assertContains(actions, "certifyManagerLifecycleCandidate");
  assertContains(actions, "activateManagerLifecycleCandidate");
  assertContains(actions, '"manager_change_request"');
  assertContains(actions, 'status: "execution_pending"');
  assertContains(actions, 'execution_status: "pending"');
  assertContains(actions, "MANAGER_INTELLIGENCE_CONFIGURATION_EXECUTION_ALREADY_STARTED");
  assertContains(actions, "cancelManagerLifecycleDraft");
  assertContains(actions, 'execution_status: "failed"');
  assertContains(actions, "MANAGER_INTELLIGENCE_CONFIGURATION_ACTIVATION_NOT_LIVE");
  assertContains(lifecycle, "activateManagerChangeCandidate");
  assertContains(panel, '"manager_approved_configuration"');
  assertContains(panel, "executeConfig");
  assertContains(panel, "!row.executionReferenceId");
  assertContains(panel, "executionFailed");
  assertNotContains(actions, '.from("hotel_config_revisions").insert');
});

test("5. before/after measurement: same metric is re-measured after execution", () => {
  const beforeFixture = delayedPatternFixture();
  const recommendation = detectDelayedRequestPattern({
    ...beforeFixture,
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
    timeZone: "UTC",
  });
  const afterFixture = afterDelayedFixture({ delayed: 1, total: 6 });

  const impact = measureRecommendationImpact({
    recommendation,
    ...afterFixture,
    systemEvents: [],
    periodStart: AFTER_FROM,
    periodEnd: AFTER_TO,
    timeZone: "UTC",
  });

  assert.equal(impact.basis, "measured");
  assert.equal(impact.metric, "delayed_request_rate");
  assert.ok(impact.before.value > impact.after.value);
  assert.ok(Number.isFinite(impact.deltaPercentagePoints));
});

test("6. positive result: material improvement is classified positive", () => {
  const beforeFixture = delayedPatternFixture();
  const recommendation = detectDelayedRequestPattern({
    ...beforeFixture,
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
    timeZone: "UTC",
  });
  const afterFixture = afterDelayedFixture({ delayed: 1, total: 6 });
  const impact = measureRecommendationImpact({
    recommendation,
    ...afterFixture,
    systemEvents: [],
    periodStart: AFTER_FROM,
    periodEnd: AFTER_TO,
    timeZone: "UTC",
  });

  assert.equal(impact.outcome, "positive");
  assert.ok(impact.improvement > 0);
});

test("7. no-change result: equal measured rate is not presented as improvement", () => {
  const recommendation = {
    baseline: {
      metric: "delayed_request_rate",
      direction: "lower_better",
      value: 0.4,
      numerator: 2,
      denominator: 5,
      department: "housekeeping",
      window: { startHour: 16, endHour: 18 },
      source: "guest_requests + request_seen_by_staff",
      basis: "measured",
    },
  };
  const after = afterDelayedFixture({ delayed: 2, total: 5 });
  const impact = measureRecommendationImpact({
    recommendation,
    ...after,
    systemEvents: [],
    periodStart: AFTER_FROM,
    periodEnd: AFTER_TO,
    timeZone: "UTC",
  });

  assert.equal(impact.outcome, "no_material_change");
  assert.equal(impact.deltaPercentagePoints, 0);
});

test("8. rejected recommendation: rejected decisions cannot enter execution path", async () => {
  const source = await readProjectFile("lib/server/manager-intelligence-actions.ts");

  assertContains(source, 'status = approved');
  assertContains(source, 'else patch.rejected_at = now');
  assertContains(source, 'if (clean(row.manager_decision) !== "approved")');
  assertBefore(
    source,
    'if (clean(row.manager_decision) !== "approved")',
    "executed_by_session_id: scope.sessionId",
  );
});

test("9. insufficient data: measurement sample below threshold is explicitly insufficient", () => {
  const recommendation = {
    baseline: {
      metric: "delayed_request_rate",
      direction: "lower_better",
      value: 0.5,
      department: "housekeeping",
      window: { startHour: 16, endHour: 18 },
      source: "guest_requests",
      basis: "measured",
    },
  };
  const after = afterDelayedFixture({ delayed: 1, total: 4 });
  const impact = measureRecommendationImpact({
    recommendation,
    ...after,
    systemEvents: [],
    periodStart: AFTER_FROM,
    periodEnd: AFTER_TO,
    timeZone: "UTC",
  });

  assert.equal(impact.basis, "insufficient_data");
  assert.equal(impact.outcome, "insufficient_data");
  assert.equal(impact.reason, "insufficient_measurement_sample");
});

test("10. Estimated vs Measured: operational outcome and Value Engine evidence class stay separate", async () => {
  const fixture = delayedPatternFixture();
  const recommendation = detectDelayedRequestPattern({
    ...fixture,
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
    timeZone: "UTC",
  });
  assert.equal(recommendation.baseline.basis, "measured");
  assert.equal(recommendation.baseline.valueEngineConnection.basis, "estimated");

  const valueEngine = await readProjectFile("lib/value/gostaya-value-measurement.mjs");
  assertContains(valueEngine, 'measuredValue:');
  assertContains(valueEngine, 'estimatedValue:');
  assertContains(valueEngine, '"Actual recognized ancillary revenue from the billing ledger."');
  assertContains(valueEngine, '"Hotel-specific baseline time/cost deltas applied to measured operational activity."');
});

test("11. hotel isolation: recommendation, evidence and history queries are hotel-scoped", async () => {
  const source = await readProjectFile("lib/server/manager-intelligence-actions.ts");
  const scope = await readProjectFile("lib/server/manager-intelligence-scope.ts");

  assertContains(source, '.eq("hotel_id", input.hotelId)');
  assertContains(source, '.eq("hotel_id", scope.id)');
  assertContains(scope, '.eq("id", session.hotel_id)');
  assertContains(scope, "hotelMatchesRequestedSlug(hotel, requested)");
});

test("12. permissions: manager session, entitlement and same-origin mutation are mandatory", async () => {
  const scope = await readProjectFile("lib/server/manager-intelligence-scope.ts");
  const route = await readProjectFile("app/api/staff/manager-intelligence/actions/route.ts");

  assertContains(scope, 'getCurrentStaffSession(requested, "manager")');
  assertContains(scope, 'session.role !== "manager"');
  assertContains(scope, 'requireHotelPaidProductModuleAccess(String(hotel.id), "manager_intelligence")');
  assertContains(route, "enforceStaffSameOrigin(req)");
});

test("13. audit history: recommendation lifecycle is append-only evented with actor session", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20261001090000_manager_intelligence_action_impact_loop.sql",
  );
  const source = await readProjectFile("lib/server/manager-intelligence-actions.ts");

  assertContains(migration, "manager_intelligence_recommendation_events");
  assertContains(migration, "'generated','viewed','approved','rejected','expired'");
  assertContains(migration, "'execution_started','executed','execution_failed'");
  assertContains(migration, "'measurement_started','measurement_calculated'");
  assertContains(source, "actor_session_id: input.actorSessionId || null");
});

test("14. Incident Center linkage: recurring incident recommendation is visible back on the incident", async () => {
  const server = await readProjectFile("lib/server/incident-center.ts");
  const ui = await readProjectFile("app/control-plane/IncidentCenterPanel.tsx");

  assertContains(server, '.from("manager_intelligence_recommendations")');
  assertContains(server, '.in("incident_id", incidentIds)');
  assertContains(server, "managerIntelligenceRecommendation");
  assertContains(ui, "incident.managerIntelligenceRecommendation");
});

test("15. AI intent → action → outcome attribution: low conversion is detected and later measured with charged revenue evidence", () => {
  const before = aiFixture({
    fromDay: 1,
    questions: 6,
    conversions: 1,
    charged: 1,
    price: 40,
  });
  const recommendation = detectAiIntentConversionPattern({
    ...before,
    periodStart: BEFORE_FROM,
    periodEnd: BEFORE_TO,
  });

  assert.ok(recommendation);
  assert.equal(recommendation.sourceType, "ai_intent");
  assert.equal(recommendation.baseline.metric, "ai_intent_conversion_rate");
  assert.equal(
    recommendation.baseline.businessValue.observedChargedRevenue.singleCurrency.amount,
    40,
  );
  assert.equal(recommendation.baseline.businessValue.basis, "measured");

  const after = aiFixture({
    fromDay: 8,
    questions: 6,
    conversions: 3,
    charged: 3,
    price: 40,
  });
  const impact = measureRecommendationImpact({
    recommendation,
    ...after,
    systemEvents: [],
    periodStart: AFTER_FROM,
    periodEnd: AFTER_TO,
  });

  assert.equal(impact.basis, "measured");
  assert.equal(impact.outcome, "positive");
  assert.equal(impact.after.numerator, 3);
  assert.equal(impact.businessValue.basis, "measured");
  assert.equal(impact.businessValue.beforeAmount, 40);
  assert.equal(impact.businessValue.afterAmount, 120);
  assert.equal(impact.businessValue.deltaAmount, 80);
  assert.equal(
    impact.businessValue.classification,
    "observed_before_after_revenue_not_causal_increment",
  );

  const kpis = buildManagerIntelligenceKpis([
    {
      created_at: "2026-09-01T10:00:00.000Z",
      viewed_at: "2026-09-01T10:02:00.000Z",
      manager_decision: "approved",
      decision_at: "2026-09-01T10:05:00.000Z",
      approved_at: "2026-09-01T10:05:00.000Z",
      executed_at: "2026-09-01T10:15:00.000Z",
      execution_status: "completed",
      impact_basis: "measured",
      impact_outcome: "positive",
      status: "measured",
    },
  ]);
  assert.equal(kpis.recommendationAcceptanceRate, 1);
  assert.equal(kpis.executionRate, 1);
  assert.equal(kpis.measuredImpactRate, 1);
  assert.equal(kpis.positiveImpactRate, 1);
});


test("16. scheduled continuity: recommendation generation and measurement do not depend on opening the Manager UI", async () => {
  const actions = await readProjectFile("lib/server/manager-intelligence-actions.ts");
  const manager = await readProjectFile("lib/server/manager-intelligence.ts");

  assertContains(actions, "export async function refreshManagerIntelligenceActionLoopForHotel");
  assertContains(actions, "generated: generatedIds.length");
  assertContains(actions, "measuredCount += 1");
  assertContains(manager, "refreshManagerIntelligenceActionLoopForHotel({");
  assertContains(manager, "manager_intelligence_action_loop_scheduled_refresh_failed");
  assertBefore(
    manager,
    "refreshManagerIntelligenceActionLoopForHotel({",
    "if (await briefAlreadyExists(hotel.id, reportingDay))",
  );
});
