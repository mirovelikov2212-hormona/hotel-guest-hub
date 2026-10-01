import { createHash } from "node:crypto";

const DEFAULT_DELAY_MINUTES = 10;
const DEFAULT_MEASUREMENT_DAYS = 7;
const MATERIAL_RATE_DELTA = 0.02;

function text(value) {
  return String(value ?? "").trim();
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isoMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(value, fromMs, toMs) {
  const at = isoMs(value);
  return at !== null && at >= fromMs && at < toMs;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function round(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function weekKey(iso) {
  const date = new Date(iso);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function localHour(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const hour = Number(raw === "24" ? "0" : raw);
  return Number.isInteger(hour) ? hour : null;
}

function requestDepartment(row) {
  const metadata = record(row?.metadata_json);
  return text(metadata.department || row?.department).toLowerCase() || "reception";
}

function requestId(row) {
  return text(row?.id);
}

function eventRequestId(event) {
  const extra = record(event?.extra);
  return text(event?.request_id || extra.requestId);
}

function numericMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = text(value).replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function requestChargedRevenue(row) {
  if (!row) return null;
  const metadata = record(row.metadata_json);
  if (text(metadata.billingStatus).toLowerCase() !== "charged") return null;
  const amount = numericMoney(metadata.price);
  const currency = text(metadata.currency || "EUR").toUpperCase() || "EUR";
  if (!(amount > 0) || !/^[A-Z]{3}$/.test(currency)) return null;
  return { amount: round(amount, 2), currency };
}

function addRevenue(map, revenue) {
  if (!revenue) return;
  map.set(revenue.currency, round((map.get(revenue.currency) || 0) + revenue.amount, 2));
}

function revenueSnapshot(map) {
  const entries = [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: round(amount, 2) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    entries,
    singleCurrency: entries.length === 1 ? entries[0] : null,
  };
}

function firstSeenByRequest(events) {
  const result = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (text(event?.event_name) !== "request_seen_by_staff") continue;
    const id = eventRequestId(event);
    const at = isoMs(event?.created_at);
    if (!id || at === null) continue;
    const previous = result.get(id);
    if (previous === undefined || at < previous) result.set(id, at);
  }
  return result;
}

function requestDelayMinutes(row, seenMap, periodEndMs) {
  const created = isoMs(row?.created_at);
  if (created === null) return null;
  const seen = seenMap.get(requestId(row));
  if (seen !== undefined) return Math.max(0, (seen - created) / 60_000);

  const started = isoMs(row?.started_at);
  if (started !== null) return Math.max(0, (started - created) / 60_000);

  const status = text(row?.status).toLowerCase();
  if (status === "returned") return Math.max(DEFAULT_DELAY_MINUTES, (periodEndMs - created) / 60_000);
  if (status === "new" || status === "in_progress") {
    return Math.max(0, (periodEndMs - created) / 60_000);
  }
  return null;
}

function twoHourWindow(hour) {
  const start = Math.floor(hour / 2) * 2;
  return { startHour: start, endHour: (start + 2) % 24 };
}

function sameWindow(hour, window) {
  if (window.startHour <= 22) {
    return hour >= window.startHour && hour < window.startHour + 2;
  }
  return hour >= 22 || hour < 0;
}

function windowLabel(window) {
  const start = String(window.startHour).padStart(2, "0");
  const end = String((window.startHour + 2) % 24).padStart(2, "0");
  return `${start}:00–${end}:00`;
}

function candidateFingerprint(parts) {
  return hash(["manager-intelligence-action-v1", ...parts].join("|"));
}

export function detectDelayedRequestPattern(input = {}) {
  const fromMs = isoMs(input.periodStart);
  const toMs = isoMs(input.periodEnd);
  if (fromMs === null || toMs === null || fromMs >= toMs) return null;

  const timeZone = text(input.timeZone) || "UTC";
  const delayMinutes = Number.isFinite(Number(input.delayMinutes))
    ? Math.max(1, Number(input.delayMinutes))
    : DEFAULT_DELAY_MINUTES;
  const seen = firstSeenByRequest(input.events);
  const rows = (Array.isArray(input.requests) ? input.requests : []).filter(
    (row) => row?.is_test !== true && inRange(row?.created_at, fromMs, toMs),
  );

  const byDepartment = new Map();
  for (const row of rows) {
    const department = requestDepartment(row);
    const hour = localHour(row?.created_at, timeZone);
    if (hour === null) continue;
    const delay = requestDelayMinutes(row, seen, toMs);
    const delayed = delay !== null && delay >= delayMinutes;
    const bucket = Math.floor(hour / 2) * 2;
    const state = byDepartment.get(department) || {
      total: 0,
      delayed: 0,
      windows: new Map(),
    };
    state.total += 1;
    if (delayed) state.delayed += 1;
    const windowState = state.windows.get(bucket) || { total: 0, delayed: 0 };
    windowState.total += 1;
    if (delayed) windowState.delayed += 1;
    state.windows.set(bucket, windowState);
    byDepartment.set(department, state);
  }

  let best = null;
  for (const [department, state] of byDepartment.entries()) {
    if (state.total < 8 || state.delayed < 4) continue;
    for (const [startHour, windowState] of state.windows.entries()) {
      if (windowState.total < 5 || windowState.delayed < 4) continue;
      const concentration = ratio(windowState.delayed, state.delayed);
      const delayedRate = ratio(windowState.delayed, windowState.total);
      if (concentration === null || delayedRate === null || concentration < 0.5) continue;
      const score = concentration * windowState.delayed;
      if (!best || score > best.score) {
        best = {
          score,
          department,
          state,
          startHour,
          windowState,
          concentration,
          delayedRate,
        };
      }
    }
  }

  if (!best) return null;

  const window = twoHourWindow(best.startHour);
  const periodKey = weekKey(new Date(toMs).toISOString());
  const evidenceQuality =
    best.windowState.total >= 10 && best.windowState.delayed >= 5 ? "high" : "medium";
  const confidence = Math.min(
    0.98,
    0.55 + Math.min(0.2, best.windowState.total / 100) + Math.min(0.23, best.concentration * 0.23),
  );

  return {
    fingerprint: candidateFingerprint([
      "delayed_request_window",
      best.department,
      String(window.startHour),
      periodKey,
    ]),
    sourceType: "request_pattern",
    sourceRef: null,
    incidentId: null,
    module: "staff_operations",
    department: best.department,
    actionMode: "manual_action",
    actionType: "operational_routing_review",
    title: `Delayed requests cluster · ${best.department} · ${windowLabel(window)}`,
    problem: `${Math.round(best.concentration * 100)}% of delayed ${best.department} requests in the observation period occurred between ${windowLabel(window)}.`,
    recommendation: `Review staffing, working-hours coverage and configured routing/fallback for ${best.department} during ${windowLabel(window)}. Any configuration change must go through the existing Manager Change workflow.`,
    expectedOutcome: "Reduce delayed requests in the same time window.",
    evidenceQuality,
    confidence: round(confidence),
    evidence: {
      schemaVersion: "manager-intelligence-evidence-v1",
      pattern: "delayed_request_window",
      periodStart: new Date(fromMs).toISOString(),
      periodEnd: new Date(toMs).toISOString(),
      department: best.department,
      window,
      windowLabel: windowLabel(window),
      departmentRequests: best.state.total,
      departmentDelayedRequests: best.state.delayed,
      windowRequests: best.windowState.total,
      windowDelayedRequests: best.windowState.delayed,
      delayedConcentration: round(best.concentration),
      delayedRate: round(best.delayedRate),
      delayThresholdMinutes: delayMinutes,
    },
    actionPayload: {
      executionKind: "manual_review",
      safeConfigurationHandoff: "manager_change_workflow",
      scope: "schedules",
      department: best.department,
      window,
    },
    baseline: {
      metric: "delayed_request_rate",
      direction: "lower_better",
      value: round(best.delayedRate),
      numerator: best.windowState.delayed,
      denominator: best.windowState.total,
      department: best.department,
      window,
      source: "guest_requests + request_seen_by_staff",
      basis: "measured",
      valueEngineConnection: {
        basis: "estimated",
        dimension: "staff_time_saved_and_reception_coordination",
        source: "GOSTAYA Value Engine hotel baseline",
        rule: "Operational improvement is measured; monetary/time value remains estimated unless a verified hotel baseline is available.",
      },
    },
  };
}

function interactionEvidence(events, requests, fromMs, toMs) {
  const requestsByInteraction = new Map();
  for (const row of Array.isArray(requests) ? requests : []) {
    if (row?.is_test === true || !inRange(row?.created_at, fromMs, toMs)) continue;
    const interactionId = text(record(row?.metadata_json).aiInteractionId);
    if (interactionId) requestsByInteraction.set(interactionId, row);
  }

  const answers = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.is_test === true || !inRange(event?.created_at, fromMs, toMs)) continue;
    if (text(event?.event_name) !== "ai_answer_shown") continue;
    const extra = record(event?.extra);
    const interactionId = text(extra.aiInteractionId);
    const intent = text(extra.aiIntent).toLowerCase();
    if (!interactionId || !intent || intent === "acknowledgement") continue;
    const request = requestsByInteraction.get(interactionId) || null;
    answers.push({
      interactionId,
      intent,
      matchedIds: Array.isArray(extra.aiMatchedIds)
        ? extra.aiMatchedIds.map(text).filter(Boolean)
        : [],
      request,
      chargedRevenue: requestChargedRevenue(request),
    });
  }
  return answers;
}

export function detectAiIntentConversionPattern(input = {}) {
  const fromMs = isoMs(input.periodStart);
  const toMs = isoMs(input.periodEnd);
  if (fromMs === null || toMs === null || fromMs >= toMs) return null;

  const interactions = interactionEvidence(input.events, input.requests, fromMs, toMs);
  const groups = new Map();
  for (const item of interactions) {
    const state = groups.get(item.intent) || {
      questions: 0,
      converted: 0,
      charged: 0,
      chargedRevenue: new Map(),
      matchedIds: new Map(),
    };
    state.questions += 1;
    for (const id of item.matchedIds) {
      state.matchedIds.set(id, (state.matchedIds.get(id) || 0) + 1);
    }
    if (item.request) {
      state.converted += 1;
      const metadata = record(item.request.metadata_json);
      if (text(metadata.billingStatus).toLowerCase() === "charged") {
        state.charged += 1;
        addRevenue(state.chargedRevenue, item.chargedRevenue);
      }
    }
    groups.set(item.intent, state);
  }

  let best = null;
  for (const [intent, state] of groups.entries()) {
    if (state.questions < 5) continue;
    const conversionRate = ratio(state.converted, state.questions) || 0;
    if (conversionRate > 0.25) continue;
    const score = state.questions * (1 - conversionRate);
    if (!best || score > best.score) best = { score, intent, state, conversionRate };
  }
  if (!best) return null;

  const matched = [...best.state.matchedIds.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));

  const periodKey = weekKey(new Date(toMs).toISOString());
  const evidenceQuality = best.state.questions >= 10 ? "high" : "medium";

  return {
    fingerprint: candidateFingerprint(["ai_low_conversion", best.intent, periodKey]),
    sourceType: "ai_intent",
    sourceRef: best.intent,
    incidentId: null,
    module: "operational_ai",
    department: null,
    actionMode: "manual_action",
    actionType: "ai_conversion_flow_review",
    title: `High AI intent + low conversion · ${best.intent}`,
    problem: `${best.state.questions} AI interactions were classified as ${best.intent}, but only ${best.state.converted} produced a guest request/booking.`,
    recommendation: "Review availability, pricing presentation, service wording and CTA flow for this intent. Do not change hotel procedures automatically.",
    expectedOutcome: "Increase guest action/request conversion for the same AI intent.",
    evidenceQuality,
    confidence: round(Math.min(0.97, 0.6 + best.state.questions / 100)),
    evidence: {
      schemaVersion: "manager-intelligence-evidence-v1",
      pattern: "ai_high_intent_low_conversion",
      periodStart: new Date(fromMs).toISOString(),
      periodEnd: new Date(toMs).toISOString(),
      intent: best.intent,
      questions: best.state.questions,
      convertedRequests: best.state.converted,
      chargedRequests: best.state.charged,
      chargedRevenue: revenueSnapshot(best.state.chargedRevenue),
      conversionRate: round(best.conversionRate),
      matchedIds: matched,
    },
    actionPayload: {
      executionKind: "manual_review",
      reviewTargets: ["availability", "pricing_presentation", "service_wording", "cta_flow"],
      intent: best.intent,
      matchedIds: matched.map((item) => item.id),
    },
    baseline: {
      metric: "ai_intent_conversion_rate",
      direction: "higher_better",
      value: round(best.conversionRate),
      numerator: best.state.converted,
      denominator: best.state.questions,
      intent: best.intent,
      source: "hub_events + guest_requests.aiInteractionId",
      basis: "measured",
      businessValue: {
        basis: "measured",
        source: "AI interaction → guest request → charged billing",
        observedChargedRevenue: revenueSnapshot(best.state.chargedRevenue),
        classification: "observed_revenue_not_causal_increment",
      },
      valueEngineConnection: {
        basis: "measured",
        dimension: "upsell_conversion_revenue",
        source: "guest_requests billing ledger linked by aiInteractionId",
      },
    },
  };
}

