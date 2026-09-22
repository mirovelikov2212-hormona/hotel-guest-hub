import "server-only";

import {
  requireStaffDevelopmentIdentity,
  provisionStaffDevelopmentCredential,
} from "@/lib/server/staff-development-identity";
import {
  assignStaffTraining,
  completeStaffTraining,
  evaluateAndPersistStaffHrRules,
  materializeStaffTrainingPlanRevision,
  persistHotelStaffStandardRevision,
  persistStaffAssessmentRevision,
  persistStaffHrRuleRevision,
  recordStaffAssessmentAttempt,
  verifyStaffAssessmentAttempt,
} from "@/lib/server/staff-development-persistence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,119}$/;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function key(value: unknown, code: string) {
  const result = clean(value).toLowerCase();
  if (!KEY_RE.test(result)) throw new Error(code);
  return result;
}

async function requireManagerIdentity(hotelSlug: unknown) {
  const identity = await requireStaffDevelopmentIdentity(hotelSlug);
  if (
    identity.staffUserRole !== "department_manager"
    && identity.staffUserRole !== "hotel_manager"
  ) {
    throw new Error("STAFF_DEVELOPMENT_MANAGER_IDENTITY_REQUIRED");
  }
  return identity;
}

async function activeTargetStaffUser(input: {
  hotelId: string;
  targetStaffUserId: unknown;
}) {
  const targetStaffUserId = clean(input.targetStaffUserId).toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("staff_users")
    .select("id,hotel_id,department_id,full_name,role,active")
    .eq("hotel_id", input.hotelId)
    .eq("id", targetStaffUserId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("STAFF_DEVELOPMENT_TARGET_STAFF_NOT_FOUND");
  }

  return {
    id: String(data.id),
    hotelId: String(data.hotel_id),
    departmentId: data.department_id ? String(data.department_id) : null,
    fullName: data.full_name ? String(data.full_name) : null,
    role: clean(data.role).toLowerCase(),
  };
}

function assertManagerCanManageTarget(
  identity: Awaited<ReturnType<typeof requireManagerIdentity>>,
  target: Awaited<ReturnType<typeof activeTargetStaffUser>>,
) {
  if (identity.staffUserRole === "hotel_manager") return;

  if (
    !identity.departmentId
    || !target.departmentId
    || identity.departmentId !== target.departmentId
    || target.role === "hotel_manager"
  ) {
    throw new Error("STAFF_DEVELOPMENT_MANAGER_SCOPE_FORBIDDEN");
  }
}

async function nextRevisionNo(input: {
  kind: "standard" | "assessment" | "hr_rules";
  hotelId: string;
  keyValue: string;
}) {
  let data: Array<{ revision_no: number | string }> | null = null;
  let error: { message?: string } | null = null;

  if (input.kind === "standard") {
    const result = await supabaseAdmin
      .from("hotel_staff_standard_revisions")
      .select("revision_no")
      .eq("hotel_id", input.hotelId)
      .eq("standard_key", input.keyValue)
      .order("revision_no", { ascending: false })
      .limit(1);
    data = result.data;
    error = result.error;
  } else if (input.kind === "assessment") {
    const result = await supabaseAdmin
      .from("staff_assessment_revisions")
      .select("revision_no")
      .eq("hotel_id", input.hotelId)
      .eq("assessment_key", input.keyValue)
      .order("revision_no", { ascending: false })
      .limit(1);
    data = result.data;
    error = result.error;
  } else {
    const result = await supabaseAdmin
      .from("hotel_staff_hr_rule_revisions")
      .select("revision_no")
      .eq("hotel_id", input.hotelId)
      .eq("rule_set_key", input.keyValue)
      .order("revision_no", { ascending: false })
      .limit(1);
    data = result.data;
    error = result.error;
  }

  if (error) throw new Error("STAFF_DEVELOPMENT_REVISION_READ_FAILED");
  const current = Number(data?.[0]?.revision_no || 0);
  if (!Number.isInteger(current) || current < 0) {
    throw new Error("STAFF_DEVELOPMENT_REVISION_STATE_INVALID");
  }
  return current + 1;
}

