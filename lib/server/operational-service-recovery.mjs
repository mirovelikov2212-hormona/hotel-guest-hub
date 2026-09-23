function clean(value) {
  return String(value ?? "").trim();
}

function validIso(value) {
  const candidate = clean(value);
  if (!candidate) return null;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function knownSignal(value) {
  const type = clean(value?.type);
  const occurredAt = validIso(value?.occurredAt);

  if (type === "sla_breach") {
    const requestId = clean(value?.requestId);
    if (!requestId) return null;
    return {
      signalId: `sla_breach:${requestId}`,
      type,
      source: "canonical_request_sla",
      requestId,
      surveyId: null,
      occurredAt,
      serviceKey: clean(value?.serviceKey) || null,
      rating: null,
      resolutionStatus: null,
      requiredAction: "human_followup",
    };
  }

  if (type === "returned_request") {
    const requestId = clean(value?.requestId);
    if (!requestId) return null;
    return {
      signalId: `returned_request:${requestId}`,
      type,
      source: "canonical_request_status",
      requestId,
      surveyId: null,
      occurredAt,
      serviceKey: clean(value?.serviceKey) || null,
      rating: null,
      resolutionStatus: null,
      requiredAction: "human_followup",
    };
  }

  if (type === "critical_feedback") {
    const surveyId = clean(value?.surveyId);
    const rating = Number(value?.rating);
    if (!surveyId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return null;
    }
    return {
      signalId: `critical_feedback:${surveyId}`,
      type,
      source: "canonical_guest_feedback",
      requestId: null,
      surveyId,
      occurredAt,
      serviceKey: null,
      rating,
      resolutionStatus: clean(value?.resolutionStatus) || null,
      requiredAction: "human_followup",
    };
  }

  return null;
}

export function buildOperationalServiceRecoveryState(input = {}) {
  const attention = Array.isArray(input?.attention) ? input.attention : [];
  const signals = new Map();

  for (const item of attention) {
    const signal = knownSignal(item);
    if (signal) signals.set(signal.signalId, signal);
  }

  const ordered = [...signals.values()].sort((left, right) => {
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : 0;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.signalId.localeCompare(right.signalId);
  });

  const byType = {
    slaBreach: ordered.filter((signal) => signal.type === "sla_breach").length,
    returnedRequest: ordered.filter(
      (signal) => signal.type === "returned_request",
    ).length,
    criticalFeedback: ordered.filter(
      (signal) => signal.type === "critical_feedback",
    ).length,
  };

  return Object.freeze({
    schemaVersion: "operational-service-recovery-v1",
    status: ordered.length ? "human_followup_required" : "clear",
    needsHumanFollowup: ordered.length > 0,
    signalCount: ordered.length,
    byType: Object.freeze(byType),
    signals: Object.freeze(ordered.map((signal) => Object.freeze(signal))),
    decisionAuthority: "human_hotel_staff",
    aiRole: "explain_verified_status_only",
    automaticGuestCommunication: false,
    automaticCompensation: false,
    automaticResolution: false,
  });
}