export function detectRecurringIncidentPattern(input = {}) {
  const fromMs = isoMs(input.periodStart);
  const toMs = isoMs(input.periodEnd);
  if (fromMs === null || toMs === null || fromMs >= toMs) return null;

  const groups = new Map();
  for (const row of Array.isArray(input.systemEvents) ? input.systemEvents : []) {
    if (!inRange(row?.created_at, fromMs, toMs)) continue;
    if (text(row?.event_type) === "incident_status_changed") continue;
    const incident = record(record(row?.metadata_json).incident);
    const fingerprint = text(incident.fingerprint);
    const incidentId = text(incident.incidentId);
    if (!fingerprint || !incidentId) continue;
    const state = groups.get(fingerprint) || {
      count: 0,
      incidentId,
      module: text(incident.module || row?.source).toLowerCase() || "unknown",
      eventType: text(row?.event_type),
    };
    state.count += 1;
    groups.set(fingerprint, state);
  }

  const best = [...groups.entries()]
    .map(([fingerprint, state]) => ({ fingerprint, ...state }))
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count)[0];
  if (!best) return null;

  const periodKey = weekKey(new Date(toMs).toISOString());
  return {
    fingerprint: candidateFingerprint(["incident_recurrence", best.fingerprint, periodKey]),
    sourceType: "incident_pattern",
    sourceRef: best.fingerprint,
    incidentId: best.incidentId,
    module: best.module,
    department: null,
    actionMode: "manual_action",
    actionType: "incident_root_cause_review",
    title: `Recurring incident · ${best.eventType || best.module}`,
    problem: `${best.count} occurrences of the same incident fingerprint were detected in the observation window.`,
    recommendation: "Review the incident root cause and corrective action, then monitor recurrence after the fix.",
    expectedOutcome: "Reduce repeated occurrences of the same incident fingerprint.",
    evidenceQuality: best.count >= 5 ? "high" : "medium",
    confidence: round(Math.min(0.99, 0.65 + best.count / 30)),
    evidence: {
      schemaVersion: "manager-intelligence-evidence-v1",
      pattern: "recurring_incident",
      periodStart: new Date(fromMs).toISOString(),
      periodEnd: new Date(toMs).toISOString(),
      incidentId: best.incidentId,
      incidentFingerprint: best.fingerprint,
      eventType: best.eventType,
      occurrences: best.count,
    },
    actionPayload: {
      executionKind: "manual_review",
      incidentId: best.incidentId,
      incidentFingerprint: best.fingerprint,
    },
    baseline: {
      metric: "incident_occurrences",
      direction: "lower_better",
      value: best.count,
      numerator: best.count,
      denominator: null,
      incidentFingerprint: best.fingerprint,
      source: "system_events.incident",
      basis: "measured",
      valueEngineConnection: {
        basis: "measured",
        dimension: "resolved_incidents_and_reduced_recurring_problems",
        source: "system_events incident fingerprint occurrences",
      },
    },
  };
}