async function assertPlanWithinManagerScope(input: {
  identity: Awaited<ReturnType<typeof requireManagerIdentity>>;
  trainingPlanRevisionId: unknown;
  allowHotelScopeForDepartmentManager?: boolean;
}) {
  const trainingPlanRevisionId = clean(input.trainingPlanRevisionId).toLowerCase();

  const { data: plan, error: planError } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .select("id,hotel_id,standard_revision_id")
    .eq("hotel_id", input.identity.hotelId)
    .eq("id", trainingPlanRevisionId)
    .maybeSingle();

  if (planError || !plan) {
    throw new Error("STAFF_TRAINING_PLAN_NOT_FOUND");
  }

  if (input.identity.staffUserRole === "hotel_manager") {
    return String(plan.id);
  }

  const { data: standard, error: standardError } = await supabaseAdmin
    .from("hotel_staff_standard_revisions")
    .select("id,standard_json")
    .eq("hotel_id", input.identity.hotelId)
    .eq("id", plan.standard_revision_id)
    .maybeSingle();

  if (
    standardError
    || !standard
    || !isRecord(standard.standard_json)
    || !Array.isArray(standard.standard_json.departmentCodes)
  ) {
    throw new Error("STAFF_STANDARD_REVISION_NOT_FOUND");
  }

  const standardScope = clean(
    standard.standard_json.standardScope,
  ).toLowerCase();
  const departments = standard.standard_json.departmentCodes
    .map((value) => clean(value).toLowerCase());

  if (standardScope === "hotel") {
    if (departments.length !== 0) {
      throw new Error("STAFF_STANDARD_REVISION_SCOPE_INVALID");
    }
    if (!input.allowHotelScopeForDepartmentManager) {
      throw new Error("STAFF_DEVELOPMENT_MANAGER_SCOPE_FORBIDDEN");
    }
    return String(plan.id);
  }

  if (
    standardScope !== "department"
    || !input.identity.operationalRole
    || departments.length !== 1
    || departments[0] !== input.identity.operationalRole
  ) {
    throw new Error("STAFF_DEVELOPMENT_MANAGER_SCOPE_FORBIDDEN");
  }

  return String(plan.id);
}

