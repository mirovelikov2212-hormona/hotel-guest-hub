import "server-only";

import {
  requireStaffDevelopmentIdentity,
} from "@/lib/server/staff-development-identity";
import {
  assertStaffDevelopmentWriteEnabled,
} from "@/lib/server/staff-development-persistence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  normalizeStaffAssessment,
} from "@/lib/staff-development/staff-assessment-model.mjs";

const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

type DevelopmentIdentity = {
  hotelId: string;
  staffUserId: string;
  staffUserRole: string;
  operationalRole: string;
  departmentId: string | null;
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uuid(value: unknown, code: string) {
  const id = clean(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function assessmentKey(value: unknown) {
  const key = clean(value).toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_KEY_INVALID");
  }
  return key;
}

async function requireManagerIdentity(
  hotelSlug: unknown,
): Promise<DevelopmentIdentity> {
  const identity = await requireStaffDevelopmentIdentity(hotelSlug);
  if (
    identity.staffUserRole !== "department_manager"
    && identity.staffUserRole !== "hotel_manager"
  ) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_MANAGER_REQUIRED");
  }
  return identity;
}

async function loadPlanWithScope(input: {
  identity: DevelopmentIdentity;
  trainingPlanRevisionId: unknown;
}) {
  const trainingPlanRevisionId = uuid(
    input.trainingPlanRevisionId,
    "STAFF_ASSESSMENT_AUTHORING_PLAN_ID_INVALID",
  );

  const { data: plan, error: planError } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .select(
      "id,hotel_id,standard_revision_id,source_standard_hash,training_plan_hash,plan_json",
    )
    .eq("hotel_id", input.identity.hotelId)
    .eq("id", trainingPlanRevisionId)
    .maybeSingle();

  if (
    planError
    || !plan
    || !isRecord(plan.plan_json)
  ) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_PLAN_NOT_FOUND");
  }

  const { data: standard, error: standardError } = await supabaseAdmin
    .from("hotel_staff_standard_revisions")
    .select("id,hotel_id,lifecycle_status,standard_json")
    .eq("hotel_id", input.identity.hotelId)
    .eq("id", plan.standard_revision_id)
    .eq("lifecycle_status", "published")
    .maybeSingle();

  if (
    standardError
    || !standard
    || !isRecord(standard.standard_json)
  ) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_STANDARD_NOT_FOUND");
  }

  const standardScope = clean(
    standard.standard_json.standardScope,
  ).toLowerCase();
  const departments = Array.isArray(standard.standard_json.departmentCodes)
    ? standard.standard_json.departmentCodes
        .map((value) => clean(value).toLowerCase())
        .filter(Boolean)
    : [];

  if (
    (standardScope !== "hotel" && standardScope !== "department")
    || (standardScope === "hotel" && departments.length !== 0)
    || (standardScope === "department" && departments.length < 1)
  ) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_STANDARD_SCOPE_INVALID");
  }

  if (
    input.identity.staffUserRole === "department_manager"
    && (
      standardScope !== "department"
      || departments.length !== 1
      || departments[0] !== input.identity.operationalRole
    )
  ) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_MANAGER_SCOPE_FORBIDDEN");
  }

  const units = Array.isArray(plan.plan_json.units)
    ? plan.plan_json.units
        .map((unit) =>
          isRecord(unit) ? clean(unit.unitId).toLowerCase() : "",
        )
        .filter(Boolean)
    : [];

  if (!units.length) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_PLAN_UNITS_INVALID");
  }

  return {
    ...plan,
    id: String(plan.id),
    standardRevisionId: String(plan.standard_revision_id),
    trainingPlanHash: String(plan.training_plan_hash),
    sourceStandardHash: String(plan.source_standard_hash),
    units,
    standardScope,
    departments,
  };
}

async function loadAuthoring(input: {
  identity: DevelopmentIdentity;
  authoringId: unknown;
  allowedStatuses?: string[];
}) {
  const authoringId = uuid(
    input.authoringId,
    "STAFF_ASSESSMENT_AUTHORING_ID_INVALID",
  );

  let query = supabaseAdmin
    .from("staff_assessment_authoring")
    .select(
      "id,hotel_id,training_plan_revision_id,status,assessment_key,structured_proposal_json,proposal_hash,created_by_staff_user_id,approved_by_staff_user_id,published_assessment_revision_id,created_at,updated_at,approved_at,published_at",
    )
    .eq("hotel_id", input.identity.hotelId)
    .eq("id", authoringId);

  if (input.allowedStatuses?.length) {
    query = query.in("status", input.allowedStatuses);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_NOT_FOUND");
  }

  const plan = await loadPlanWithScope({
    identity: input.identity,
    trainingPlanRevisionId: data.training_plan_revision_id,
  });

  return {
    ...data,
    id: String(data.id),
    assessment_key: String(data.assessment_key),
    plan,
  };
}

async function appendEvent(input: {
  identity: DevelopmentIdentity;
  authoringId: string;
  eventType: string;
  payload?: JsonObject;
}) {
  const { error } = await supabaseAdmin
    .from("staff_assessment_authoring_events")
    .insert({
      hotel_id: input.identity.hotelId,
      authoring_id: input.authoringId,
      event_type: input.eventType,
      actor_staff_user_id: input.identity.staffUserId,
      payload_json: input.payload || {},
    });

  if (error) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_EVENT_PERSIST_FAILED");
  }
}

