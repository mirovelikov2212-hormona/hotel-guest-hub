import "server-only";

import {
  buildManagerIntelligenceKpis,
  buildRecommendationCandidates,
  MANAGER_INTELLIGENCE_MEASUREMENT_DAYS,
  measureRecommendationImpact,
} from "@/lib/manager-intelligence/action-loop.mjs";
import { resolveManagerIntelligenceScope } from "@/lib/server/manager-intelligence-scope";
import { logSystemError } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, any>;

const RECOMMENDATION_LOOKBACK_DAYS = 7;
const RECOMMENDATION_EXPIRY_DAYS = 7;
const HISTORY_LIMIT = 80;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function recommendationRow(row: JsonObject) {
  return {
    id: clean(row.id),
    hotelId: clean(row.hotel_id),
    fingerprint: clean(row.fingerprint),
    sourceType: clean(row.source_type),
    sourceRef: clean(row.source_ref) || null,
    incidentId: clean(row.incident_id) || null,
    module: clean(row.module),
    department: clean(row.department) || null,
    actionMode: clean(row.action_mode),
    actionType: clean(row.action_type),
    status: clean(row.status),
    title: clean(row.title),
    problem: clean(row.problem),
    recommendation: clean(row.recommendation),
    expectedOutcome: clean(row.expected_outcome),
    evidenceQuality: clean(row.evidence_quality),
    confidence: row.confidence === null ? null : Number(row.confidence),
    evidence: record(row.evidence_json),
    actionPayload: record(row.action_payload_json),
    baseline: record(row.baseline_json),
    previousValue: row.previous_value_json ? record(row.previous_value_json) : null,
    newValue: row.new_value_json ? record(row.new_value_json) : null,
    managerDecision: clean(row.manager_decision) || null,
    decisionAt: clean(row.decision_at) || null,
    viewedAt: clean(row.viewed_at) || null,
    approvedAt: clean(row.approved_at) || null,
    rejectedAt: clean(row.rejected_at) || null,
    executionStatus: clean(row.execution_status),
    executionReferenceType: clean(row.execution_reference_type) || null,
    executionReferenceId: clean(row.execution_reference_id) || null,
    executedAt: clean(row.executed_at) || null,
    measurementWindowStart: clean(row.measurement_window_start) || null,
    measurementWindowEnd: clean(row.measurement_window_end) || null,
    impactBasis: clean(row.impact_basis) || null,
    impactOutcome: clean(row.impact_outcome) || null,
    impact: row.impact_json ? record(row.impact_json) : null,
    expiresAt: clean(row.expires_at) || null,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
}

async function writeEvent(input: {
  hotelId: string;
  recommendationId: string;
  eventType: string;
  actorSessionId?: string | null;
  payload?: JsonObject;
}) {
  const { error } = await supabaseAdmin
    .from("manager_intelligence_recommendation_events")
    .insert({
      hotel_id: input.hotelId,
      recommendation_id: input.recommendationId,
      event_type: input.eventType,
      actor_session_id: input.actorSessionId || null,
      payload_json: input.payload || {},
    });

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_EVENT_WRITE_FAILED:${error.message}`);
  }
}

async function readEvidence(input: {
  hotelId: string;
  from: string;
  to: string;
  includeTest: boolean;
}) {
  let requestsQuery = supabaseAdmin
    .from("guest_requests")
    .select("id,request_type,status,created_at,started_at,resolved_at,is_test,metadata_json,source,channel")
    .eq("hotel_id", input.hotelId)
    .gte("created_at", input.from)
    .lt("created_at", input.to)
    .order("created_at", { ascending: true })
    .limit(8000);

  let eventsQuery = supabaseAdmin
    .from("hub_events")
    .select("id,event_name,request_id,created_at,is_test,extra,section,item_key,label,value")
    .eq("hotel_id", input.hotelId)
    .gte("created_at", input.from)
    .lt("created_at", input.to)
    .order("created_at", { ascending: true })
    .limit(16000);

  const systemEventsQuery = supabaseAdmin
    .from("system_events")
    .select("id,event_type,source,severity,message,created_at,resolved_at,metadata_json")
    .eq("hotel_id", input.hotelId)
    .gte("created_at", input.from)
    .lt("created_at", input.to)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (!input.includeTest) {
    requestsQuery = requestsQuery.or("is_test.is.null,is_test.eq.false");
    eventsQuery = eventsQuery.or("is_test.is.null,is_test.eq.false");
  }

  const [requestsResult, eventsResult, systemEventsResult] = await Promise.all([
    requestsQuery,
    eventsQuery,
    systemEventsQuery,
  ]);

  if (requestsResult.error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_REQUESTS_READ_FAILED:${requestsResult.error.message}`);
  }
  if (eventsResult.error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_EVENTS_READ_FAILED:${eventsResult.error.message}`);
  }
  if (systemEventsResult.error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_SYSTEM_EVENTS_READ_FAILED:${systemEventsResult.error.message}`);
  }

  return {
    requests: requestsResult.data || [],
    events: eventsResult.data || [],
    systemEvents: systemEventsResult.data || [],
  };
}

