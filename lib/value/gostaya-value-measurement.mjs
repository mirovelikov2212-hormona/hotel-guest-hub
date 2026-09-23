const BASELINE_SCHEMA = "gostaya-value-baseline-v1";
const VALUE_SCHEMA = "gostaya-value-measurement-v1";
const AVG_MONTH_DAYS = 365.25 / 12;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(code);
  return number;
}

function nonNegative(value, code) {
  const number = finite(value, code);
  if (number < 0) throw new Error(code);
  return number;
}

function ratio(value, code) {
  const number = finite(value, code);
  if (number < 0 || number > 1) throw new Error(code);
  return number;
}

function integerMinor(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(code);
  return number;
}

function iso(value, code) {
  const raw = text(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) throw new Error(code);
  return new Date(parsed).toISOString();
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function eventExtra(event) {
  return record(event?.extra);
}

function requestMetadata(row) {
  return record(row?.metadata_json);
}

function isGuestOriginRequest(row) {
  const source = text(row?.source).toLowerCase();
  const channel = text(row?.channel).toLowerCase();
  return source === "guest_hub" || channel === "pwa";
}

function periodGuestRequests(requests, fromMs, toMs) {
  return (Array.isArray(requests) ? requests : []).filter(
    (row) =>
      row?.is_test !== true
      && isGuestOriginRequest(row)
      && inPeriod(row?.created_at, fromMs, toMs),
  );
}

function eventRequestId(event) {
  const extra = eventExtra(event);
  return text(event?.request_id || extra.requestId);
}

function eventTime(event) {
  const raw = text(event?.created_at);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function inPeriod(value, fromMs, toMs) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) && parsed >= fromMs && parsed < toMs;
}

function addMinor(target, value) {
  return Math.round(target + value);
}

function costForMinutes(minutes, hourlyMinor) {
  return (Number(minutes) * Number(hourlyMinor)) / 60;
}