export async function createStaffAssessmentAuthoringDraft(input: {
  hotelSlug: unknown;
  trainingPlanRevisionId: unknown;
  assessmentKey: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const plan = await loadPlanWithScope({
    identity,
    trainingPlanRevisionId: input.trainingPlanRevisionId,
  });
  const key = assessmentKey(input.assessmentKey);

  const { data, error } = await supabaseAdmin
    .from("staff_assessment_authoring")
    .insert({
      hotel_id: identity.hotelId,
      training_plan_revision_id: plan.id,
      status: "draft",
      assessment_key: key,
      created_by_staff_user_id: identity.staffUserId,
    })
    .select(
      "id,hotel_id,training_plan_revision_id,status,assessment_key,created_at,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(
      error?.message || "STAFF_ASSESSMENT_AUTHORING_CREATE_FAILED",
    );
  }

  await appendEvent({
    identity,
    authoringId: String(data.id),
    eventType: "draft_created",
    payload: {
      assessmentKey: key,
      trainingPlanRevisionId: plan.id,
      trainingPlanHash: plan.trainingPlanHash,
      sourceStandardHash: plan.sourceStandardHash,
    },
  });

  return data;
}

export async function saveStaffAssessmentAuthoringProposal(input: {
  hotelSlug: unknown;
  authoringId: unknown;
  proposal: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["draft", "proposal_ready"],
  });

  if (!isRecord(input.proposal)) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_PROPOSAL_INVALID");
  }

  const normalized = normalizeStaffAssessment({
    ...input.proposal,
    assessmentKey: authoring.assessment_key,
    revisionNo: 1,
    sourceTrainingPlanHash: authoring.plan.trainingPlanHash,
    sourceStandardHash: authoring.plan.sourceStandardHash,
    trainingUnitIds: authoring.plan.units,
  });

  const proposalHash = normalized.assessmentHash;

  const { data, error } = await supabaseAdmin
    .from("staff_assessment_authoring")
    .update({
      structured_proposal_json: normalized,
      proposal_hash: proposalHash,
      status: "proposal_ready",
      approved_by_staff_user_id: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("hotel_id", identity.hotelId)
    .eq("id", authoring.id)
    .in("status", ["draft", "proposal_ready"])
    .select(
      "id,hotel_id,training_plan_revision_id,status,assessment_key,structured_proposal_json,proposal_hash,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_PROPOSAL_SAVE_FAILED");
  }

  await appendEvent({
    identity,
    authoringId: authoring.id,
    eventType: "proposal_saved",
    payload: {
      proposalHash,
      questionCount: normalized.questions.length,
      trainingPlanRevisionId: authoring.plan.id,
    },
  });

  return data;
}

export async function listStaffAssessmentAuthoring(input: {
  hotelSlug: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);

  const { data, error } = await supabaseAdmin
    .from("staff_assessment_authoring")
    .select(
      "id,hotel_id,training_plan_revision_id,status,assessment_key,structured_proposal_json,proposal_hash,created_by_staff_user_id,approved_by_staff_user_id,published_assessment_revision_id,created_at,updated_at,approved_at,published_at",
    )
    .eq("hotel_id", identity.hotelId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_LIST_FAILED");
  }

  if (identity.staffUserRole === "hotel_manager") {
    return data || [];
  }

  const visible = [];
  for (const row of data || []) {
    try {
      await loadPlanWithScope({
        identity,
        trainingPlanRevisionId: row.training_plan_revision_id,
      });
      visible.push(row);
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "STAFF_ASSESSMENT_AUTHORING_MANAGER_SCOPE_FORBIDDEN"
      ) {
        continue;
      }
      throw error;
    }
  }

  return visible;
}

export async function publishStaffAssessmentAuthoring(input: {
  hotelSlug: unknown;
  authoringId: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["proposal_ready"],
  });

  if (
    !isRecord(authoring.structured_proposal_json)
    || !/^[a-f0-9]{64}$/.test(clean(authoring.proposal_hash))
  ) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_NOT_READY");
  }

  const { data: latestRows, error: latestError } = await supabaseAdmin
    .from("staff_assessment_revisions")
    .select("revision_no")
    .eq("hotel_id", identity.hotelId)
    .eq("assessment_key", authoring.assessment_key)
    .order("revision_no", { ascending: false })
    .limit(1);

  if (latestError) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_REVISION_READ_FAILED");
  }

  const revisionNo = Number(latestRows?.[0]?.revision_no || 0) + 1;
  const assessment = normalizeStaffAssessment({
    ...authoring.structured_proposal_json,
    assessmentKey: authoring.assessment_key,
    revisionNo,
    sourceTrainingPlanHash: authoring.plan.trainingPlanHash,
    sourceStandardHash: authoring.plan.sourceStandardHash,
    trainingUnitIds: authoring.plan.units,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "publish_staff_assessment_authoring_v1",
    {
      p_hotel_id: identity.hotelId,
      p_authoring_id: authoring.id,
      p_actor_staff_user_id: identity.staffUserId,
      p_proposal_hash: authoring.proposal_hash,
      p_assessment_json: assessment,
    },
  );

  if (error) {
    throw new Error(
      error.message || "STAFF_ASSESSMENT_AUTHORING_PUBLISH_FAILED",
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("STAFF_ASSESSMENT_AUTHORING_PUBLISH_EMPTY");
  }

  return {
    ...row,
    assessment,
  };
}