async function expireStaleRecommendations(input: {
  hotelId: string;
  sessionId?: string | null;
  now: Date;
}) {
  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .select("id,status,expires_at")
    .eq("hotel_id", input.hotelId)
    .in("status", ["generated", "viewed"])
    .is("manager_decision", null)
    .lt("expires_at", input.now.toISOString())
    .limit(100);

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_EXPIRY_READ_FAILED:${error.message}`);
  }

  for (const row of data || []) {
    const { error: updateError } = await supabaseAdmin
      .from("manager_intelligence_recommendations")
      .update({
        status: "expired",
        updated_at: input.now.toISOString(),
      })
      .eq("id", row.id)
      .eq("hotel_id", input.hotelId)
      .in("status", ["generated", "viewed"]);

    if (updateError) {
      throw new Error(`MANAGER_INTELLIGENCE_ACTION_EXPIRY_WRITE_FAILED:${updateError.message}`);
    }

    await writeEvent({
      hotelId: input.hotelId,
      recommendationId: String(row.id),
      eventType: "expired",
      actorSessionId: input.sessionId || null,
      payload: {
        expiredAt: input.now.toISOString(),
        reason: "manager_decision_timeout",
      },
    });
  }
}

async function ensureGeneratedRecommendations(input: {
  hotelId: string;
  sessionId: string;
  timeZone: string;
  includeTest: boolean;
  now: Date;
}) {
  const periodEnd = input.now.toISOString();
  const periodStart = addDays(input.now, -RECOMMENDATION_LOOKBACK_DAYS).toISOString();
  const evidence = await readEvidence({
    hotelId: input.hotelId,
    from: periodStart,
    to: periodEnd,
    includeTest: input.includeTest,
  });

  const candidates = buildRecommendationCandidates({
    ...evidence,
    timeZone: input.timeZone,
    periodStart,
    periodEnd,
  });

  if (!candidates.length) return [];

  const fingerprints = candidates.map((candidate) => candidate.fingerprint);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .select("id,fingerprint")
    .eq("hotel_id", input.hotelId)
    .in("fingerprint", fingerprints);

  if (existingError) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_EXISTING_READ_FAILED:${existingError.message}`);
  }

  const existingFingerprints = new Set((existing || []).map((row) => clean(row.fingerprint)));
  const inserted: string[] = [];

  for (const candidate of candidates) {
    if (existingFingerprints.has(candidate.fingerprint)) continue;

    const nowIso = input.now.toISOString();
    const { data: created, error: createError } = await supabaseAdmin
      .from("manager_intelligence_recommendations")
      .insert({
        hotel_id: input.hotelId,
        fingerprint: candidate.fingerprint,
        source_type: candidate.sourceType,
        source_ref: candidate.sourceRef,
        incident_id: candidate.incidentId,
        module: candidate.module,
        department: candidate.department,
        action_mode: candidate.actionMode,
        action_type: candidate.actionType,
        status: "generated",
        title: candidate.title,
        problem: candidate.problem,
        recommendation: candidate.recommendation,
        expected_outcome: candidate.expectedOutcome,
        evidence_quality: candidate.evidenceQuality,
        confidence: candidate.confidence,
        evidence_json: candidate.evidence,
        action_payload_json: candidate.actionPayload,
        baseline_json: candidate.baseline,
        execution_status:
          candidate.actionMode === "recommendation_only" ? "not_applicable" : "not_started",
        expires_at: addDays(input.now, RECOMMENDATION_EXPIRY_DAYS).toISOString(),
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (createError) {
      if (createError.code === "23505") continue;
      throw new Error(`MANAGER_INTELLIGENCE_ACTION_CREATE_FAILED:${createError.message}`);
    }

    const id = String(created.id);
    inserted.push(id);
    await writeEvent({
      hotelId: input.hotelId,
      recommendationId: id,
      eventType: "generated",
      payload: {
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        incidentId: candidate.incidentId,
        evidenceQuality: candidate.evidenceQuality,
        confidence: candidate.confidence,
        observationPeriod: {
          from: periodStart,
          to: periodEnd,
        },
      },
    });
  }

  return inserted;
}

async function measureDueRecommendations(input: {
  hotelId: string;
  timeZone: string;
  includeTest: boolean;
  now: Date;
}) {
  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .select("*")
    .eq("hotel_id", input.hotelId)
    .not("executed_at", "is", null)
    .is("impact_json", null)
    .lte("measurement_window_end", input.now.toISOString())
    .in("status", ["executed", "measurement_pending"])
    .order("measurement_window_end", { ascending: true })
    .limit(30);

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_MEASUREMENT_DUE_READ_FAILED:${error.message}`);
  }

  for (const row of data || []) {
    const from = clean(row.measurement_window_start || row.executed_at);
    const to = clean(row.measurement_window_end);
    if (!from || !to) continue;

    await writeEvent({
      hotelId: input.hotelId,
      recommendationId: String(row.id),
      eventType: "measurement_started",
      payload: { from, to },
    });

    const evidence = await readEvidence({
      hotelId: input.hotelId,
      from,
      to,
      includeTest: input.includeTest,
    });

    const impact = measureRecommendationImpact({
      recommendation: row,
      ...evidence,
      timeZone: input.timeZone,
      periodStart: from,
      periodEnd: to,
    }) as JsonObject;

    const basis = clean(impact.basis) || "insufficient_data";
    const outcome = clean(impact.outcome) || "insufficient_data";
    const nowIso = input.now.toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("manager_intelligence_recommendations")
      .update({
        status: "measured",
        impact_basis: basis,
        impact_outcome: outcome,
        impact_json: impact,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("hotel_id", input.hotelId);

    if (updateError) {
      throw new Error(`MANAGER_INTELLIGENCE_MEASUREMENT_WRITE_FAILED:${updateError.message}`);
    }

    await writeEvent({
      hotelId: input.hotelId,
      recommendationId: String(row.id),
      eventType: "measurement_calculated",
      payload: {
        basis,
        outcome,
        impact,
      },
    });
  }
}

async function readRecommendations(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_HISTORY_READ_FAILED:${error.message}`);
  }

  return (data || []).map((row) => recommendationRow(row as JsonObject));
}