export function buildRecommendationCandidates(input = {}) {
  const candidates = [
    detectDelayedRequestPattern(input),
    detectAiIntentConversionPattern(input),
    detectRecurringIncidentPattern(input),
  ].filter(Boolean);
  return candidates;
}

function measureDelayedRate(recommendation, input, fromMs, toMs) {
  const baseline = record(recommendation?.baseline_json || recommendation?.baseline);
  const department = text(baseline.department).toLowerCase();
  const window = record(baseline.window);
  if (!department || !Number.isInteger(Number(window.startHour))) return null;

  const seen = firstSeenByRequest(input.events);
  let denominator = 0;
  let numerator = 0;
  for (const row of Array.isArray(input.requests) ? input.requests : []) {
    if (row?.is_test === true || !inRange(row?.created_at, fromMs, toMs)) continue;
    if (requestDepartment(row) !== department) continue;
    const hour = localHour(row?.created_at, text(input.timeZone) || "UTC");
    if (hour === null || !sameWindow(hour, window)) continue;
    denominator += 1;
    const delay = requestDelayMinutes(row, seen, toMs);
    if (delay !== null && delay >= DEFAULT_DELAY_MINUTES) numerator += 1;
  }

  if (denominator < 5) return { insufficient: true, numerator, denominator };
  return { value: round(numerator / denominator), numerator, denominator };
}