export async function publishStaffStandardAndTraining(input: {
  hotelSlug: unknown;
  standard: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  if (!isRecord(input.standard)) {
    throw new Error("STAFF_STANDARD_INVALID");
  }

  const standardKey = key(
    input.standard.standardKey,
    "STAFF_STANDARD_KEY_INVALID",
  );

  const standardScope = clean(
    input.standard.standardScope,
  ).toLowerCase();

  if (identity.staffUserRole === "department_manager") {
    if (
      standardScope !== "department"
      || !Array.isArray(input.standard.departmentCodes)
      || input.standard.departmentCodes.length !== 1
      || clean(input.standard.departmentCodes[0]).toLowerCase()
        !== identity.operationalRole
    ) {
      throw new Error("STAFF_DEVELOPMENT_MANAGER_SCOPE_FORBIDDEN");
    }
  }

  if (
    identity.staffUserRole === "hotel_manager"
    && standardScope === "hotel"
    && (
      !Array.isArray(input.standard.departmentCodes)
      || input.standard.departmentCodes.length !== 0
    )
  ) {
    throw new Error("STAFF_STANDARD_HOTEL_SCOPE_DEPARTMENTS_FORBIDDEN");
  }

  const revisionNo = await nextRevisionNo({
    kind: "standard",
    hotelId: identity.hotelId,
    keyValue: standardKey,
  });

  const standardRow = await persistHotelStaffStandardRevision({
    hotelId: identity.hotelId,
    createdByStaffUserId: identity.staffUserId,
    standard: {
      ...input.standard,
      standardKey,
      revisionNo,
      status: "published",
    },
  });

  const trainingPlanRow = await materializeStaffTrainingPlanRevision({
    hotelId: identity.hotelId,
    standardRevisionId: standardRow.id,
  });

  return {
    standard: standardRow,
    trainingPlan: trainingPlanRow,
  };
}

export async function assignTrainingToStaff(input: {
  hotelSlug: unknown;
  targetStaffUserId: unknown;
  trainingPlanRevisionId: unknown;
  dueAt?: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  const target = await activeTargetStaffUser({
    hotelId: identity.hotelId,
    targetStaffUserId: input.targetStaffUserId,
  });
  assertManagerCanManageTarget(identity, target);

  await assertPlanWithinManagerScope({
    identity,
    trainingPlanRevisionId: input.trainingPlanRevisionId,
    allowHotelScopeForDepartmentManager: true,
  });

  return assignStaffTraining({
    hotelId: identity.hotelId,
    staffUserId: target.id,
    trainingPlanRevisionId: input.trainingPlanRevisionId,
    assignedByStaffUserId: identity.staffUserId,
    assignedAt: new Date().toISOString(),
    dueAt: input.dueAt ?? null,
  });
}

export async function completeOwnTraining(input: {
  hotelSlug: unknown;
  assignmentId: unknown;
  completedUnitIds: unknown;
}) {
  const identity = await requireStaffDevelopmentIdentity(input.hotelSlug);

  return completeStaffTraining({
    hotelId: identity.hotelId,
    staffUserId: identity.staffUserId,
    assignmentId: input.assignmentId,
    completedUnitIds: input.completedUnitIds,
    completedAt: new Date().toISOString(),
  });
}

export async function publishStaffAssessment(input: {
  hotelSlug: unknown;
  trainingPlanRevisionId: unknown;
  assessment: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  await assertPlanWithinManagerScope({
    identity,
    trainingPlanRevisionId: input.trainingPlanRevisionId,
  });

  if (!isRecord(input.assessment)) {
    throw new Error("STAFF_ASSESSMENT_INVALID");
  }

  const assessmentKey = key(
    input.assessment.assessmentKey,
    "STAFF_ASSESSMENT_KEY_INVALID",
  );
  const revisionNo = await nextRevisionNo({
    kind: "assessment",
    hotelId: identity.hotelId,
    keyValue: assessmentKey,
  });

  return persistStaffAssessmentRevision({
    hotelId: identity.hotelId,
    trainingPlanRevisionId: input.trainingPlanRevisionId,
    assessment: {
      ...input.assessment,
      assessmentKey,
      revisionNo,
    },
  });
}

export async function submitOwnStaffAssessment(input: {
  hotelSlug: unknown;
  trainingAssignmentId: unknown;
  assessmentRevisionId: unknown;
  answers: unknown;
}) {
  const identity = await requireStaffDevelopmentIdentity(input.hotelSlug);

  return recordStaffAssessmentAttempt({
    hotelId: identity.hotelId,
    staffUserId: identity.staffUserId,
    trainingAssignmentId: input.trainingAssignmentId,
    assessmentRevisionId: input.assessmentRevisionId,
    answers: input.answers,
  });
}

export async function reviewStaffAssessment(input: {
  hotelSlug: unknown;
  assessmentAttemptId: unknown;
  reviews: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);

  return verifyStaffAssessmentAttempt({
    hotelId: identity.hotelId,
    assessmentAttemptId: input.assessmentAttemptId,
    reviewerStaffUserId: identity.staffUserId,
    reviewedAt: new Date().toISOString(),
    reviews: input.reviews,
  });
}

export async function setStaffDevelopmentPersonalPin(input: {
  hotelSlug: unknown;
  targetStaffUserId: unknown;
  personalPin: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  const target = await activeTargetStaffUser({
    hotelId: identity.hotelId,
    targetStaffUserId: input.targetStaffUserId,
  });
  assertManagerCanManageTarget(identity, target);

  return provisionStaffDevelopmentCredential({
    hotelId: identity.hotelId,
    staffUserId: target.id,
    personalPin: input.personalPin,
    createdByStaffUserId: identity.staffUserId,
  });
}

export async function publishStaffHrRules(input: {
  hotelSlug: unknown;
  ruleSet: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  if (identity.staffUserRole !== "hotel_manager") {
    throw new Error("STAFF_HR_HOTEL_MANAGER_REQUIRED");
  }
  if (!isRecord(input.ruleSet)) {
    throw new Error("STAFF_HR_RULE_SET_INVALID");
  }

  const ruleSetKey = key(
    input.ruleSet.ruleSetKey,
    "STAFF_HR_RULE_SET_KEY_INVALID",
  );
  const revisionNo = await nextRevisionNo({
    kind: "hr_rules",
    hotelId: identity.hotelId,
    keyValue: ruleSetKey,
  });

  return persistStaffHrRuleRevision({
    hotelId: identity.hotelId,
    createdByStaffUserId: identity.staffUserId,
    ruleSet: {
      ...input.ruleSet,
      ruleSetKey,
      revisionNo,
    },
  });
}

export async function evaluateStaffDevelopmentRules(input: {
  hotelSlug: unknown;
  targetStaffUserId: unknown;
  hrRuleRevisionId: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  if (identity.staffUserRole !== "hotel_manager") {
    throw new Error("STAFF_HR_HOTEL_MANAGER_REQUIRED");
  }
  const target = await activeTargetStaffUser({
    hotelId: identity.hotelId,
    targetStaffUserId: input.targetStaffUserId,
  });
  assertManagerCanManageTarget(identity, target);

  return evaluateAndPersistStaffHrRules({
    hotelId: identity.hotelId,
    staffUserId: target.id,
    hrRuleRevisionId: input.hrRuleRevisionId,
  });
}