async function readRecommendationEvents(hotelId: string, recommendationIds: string[]) {
  if (!recommendationIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendation_events")
    .select("id,recommendation_id,event_type,actor_session_id,payload_json,created_at")
    .eq("hotel_id", hotelId)
    .in("recommendation_id", recommendationIds)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_EVENTS_HISTORY_READ_FAILED:${error.message}`);
  }

  return (data || []).map((row) => ({
    id: clean(row.id),
    recommendationId: clean(row.recommendation_id),
    eventType: clean(row.event_type),
    actorSessionId: clean(row.actor_session_id) || null,
    payload: record(row.payload_json),
    createdAt: clean(row.created_at),
  }));
}

function currentRecommendations(rows: ReturnType<typeof recommendationRow>[]) {
  return rows.filter((row) =>
    ["generated", "viewed", "approved", "execution_pending"].includes(row.status),
  );
}

export async function getManagerIntelligenceActionLoop(input: {
  hotelSlug: unknown;
  now?: Date;
}) {
  const scope = await resolveManagerIntelligenceScope(input.hotelSlug);
  const now = input.now || new Date();
  const includeTest = scope.isSandbox || scope.slug === "demo";

  try {
    await expireStaleRecommendations({
      hotelId: scope.id,
      sessionId: scope.sessionId,
      now,
    });

    await ensureGeneratedRecommendations({
      hotelId: scope.id,
      sessionId: scope.sessionId,
      timeZone: scope.timezone,
      includeTest,
      now,
    });

    await measureDueRecommendations({
      hotelId: scope.id,
      timeZone: scope.timezone,
      includeTest,
      now,
    });
  } catch (error) {
    await logSystemError({
      hotelId: scope.id,
      severity: "error",
      source: "staff_hub",
      eventType: "manager_intelligence_action_loop_refresh_failed",
      message: "Manager Intelligence action/impact loop could not refresh.",
      error,
      metadata: {
        module: "manager_intelligence",
        hotelSlug: scope.slug,
      },
    });
    throw error;
  }

  const rows = await readRecommendations(scope.id);
  const events = await readRecommendationEvents(scope.id, rows.map((row) => row.id));
  const kpis = buildManagerIntelligenceKpis(
    rows.map((row) => ({
      created_at: row.createdAt,
      viewed_at: row.viewedAt,
      manager_decision: row.managerDecision,
      decision_at: row.decisionAt,
      approved_at: row.approvedAt,
      executed_at: row.executedAt,
      execution_status: row.executionStatus,
      impact_basis: row.impactBasis,
      impact_outcome: row.impactOutcome,
      status: row.status,
    })),
  );

  return {
    schemaVersion: "manager-intelligence-action-loop-v1",
    hotel: {
      id: scope.id,
      slug: scope.slug,
    },
    recommendedActions: currentRecommendations(rows).slice(0, 8),
    history: rows,
    events,
    kpis,
  };
}

async function ownedRecommendation(input: {
  hotelId: string;
  recommendationId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .select("*")
    .eq("hotel_id", input.hotelId)
    .eq("id", input.recommendationId)
    .maybeSingle();

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_READ_FAILED:${error.message}`);
  }
  if (!data) throw new Error("MANAGER_INTELLIGENCE_ACTION_NOT_FOUND");
  return data as JsonObject;
}