function measureAiConversion(recommendation, input, fromMs, toMs) {
  const baseline = record(recommendation?.baseline_json || recommendation?.baseline);
  const intent = text(baseline.intent).toLowerCase();
  if (!intent) return null;
  const rows = interactionEvidence(input.events, input.requests, fromMs, toMs)
    .filter((item) => item.intent === intent);
  const denominator = rows.length;
  const numerator = rows.filter((item) => Boolean(item.request)).length;
  const chargedRevenue = new Map();
  for (const item of rows) addRevenue(chargedRevenue, item.chargedRevenue);
  const revenue = revenueSnapshot(chargedRevenue);
  if (denominator < 5) {
    return { insufficient: true, numerator, denominator, chargedRevenue: revenue };
  }
  return {
    value: round(numerator / denominator),
    numerator,
    denominator,
    chargedRevenue: revenue,
  };
}

function measureIncidentOccurrences(recommendation, input, fromMs, toMs) {
  const baseline = record(recommendation?.baseline_json || recommendation?.baseline);
  const fingerprint = text(baseline.incidentFingerprint);
  if (!fingerprint) return null;
  let count = 0;
  for (const row of Array.isArray(input.systemEvents) ? input.systemEvents : []) {
    if (!inRange(row?.created_at, fromMs, toMs)) continue;
    if (text(row?.event_type) === "incident_status_changed") continue;
    const incident = record(record(row?.metadata_json).incident);
    if (text(incident.fingerprint) === fingerprint) count += 1;
  }
  return { value: count, numerator: count, denominator: null };
}