function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function roundMetric(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function moneyForCurrency(map, currency) {
  const value = Number(record(map)[currency]);
  return Number.isSafeInteger(value) ? value : 0;
}

export function normalizeGostayaValueBaseline(input) {
  const source = record(input?.source);
  const assumptions = record(input?.assumptions);
  const labor = record(assumptions.laborCostMinorPerHour);

  if (text(input?.schemaVersion) !== BASELINE_SCHEMA) {
    throw new Error("VALUE_BASELINE_SCHEMA_INVALID");
  }

  const revision = Number(input?.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("VALUE_BASELINE_REVISION_INVALID");
  }

  const currency = text(input?.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("VALUE_BASELINE_CURRENCY_INVALID");
  }

  const baselineFrom = iso(input?.baselinePeriod?.from, "VALUE_BASELINE_PERIOD_INVALID");
  const baselineTo = iso(input?.baselinePeriod?.to, "VALUE_BASELINE_PERIOD_INVALID");
  if (Date.parse(baselineFrom) >= Date.parse(baselineTo)) {
    throw new Error("VALUE_BASELINE_PERIOD_INVALID");
  }

  const sourceType = text(source.type).toLowerCase();
  if (![
    "manual_time_study",
    "call_log",
    "staff_roster",
    "finance_report",
    "mixed",
  ].includes(sourceType)) {
    throw new Error("VALUE_BASELINE_SOURCE_INVALID");
  }

  const normalized = {
    schemaVersion: BASELINE_SCHEMA,
    revision,
    currency,
    baselinePeriod: {
      from: baselineFrom,
      to: baselineTo,
    },
    source: {
      type: sourceType,
      reference: text(source.reference).slice(0, 500),
      notes: text(source.notes).slice(0, 2_000),
    },
    assumptions: {
      receptionMinutesPerGuestRequest: nonNegative(
        assumptions.receptionMinutesPerGuestRequest,
        "VALUE_BASELINE_RECEPTION_MINUTES_INVALID",
      ),
      receptionInfoMinutesPerQuestion: nonNegative(
        assumptions.receptionInfoMinutesPerQuestion,
        "VALUE_BASELINE_INFO_MINUTES_INVALID",
      ),
      coordinationMinutesPerDirectDepartmentRequest: nonNegative(
        assumptions.coordinationMinutesPerDirectDepartmentRequest,
        "VALUE_BASELINE_COORDINATION_MINUTES_INVALID",
      ),
      baselineDirectDepartmentRoutingRate: ratio(
        assumptions.baselineDirectDepartmentRoutingRate,
        "VALUE_BASELINE_DIRECT_ROUTING_RATE_INVALID",
      ),
      baselineInfoSelfServiceRate: ratio(
        assumptions.baselineInfoSelfServiceRate,
        "VALUE_BASELINE_INFO_SELF_SERVICE_RATE_INVALID",
      ),
      serviceRecoveryResolutionMinutes: nonNegative(
        assumptions.serviceRecoveryResolutionMinutes,
        "VALUE_BASELINE_RECOVERY_MINUTES_INVALID",
      ),
      laborCostMinorPerHour: {
        reception: integerMinor(
          labor.reception,
          "VALUE_BASELINE_RECEPTION_COST_INVALID",
        ),
        coordination: integerMinor(
          labor.coordination,
          "VALUE_BASELINE_COORDINATION_COST_INVALID",
        ),
        serviceRecovery: integerMinor(
          labor.serviceRecovery,
          "VALUE_BASELINE_RECOVERY_COST_INVALID",
        ),
      },
      gostayaMonthlyCostMinor: integerMinor(
        assumptions.gostayaMonthlyCostMinor,
        "VALUE_BASELINE_MONTHLY_COST_INVALID",
      ),
      gostayaOneTimeCostMinor: integerMinor(
        assumptions.gostayaOneTimeCostMinor ?? 0,
        "VALUE_BASELINE_ONE_TIME_COST_INVALID",
      ),
      oneTimeAmortizationMonths: Math.max(
        1,
        Math.round(
          nonNegative(
            assumptions.oneTimeAmortizationMonths ?? 12,
            "VALUE_BASELINE_AMORTIZATION_INVALID",
          ),
        ),
      ),
    },
  };

  return Object.freeze({
    ...normalized,
    baselinePeriod: Object.freeze(normalized.baselinePeriod),
    source: Object.freeze(normalized.source),
    assumptions: Object.freeze({
      ...normalized.assumptions,
      laborCostMinorPerHour: Object.freeze(
        normalized.assumptions.laborCostMinorPerHour,
      ),
    }),
  });
}

function directDepartmentMetrics(requests, baseline, fromMs, toMs) {
  const periodRequests = periodGuestRequests(requests, fromMs, toMs);

  let directDepartmentRequests = 0;
  let receptionRequests = 0;

  for (const row of periodRequests) {
    const metadata = requestMetadata(row);
    const department = text(metadata.department).toLowerCase();

    if (department && department !== "reception") {
      directDepartmentRequests += 1;
    } else {
      receptionRequests += 1;
    }
  }

  const totalRequests = periodRequests.length;
  const expectedBaselineDirect =
    totalRequests * baseline.assumptions.baselineDirectDepartmentRoutingRate;
  const attributableBypassRequests = roundMetric(
    directDepartmentRequests - expectedBaselineDirect,
  );

  const bypassMinutes = roundMetric(
    attributableBypassRequests
    * baseline.assumptions.receptionMinutesPerGuestRequest,
  );
  const coordinationMinutes = roundMetric(
    attributableBypassRequests
    * baseline.assumptions.coordinationMinutesPerDirectDepartmentRequest,
  );

  return {
    totalRequests,
    directDepartmentRequests,
    receptionRequests,
    directRoutingRate: safeRatio(directDepartmentRequests, totalRequests),
    expectedBaselineDirect,
    attributableBypassRequests,
    bypassMinutes,
    coordinationMinutes,
  };
}

function aiContainmentMetrics(events, baseline, fromMs, toMs) {
  const periodEvents = (Array.isArray(events) ? events : []).filter(
    (event) =>
      event?.is_test !== true
      && inPeriod(event?.created_at, fromMs, toMs),
  );

  let questions = 0;
  let successfulAnswers = 0;
  let measuredContained = 0;
  let legacyUnscoredAnswers = 0;
  let aiErrors = 0;

  for (const event of periodEvents) {
    const name = text(event?.event_name).toLowerCase();
    const extra = eventExtra(event);

    if (name === "ai_question_sent") questions += 1;
    if (name === "ai_error") aiErrors += 1;
    if (name !== "ai_answer_shown") continue;

    const intent = text(extra.aiIntent).toLowerCase();
    const interactionId = text(extra.aiInteractionId);
    const actionStatus = text(extra.aiOperationalActionStatus).toLowerCase();

    if (!intent || intent === "acknowledgement") {
      legacyUnscoredAnswers += 1;
      continue;
    }

    successfulAnswers += 1;

    if (!interactionId) {
      legacyUnscoredAnswers += 1;
      continue;
    }

    if (actionStatus === "not_applicable") {
      measuredContained += 1;
    }
  }

  const attributableContained = roundMetric(
    measuredContained
    * (1 - baseline.assumptions.baselineInfoSelfServiceRate),
  );
  const minutesSaved = roundMetric(
    attributableContained
    * baseline.assumptions.receptionInfoMinutesPerQuestion,
  );

  return {
    questions,
    successfulAnswers,
    measuredContained,
    legacyUnscoredAnswers,
    aiErrors,
    containmentRate: safeRatio(measuredContained, questions),
    attributableContained,
    minutesSaved,
  };
}

function serviceRecoveryMetrics(
  events,
  baseline,
  fromMs,
  toMs,
  eligibleRequestIds,
) {
  const grouped = new Map();

  for (const event of Array.isArray(events) ? events : []) {
    if (event?.is_test === true) continue;
    const name = text(event?.event_name).toLowerCase();
    if (name !== "request_returned" && name !== "request_completed") continue;

    const requestId = eventRequestId(event);
    const time = eventTime(event);
    if (
      !requestId
      || time === null
      || !eligibleRequestIds.has(requestId)
    ) {
      continue;
    }

    const rows = grouped.get(requestId) || [];
    rows.push({ name, time });
    grouped.set(requestId, rows);
  }

  let returnedIncidents = 0;
  let recoveredIncidents = 0;
  let totalActualRecoveryMinutes = 0;
  let baselineDeltaMinutes = 0;

  for (const rows of grouped.values()) {
    rows.sort((a, b) => a.time - b.time);

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.name !== "request_returned") continue;
      if (!(row.time >= fromMs && row.time < toMs)) continue;

      returnedIncidents += 1;
      const completion = rows
        .slice(index + 1)
        .find((candidate) => candidate.name === "request_completed");

      if (!completion) continue;

      recoveredIncidents += 1;
      const actualMinutes = Math.max(
        0,
        (completion.time - row.time) / 60_000,
      );
      totalActualRecoveryMinutes += actualMinutes;
      baselineDeltaMinutes +=
        baseline.assumptions.serviceRecoveryResolutionMinutes
        - actualMinutes;
    }
  }

  return {
    returnedIncidents,
    recoveredIncidents,
    unresolvedReturnedIncidents:
      returnedIncidents - recoveredIncidents,
    averageActualRecoveryMinutes:
      recoveredIncidents > 0
        ? totalActualRecoveryMinutes / recoveredIncidents
        : null,
    recoveryMinutesSavedVsBaseline: baselineDeltaMinutes,
  };
}