export async function markManagerIntelligenceRecommendationViewed(input: {
  hotelSlug: unknown;
  recommendationId: unknown;
}) {
  const scope = await resolveManagerIntelligenceScope(input.hotelSlug);
  const recommendationId = clean(input.recommendationId);
  const row = await ownedRecommendation({ hotelId: scope.id, recommendationId });
  if (row.viewed_at) return recommendationRow(row);

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .update({
      viewed_at: now,
      status: row.status === "generated" ? "viewed" : row.status,
      updated_at: now,
    })
    .eq("hotel_id", scope.id)
    .eq("id", recommendationId)
    .select("*")
    .single();

  if (error) throw new Error(`MANAGER_INTELLIGENCE_ACTION_VIEW_FAILED:${error.message}`);

  await writeEvent({
    hotelId: scope.id,
    recommendationId,
    eventType: "viewed",
    actorSessionId: scope.sessionId,
  });

  return recommendationRow(data as JsonObject);
}

export async function decideManagerIntelligenceRecommendation(input: {
  hotelSlug: unknown;
  recommendationId: unknown;
  decision: unknown;
}) {
  const scope = await resolveManagerIntelligenceScope(input.hotelSlug);
  const recommendationId = clean(input.recommendationId);
  const decision = clean(input.decision).toLowerCase();
  if (!["approved", "rejected"].includes(decision)) {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_DECISION_INVALID");
  }

  const row = await ownedRecommendation({ hotelId: scope.id, recommendationId });
  if (row.manager_decision) {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_ALREADY_DECIDED");
  }
  if (!["generated", "viewed"].includes(clean(row.status))) {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_DECISION_STATE_INVALID");
  }

  const now = new Date().toISOString();
  const approved = decision === "approved";
  const actionMode = clean(row.action_mode);
  const status = approved
    ? actionMode === "recommendation_only" ? "executed" : "approved"
    : "rejected";
  const executionStatus = approved
    ? actionMode === "recommendation_only" ? "not_applicable" : actionMode === "manual_action" ? "manual_required" : "pending"
    : clean(row.execution_status);

  const patch: JsonObject = {
    manager_decision: decision,
    decision_at: now,
    decided_by_session_id: scope.sessionId,
    status,
    execution_status: executionStatus,
    updated_at: now,
  };
  if (approved) patch.approved_at = now;
  else patch.rejected_at = now;

  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .update(patch)
    .eq("hotel_id", scope.id)
    .eq("id", recommendationId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_DECISION_WRITE_FAILED:${error.message}`);
  }

  await writeEvent({
    hotelId: scope.id,
    recommendationId,
    eventType: approved ? "approved" : "rejected",
    actorSessionId: scope.sessionId,
    payload: {
      actionMode,
      actionType: clean(row.action_type),
    },
  });

  return recommendationRow(data as JsonObject);
}

export async function executeManagerIntelligenceRecommendation(input: {
  hotelSlug: unknown;
  recommendationId: unknown;
  executionNote?: unknown;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  const scope = await resolveManagerIntelligenceScope(input.hotelSlug);
  const recommendationId = clean(input.recommendationId);
  const row = await ownedRecommendation({ hotelId: scope.id, recommendationId });

  if (clean(row.manager_decision) !== "approved") {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_APPROVAL_REQUIRED");
  }
  if (row.executed_at) {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_ALREADY_EXECUTED");
  }

  const actionMode = clean(row.action_mode);
  if (actionMode === "recommendation_only") {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_NOT_EXECUTABLE");
  }

  if (actionMode === "manager_approved_configuration") {
    return {
      recommendation: recommendationRow(row),
      executionBlocked: true,
      reason: "existing_manager_change_workflow_required",
      safeHandoff: record(row.action_payload_json).safeConfigurationHandoff || "manager_change_workflow",
    };
  }

  if (actionMode !== "manual_action") {
    throw new Error("MANAGER_INTELLIGENCE_ACTION_MODE_INVALID");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const measurementEnd = addDays(now, MANAGER_INTELLIGENCE_MEASUREMENT_DAYS).toISOString();
  const executionNote = clean(input.executionNote).slice(0, 1000);

  await writeEvent({
    hotelId: scope.id,
    recommendationId,
    eventType: "execution_started",
    actorSessionId: scope.sessionId,
    payload: {
      actionType: clean(row.action_type),
      actionMode,
    },
  });

  const previousValue = record(input.previousValue);
  const newValue = record(input.newValue);
  const { data, error } = await supabaseAdmin
    .from("manager_intelligence_recommendations")
    .update({
      status: "measurement_pending",
      execution_status: "completed",
      execution_reference_type: "manual_action",
      execution_reference_id: null,
      executed_by_session_id: scope.sessionId,
      executed_at: nowIso,
      measurement_window_start: nowIso,
      measurement_window_end: measurementEnd,
      previous_value_json: Object.keys(previousValue).length
        ? previousValue
        : record(row.baseline_json),
      new_value_json: Object.keys(newValue).length
        ? newValue
        : {
            executionNote: executionNote || null,
            actionType: clean(row.action_type),
          },
      updated_at: nowIso,
    })
    .eq("hotel_id", scope.id)
    .eq("id", recommendationId)
    .select("*")
    .single();

  if (error) {
    await writeEvent({
      hotelId: scope.id,
      recommendationId,
      eventType: "execution_failed",
      actorSessionId: scope.sessionId,
      payload: { error: error.message },
    }).catch(() => undefined);
    throw new Error(`MANAGER_INTELLIGENCE_ACTION_EXECUTION_WRITE_FAILED:${error.message}`);
  }

  await writeEvent({
    hotelId: scope.id,
    recommendationId,
    eventType: "executed",
    actorSessionId: scope.sessionId,
    payload: {
      executionNote: executionNote || null,
      measurementWindowStart: nowIso,
      measurementWindowEnd: measurementEnd,
      previousValue: Object.keys(previousValue).length ? previousValue : record(row.baseline_json),
      newValue: Object.keys(newValue).length ? newValue : null,
    },
  });

  return {
    recommendation: recommendationRow(data as JsonObject),
    measurementWindow: {
      from: nowIso,
      to: measurementEnd,
    },
  };
}