export function classifyMeasuredImpact(input = {}) {
  const before = Number(input.before);
  const after = Number(input.after);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return { outcome: "insufficient_data", delta: null };
  }
  const direction = text(input.direction) || "lower_better";
  const absoluteDelta = after - before;
  const improvement = direction === "higher_better" ? absoluteDelta : -absoluteDelta;
  const threshold = Number.isFinite(Number(input.materialThreshold))
    ? Math.max(0, Number(input.materialThreshold))
    : MATERIAL_RATE_DELTA;

  return {
    outcome:
      improvement > threshold
        ? "positive"
        : improvement < -threshold
          ? "negative"
          : "no_material_change",
    delta: round(absoluteDelta),
    improvement: round(improvement),
  };
}

export function measureRecommendationImpact(input = {}) {
  const recommendation = input.recommendation || {};
  const baseline = record(recommendation.baseline_json || recommendation.baseline);
  const fromMs = isoMs(input.periodStart);
  const toMs = isoMs(input.periodEnd);
  if (fromMs === null || toMs === null || fromMs >= toMs) {
    return {
      basis: "insufficient_data",
      outcome: "insufficient_data",
      reason: "measurement_window_invalid",
    };
  }

  let measured = null;
  if (baseline.metric === "delayed_request_rate") {
    measured = measureDelayedRate(recommendation, input, fromMs, toMs);
  } else if (baseline.metric === "ai_intent_conversion_rate") {
    measured = measureAiConversion(recommendation, input, fromMs, toMs);
  } else if (baseline.metric === "incident_occurrences") {
    measured = measureIncidentOccurrences(recommendation, input, fromMs, toMs);
  }

  if (!measured || measured.insufficient || !Number.isFinite(Number(measured.value))) {
    return {
      basis: "insufficient_data",
      outcome: "insufficient_data",
      reason: "insufficient_measurement_sample",
      after: measured || null,
      periodStart: new Date(fromMs).toISOString(),
      periodEnd: new Date(toMs).toISOString(),
    };
  }

  const before = Number(baseline.value);
  const isRate = String(baseline.metric).endsWith("_rate");
  const classification = classifyMeasuredImpact({
    before,
    after: measured.value,
    direction: baseline.direction,
    materialThreshold: isRate ? MATERIAL_RATE_DELTA : 0,
  });

  const valueEngineConnection = record(baseline.valueEngineConnection);
  const baselineBusinessValue = record(baseline.businessValue);
  const beforeRevenue = record(baselineBusinessValue.observedChargedRevenue).singleCurrency;
  const afterRevenue = record(measured.chargedRevenue).singleCurrency;
  const sameCurrencyRevenue =
    beforeRevenue
    && afterRevenue
    && text(beforeRevenue.currency) === text(afterRevenue.currency)
      ? {
          basis: "measured",
          source: "AI interaction → request → charged billing",
          classification: "observed_before_after_revenue_not_causal_increment",
          currency: text(afterRevenue.currency),
          beforeAmount: Number(beforeRevenue.amount),
          afterAmount: Number(afterRevenue.amount),
          deltaAmount: round(Number(afterRevenue.amount) - Number(beforeRevenue.amount), 2),
        }
      : null;

  return {
    basis: "measured",
    outcome: classification.outcome,
    metric: baseline.metric,
    direction: baseline.direction,
    before: {
      value: before,
      numerator: baseline.numerator ?? null,
      denominator: baseline.denominator ?? null,
    },
    after: measured,
    delta: classification.delta,
    improvement: classification.improvement,
    deltaPercentagePoints: isRate ? round(classification.delta * 100, 2) : null,
    periodStart: new Date(fromMs).toISOString(),
    periodEnd: new Date(toMs).toISOString(),
    source: baseline.source || "hotel operational data",
    businessValue: sameCurrencyRevenue,
    valueEngineConnection: Object.keys(valueEngineConnection).length
      ? valueEngineConnection
      : null,
    valueClassification: {
      operationalImpact: "measured",
      monetaryImpact: sameCurrencyRevenue ? "measured_observed_not_causal" : text(valueEngineConnection.basis) || "not_available",
      rule: "Measured operational outcomes and estimated business value are never presented as the same evidence class.",
    },
  };
}