function periodCostMinor(baseline, fromMs, toMs) {
  const days = Math.max(0, (toMs - fromMs) / 86_400_000);
  const months = days / AVG_MONTH_DAYS;
  const assumptions = baseline.assumptions;
  const amortizedOneTimeMonthly =
    assumptions.gostayaOneTimeCostMinor
    / assumptions.oneTimeAmortizationMonths;

  return Math.round(
    months
    * (assumptions.gostayaMonthlyCostMinor + amortizedOneTimeMonthly),
  );
}

export function buildGostayaValueMeasurement(input = {}) {
  const baseline = normalizeGostayaValueBaseline(input.baseline);
  const goLiveAt = iso(input?.goLiveAt, "VALUE_GOLIVE_INVALID");
  const from = iso(input?.period?.from, "VALUE_PERIOD_INVALID");
  const to = iso(input?.period?.to, "VALUE_PERIOD_INVALID");
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  if (Date.parse(baseline.baselinePeriod.to) > Date.parse(goLiveAt)) {
    throw new Error("VALUE_BASELINE_MUST_PRECEDE_GOLIVE");
  }

  if (fromMs >= toMs || fromMs < Date.parse(goLiveAt)) {
    throw new Error("VALUE_PERIOD_INVALID");
  }

  const eligibleRequestIds = new Set(
    periodGuestRequests(input.requests, fromMs, toMs)
      .map((row) => text(row?.id))
      .filter(Boolean),
  );

  const direct = directDepartmentMetrics(
    input.requests,
    baseline,
    fromMs,
    toMs,
  );
  const ai = aiContainmentMetrics(
    input.events,
    baseline,
    fromMs,
    toMs,
  );
  const recovery = serviceRecoveryMetrics(
    input.events,
    baseline,
    fromMs,
    toMs,
    eligibleRequestIds,
  );

  const receptionBypassValue = costForMinutes(
    direct.bypassMinutes,
    baseline.assumptions.laborCostMinorPerHour.reception,
  );
  const aiContainmentValue = costForMinutes(
    ai.minutesSaved,
    baseline.assumptions.laborCostMinorPerHour.reception,
  );
  const coordinationValue = costForMinutes(
    direct.coordinationMinutes,
    baseline.assumptions.laborCostMinorPerHour.coordination,
  );
  const serviceRecoveryValue = costForMinutes(
    recovery.recoveryMinutesSavedVsBaseline,
    baseline.assumptions.laborCostMinorPerHour.serviceRecovery,
  );

  const estimatedOperationalValueMinor = Math.round(
    receptionBypassValue
    + aiContainmentValue
    + coordinationValue
    + serviceRecoveryValue,
  );

  const trackedRevenue = record(
    input?.revenueSnapshot?.moneyMinorByCurrency?.trackedRevenue,
  );
  const measuredRevenueMinor = moneyForCurrency(
    trackedRevenue,
    baseline.currency,
  );
  const excludedRevenueCurrencies = Object.keys(trackedRevenue)
    .filter((currency) => currency !== baseline.currency)
    .sort();

  const measuredValueMinor = measuredRevenueMinor;
  const totalValueMinor = addMinor(
    measuredValueMinor,
    estimatedOperationalValueMinor,
  );
  const costMinor = periodCostMinor(baseline, fromMs, toMs);

  const staffTimeSavedMinutes = roundMetric(
    direct.bypassMinutes
    + ai.minutesSaved
    + direct.coordinationMinutes
    + recovery.recoveryMinutesSavedVsBaseline,
  );

  return Object.freeze({
    schemaVersion: VALUE_SCHEMA,
    period: Object.freeze({ from, to }),
    baseline: Object.freeze({
      revision: baseline.revision,
      currency: baseline.currency,
      baselinePeriod: baseline.baselinePeriod,
      goLiveAt,
      source: baseline.source,
    }),
    measuredOperationalImpact: Object.freeze({
      guestRequests: direct.totalRequests,
      directDepartmentRequests: direct.directDepartmentRequests,
      receptionRequests: direct.receptionRequests,
      directDepartmentRoutingRate: direct.directRoutingRate,
      aiQuestions: ai.questions,
      aiSuccessfulAnswers: ai.successfulAnswers,
      aiContainedInteractions: ai.measuredContained,
      aiContainmentRate: ai.containmentRate,
      aiErrors: ai.aiErrors,
      aiLegacyUnscoredAnswers: ai.legacyUnscoredAnswers,
      returnedServiceIncidents: recovery.returnedIncidents,
      recoveredServiceIncidents: recovery.recoveredIncidents,
      unresolvedReturnedServiceIncidents:
        recovery.unresolvedReturnedIncidents,
      averageActualRecoveryMinutes:
        recovery.averageActualRecoveryMinutes,
    }),
    estimatedOperationalImpact: Object.freeze({
      attributableReceptionBypassRequests:
        direct.attributableBypassRequests,
      attributableAiContainedInteractions:
        ai.attributableContained,
      receptionBypassMinutesSaved: direct.bypassMinutes,
      aiContainmentMinutesSaved: ai.minutesSaved,
      coordinationMinutesSaved: direct.coordinationMinutes,
      serviceRecoveryMinutesSaved:
        recovery.recoveryMinutesSavedVsBaseline,
      staffTimeSavedMinutes,
    }),
    valueMinor: Object.freeze({
      currency: baseline.currency,
      measured: Object.freeze({
        ancillaryRevenue: measuredRevenueMinor,
        total: measuredValueMinor,
      }),
      estimated: Object.freeze({
        receptionBypass: Math.round(receptionBypassValue),
        aiContainment: Math.round(aiContainmentValue),
        avoidedCoordination: Math.round(coordinationValue),
        serviceRecovery: Math.round(serviceRecoveryValue),
        total: estimatedOperationalValueMinor,
      }),
      combined: totalValueMinor,
      gostayaCost: costMinor,
      excludedRevenueCurrencies: Object.freeze(
        excludedRevenueCurrencies,
      ),
    }),
    roi: Object.freeze({
      measured:
        costMinor > 0
          ? (measuredValueMinor - costMinor) / costMinor
          : null,
      combined:
        costMinor > 0
          ? (totalValueMinor - costMinor) / costMinor
          : null,
      measuredValueToCost:
        costMinor > 0 ? measuredValueMinor / costMinor : null,
      combinedValueToCost:
        costMinor > 0 ? totalValueMinor / costMinor : null,
    }),
    classification: Object.freeze({
      measuredValue:
        "Actual recognized ancillary revenue from the billing ledger.",
      estimatedValue:
        "Hotel-specific baseline time/cost deltas applied to measured operational activity.",
      benchmarkValue:
        "Not available until an anonymized multi-hotel benchmark cohort is defined.",
    }),
  });
}

export const GOSTAYA_VALUE_BASELINE_SCHEMA_VERSION = BASELINE_SCHEMA;
export const GOSTAYA_VALUE_MEASUREMENT_SCHEMA_VERSION = VALUE_SCHEMA;