export function buildManagerIntelligenceKpis(recommendations = []) {
  const rows = Array.isArray(recommendations) ? recommendations : [];
  const generated = rows.length;
  const viewed = rows.filter((row) => Boolean(row.viewed_at)).length;
  const approved = rows.filter((row) => row.manager_decision === "approved").length;
  const rejected = rows.filter((row) => row.manager_decision === "rejected").length;
  const expired = rows.filter((row) => row.status === "expired").length;
  const reviewed = approved + rejected;
  const executed = rows.filter((row) => Boolean(row.executed_at)).length;
  const successfullyCompleted = rows.filter((row) =>
    ["completed", "executed"].includes(text(row.execution_status)),
  ).length;
  const measurable = rows.filter((row) => row.impact_basis === "measured").length;
  const positive = rows.filter((row) => row.impact_outcome === "positive").length;
  const noChange = rows.filter((row) => row.impact_outcome === "no_material_change").length;
  const negative = rows.filter((row) => row.impact_outcome === "negative").length;

  const decisionMinutes = rows
    .map((row) => {
      const created = isoMs(row.created_at);
      const decision = isoMs(row.decision_at);
      return created !== null && decision !== null ? (decision - created) / 60_000 : null;
    })
    .filter((value) => value !== null && value >= 0);
  const executionMinutes = rows
    .map((row) => {
      const approvedAt = isoMs(row.approved_at);
      const executedAt = isoMs(row.executed_at);
      return approvedAt !== null && executedAt !== null ? (executedAt - approvedAt) / 60_000 : null;
    })
    .filter((value) => value !== null && value >= 0);

  const average = (values) =>
    values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 2) : null;

  return {
    recommendationsGenerated: generated,
    recommendationsViewed: viewed,
    recommendationsApproved: approved,
    recommendationsRejected: rejected,
    recommendationsIgnoredOrExpired: expired,
    actionsExecuted: executed,
    actionsSuccessfullyCompleted: successfullyCompleted,
    recommendationsWithMeasurableOutcome: measurable,
    recommendationsProducingImprovement: positive,
    recommendationsProducingNoMaterialChange: noChange,
    recommendationsProducingNegativeResult: negative,
    averageMinutesRecommendationToDecision: average(decisionMinutes),
    averageMinutesApprovalToExecution: average(executionMinutes),
    recommendationAcceptanceRate: ratio(approved, reviewed),
    executionRate: ratio(executed, approved),
    measuredImpactRate: ratio(measurable, executed),
    positiveImpactRate: ratio(positive, measurable),
  };
}

export const MANAGER_INTELLIGENCE_MEASUREMENT_DAYS = DEFAULT_MEASUREMENT_DAYS;
