import "server-only";

import {
  deriveStaffTrainingPlan,
  normalizeHotelStaffStandard,
} from "@/lib/staff-development/hotel-standard-model.mjs";
import {
  gradeStaffAssessmentAttempt,
  normalizeStaffAssessment,
} from "@/lib/staff-development/staff-assessment-model.mjs";
import {
  verifyStaffAssessmentHumanReview,
} from "@/lib/staff-development/staff-assessment-review-model.mjs";
import {
  normalizeStaffHrRuleSet,
  evaluateStaffHrRules,
} from "@/lib/staff-development/staff-hr-rules-model.mjs";
import {
  buildStaffTrainingAssignment,
  completeStaffTrainingAssignment,
} from "@/lib/staff-development/staff-training-progress-model.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[a-f0-9]{64}$/i;
const ENABLED_VALUE = "1";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function hash(value: unknown, code: string) {
  const result = String(value || "").trim().toLowerCase();
  if (!HASH_RE.test(result)) throw new Error(code);
  return result;
}

export function isStaffDevelopmentWriteEnabled() {
  return String(
    process.env.STAFF_DEVELOPMENT_WRITES_ENABLED || "",
  ).trim() === ENABLED_VALUE;
}

export function assertStaffDevelopmentWriteEnabled() {
  if (!isStaffDevelopmentWriteEnabled()) {
    throw new Error("STAFF_DEVELOPMENT_WRITES_DISABLED");
  }
}

async function requireActiveStaffUser(input: {
  hotelId: string;
  staffUserId: string;
  allowedRoles?: string[];
}) {
  const query = supabaseAdmin
    .from("staff_users")
    .select("id,hotel_id,department_id,full_name,role,active,auth_user_id")
    .eq("hotel_id", input.hotelId)
    .eq("id", input.staffUserId)
    .eq("active", true);

  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("STAFF_DEVELOPMENT_STAFF_USER_NOT_FOUND");

  const role = String(data.role || "").trim().toLowerCase();
  if (
    input.allowedRoles?.length
    && !input.allowedRoles.includes(role)
  ) {
    throw new Error("STAFF_DEVELOPMENT_STAFF_ROLE_FORBIDDEN");
  }

  return { ...data, role };
}

export async function persistHotelStaffStandardRevision(input: {
  hotelId: unknown;
  standard: unknown;
  createdByStaffUserId?: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_STANDARD_HOTEL_ID_INVALID");
  const standard = normalizeHotelStaffStandard(input.standard);

  let creatorId: string | null = null;
  if (input.createdByStaffUserId) {
    creatorId = uuid(
      input.createdByStaffUserId,
      "STAFF_STANDARD_CREATOR_ID_INVALID",
    );
    await requireActiveStaffUser({
      hotelId,
      staffUserId: creatorId,
      allowedRoles: ["department_manager", "hotel_manager"],
    });
  }

  const { data, error } = await supabaseAdmin
    .from("hotel_staff_standard_revisions")
    .insert({
      hotel_id: hotelId,
      standard_key: standard.standardKey,
      revision_no: standard.revisionNo,
      lifecycle_status: standard.status,
      standard_hash: standard.standardHash,
      standard_json: standard,
      created_by_staff_user_id: creatorId,
    })
    .select("id,hotel_id,standard_key,revision_no,lifecycle_status,standard_hash,created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "STAFF_STANDARD_PERSIST_FAILED");
  }
  return data;
}

export async function materializeStaffTrainingPlanRevision(input: {
  hotelId: unknown;
  standardRevisionId: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_TRAINING_HOTEL_ID_INVALID");
  const standardRevisionId = uuid(
    input.standardRevisionId,
    "STAFF_STANDARD_REVISION_ID_INVALID",
  );

  const { data: standardRow, error: standardError } = await supabaseAdmin
    .from("hotel_staff_standard_revisions")
    .select("id,hotel_id,lifecycle_status,standard_hash,standard_json")
    .eq("hotel_id", hotelId)
    .eq("id", standardRevisionId)
    .eq("lifecycle_status", "published")
    .maybeSingle();

  if (standardError || !standardRow || !isRecord(standardRow.standard_json)) {
    throw new Error("STAFF_TRAINING_PUBLISHED_STANDARD_NOT_FOUND");
  }

  const plan = deriveStaffTrainingPlan(standardRow.standard_json);
  if (plan.sourceStandardHash !== standardRow.standard_hash) {
    throw new Error("STAFF_TRAINING_STANDARD_HASH_MISMATCH");
  }

  const { data, error } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .insert({
      hotel_id: hotelId,
      standard_revision_id: standardRevisionId,
      source_standard_hash: plan.sourceStandardHash,
      training_plan_hash: plan.trainingPlanHash,
      plan_json: plan,
    })
    .select("id,hotel_id,standard_revision_id,training_plan_hash,created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "STAFF_TRAINING_PLAN_PERSIST_FAILED");
  }
  return { ...data, plan };
}

export async function assignStaffTraining(input: {
  hotelId: unknown;
  staffUserId: unknown;
  trainingPlanRevisionId: unknown;
  assignedByStaffUserId?: unknown;
  assignedAt: unknown;
  dueAt?: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_TRAINING_HOTEL_ID_INVALID");
  const staffUserId = uuid(
    input.staffUserId,
    "STAFF_TRAINING_STAFF_USER_ID_INVALID",
  );
  const trainingPlanRevisionId = uuid(
    input.trainingPlanRevisionId,
    "STAFF_TRAINING_PLAN_REVISION_ID_INVALID",
  );

  await requireActiveStaffUser({ hotelId, staffUserId });

  let assignedByStaffUserId: string | null = null;
  if (input.assignedByStaffUserId) {
    assignedByStaffUserId = uuid(
      input.assignedByStaffUserId,
      "STAFF_TRAINING_ASSIGNER_STAFF_USER_ID_INVALID",
    );
    await requireActiveStaffUser({
      hotelId,
      staffUserId: assignedByStaffUserId,
      allowedRoles: ["department_manager", "hotel_manager"],
    });
  }

  const { data: planRow, error: planError } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .select("id,hotel_id,training_plan_hash,source_standard_hash,plan_json")
    .eq("hotel_id", hotelId)
    .eq("id", trainingPlanRevisionId)
    .maybeSingle();

  if (planError || !planRow) {
    throw new Error("STAFF_TRAINING_PLAN_NOT_FOUND");
  }

  const assignment = buildStaffTrainingAssignment({
    hotelId,
    staffUserId,
    trainingPlanRevisionId,
    trainingPlanHash: planRow.training_plan_hash,
    sourceStandardHash: planRow.source_standard_hash,
    assignedByStaffUserId,
    assignedAt: input.assignedAt,
    dueAt: input.dueAt ?? null,
  });

  if (!assignedByStaffUserId) {
    throw new Error("STAFF_TRAINING_ASSIGNER_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "assign_staff_training_v2",
    {
      p_hotel_id: hotelId,
      p_staff_user_id: staffUserId,
      p_training_plan_revision_id: trainingPlanRevisionId,
      p_assigned_by_staff_user_id: assignedByStaffUserId,
      p_assignment_json: assignment,
    },
  );

  if (error) {
    throw new Error(error.message || "STAFF_TRAINING_ASSIGNMENT_PERSIST_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("STAFF_TRAINING_ASSIGNMENT_PERSIST_EMPTY");

  return {
    ...row,
    hotel_id: hotelId,
    staff_user_id: staffUserId,
    training_plan_revision_id: trainingPlanRevisionId,
    assignment,
  };
}

export async function completeStaffTraining(input: {
  hotelId: unknown;
  staffUserId: unknown;
  assignmentId: unknown;
  completedUnitIds: unknown;
  completedAt: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_TRAINING_HOTEL_ID_INVALID");
  const staffUserId = uuid(
    input.staffUserId,
    "STAFF_TRAINING_STAFF_USER_ID_INVALID",
  );
  const assignmentId = uuid(
    input.assignmentId,
    "STAFF_TRAINING_ASSIGNMENT_ID_INVALID",
  );

  const { data: assignmentRow, error: assignmentError } = await supabaseAdmin
    .from("staff_training_assignments")
    .select("id,hotel_id,staff_user_id,training_plan_revision_id,assignment_hash,assignment_json")
    .eq("hotel_id", hotelId)
    .eq("id", assignmentId)
    .eq("staff_user_id", staffUserId)
    .maybeSingle();

  if (
    assignmentError
    || !assignmentRow
    || !isRecord(assignmentRow.assignment_json)
  ) {
    throw new Error("STAFF_TRAINING_ASSIGNMENT_NOT_FOUND");
  }

  const { data: planRow, error: planError } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .select("id,hotel_id,plan_json")
    .eq("hotel_id", hotelId)
    .eq("id", assignmentRow.training_plan_revision_id)
    .maybeSingle();

  if (planError || !planRow || !isRecord(planRow.plan_json)) {
    throw new Error("STAFF_TRAINING_PLAN_NOT_FOUND");
  }

  const completion = completeStaffTrainingAssignment({
    assignment: assignmentRow.assignment_json,
    trainingPlan: planRow.plan_json,
    completedUnitIds: input.completedUnitIds,
    completedAt: input.completedAt,
  });

  const { data, error } = await supabaseAdmin
    .from("staff_training_completions")
    .insert({
      hotel_id: hotelId,
      assignment_id: assignmentId,
      staff_user_id: staffUserId,
      completion_hash: completion.completionHash,
      completion_json: completion,
      completed_at: completion.completedAt,
    })
    .select("id,hotel_id,assignment_id,staff_user_id,completion_hash,completed_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "STAFF_TRAINING_COMPLETION_PERSIST_FAILED");
  }
  return { ...data, completion };
}

export async function persistStaffAssessmentRevision(input: {
  hotelId: unknown;
  trainingPlanRevisionId: unknown;
  assessment: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_ASSESSMENT_HOTEL_ID_INVALID");
  const trainingPlanRevisionId = uuid(
    input.trainingPlanRevisionId,
    "STAFF_TRAINING_PLAN_REVISION_ID_INVALID",
  );

  const { data: planRow, error: planError } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .select("id,hotel_id,training_plan_hash,source_standard_hash,plan_json")
    .eq("hotel_id", hotelId)
    .eq("id", trainingPlanRevisionId)
    .maybeSingle();

  if (planError || !planRow || !isRecord(planRow.plan_json)) {
    throw new Error("STAFF_TRAINING_PLAN_NOT_FOUND");
  }

  const planUnits = Array.isArray(planRow.plan_json.units)
    ? planRow.plan_json.units
        .map((unit) => isRecord(unit) ? String(unit.unitId || "").trim() : "")
        .filter(Boolean)
    : [];

  const assessmentInput = isRecord(input.assessment)
    ? {
        ...input.assessment,
        sourceTrainingPlanHash: planRow.training_plan_hash,
        sourceStandardHash: planRow.source_standard_hash,
        trainingUnitIds: planUnits,
      }
    : input.assessment;

  const assessment = normalizeStaffAssessment(assessmentInput);

  const { data, error } = await supabaseAdmin
    .from("staff_assessment_revisions")
    .insert({
      hotel_id: hotelId,
      training_plan_revision_id: trainingPlanRevisionId,
      assessment_key: assessment.assessmentKey,
      revision_no: assessment.revisionNo,
      source_training_plan_hash: assessment.sourceTrainingPlanHash,
      source_standard_hash: assessment.sourceStandardHash,
      assessment_hash: assessment.assessmentHash,
      assessment_json: assessment,
    })
    .select("id,hotel_id,training_plan_revision_id,assessment_key,revision_no,assessment_hash,created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "STAFF_ASSESSMENT_REVISION_PERSIST_FAILED");
  }
  return { ...data, assessment };
}

export async function recordStaffAssessmentAttempt(input: {
  hotelId: unknown;
  staffUserId: unknown;
  trainingAssignmentId: unknown;
  assessmentRevisionId: unknown;
  answers: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_ASSESSMENT_HOTEL_ID_INVALID");
  const staffUserId = uuid(
    input.staffUserId,
    "STAFF_ASSESSMENT_STAFF_USER_ID_INVALID",
  );
  const trainingAssignmentId = uuid(
    input.trainingAssignmentId,
    "STAFF_TRAINING_ASSIGNMENT_ID_INVALID",
  );
  const assessmentRevisionId = uuid(
    input.assessmentRevisionId,
    "STAFF_ASSESSMENT_REVISION_ID_INVALID",
  );

  const { data: assessmentRow, error: assessmentError } = await supabaseAdmin
    .from("staff_assessment_revisions")
    .select("id,hotel_id,assessment_hash,assessment_json")
    .eq("hotel_id", hotelId)
    .eq("id", assessmentRevisionId)
    .maybeSingle();

  if (
    assessmentError
    || !assessmentRow
    || !isRecord(assessmentRow.assessment_json)
  ) {
    throw new Error("STAFF_ASSESSMENT_REVISION_NOT_FOUND");
  }

  const attempt = gradeStaffAssessmentAttempt({
    hotelId,
    staffUserId,
    assessment: assessmentRow.assessment_json,
    assessmentHash: assessmentRow.assessment_hash,
    answers: input.answers,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "record_staff_assessment_attempt_v2",
    {
      p_hotel_id: hotelId,
      p_staff_user_id: staffUserId,
      p_training_assignment_id: trainingAssignmentId,
      p_assessment_revision_id: assessmentRevisionId,
      p_attempt_json: attempt,
    },
  );

  if (error) {
    throw new Error(error.message || "STAFF_ASSESSMENT_ATTEMPT_PERSIST_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("STAFF_ASSESSMENT_ATTEMPT_PERSIST_EMPTY");

  return { ...row, attempt };
}

export async function verifyStaffAssessmentAttempt(input: {
  hotelId: unknown;
  assessmentAttemptId: unknown;
  reviewerStaffUserId: unknown;
  reviewedAt: unknown;
  reviews: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_ASSESSMENT_HOTEL_ID_INVALID");
  const assessmentAttemptId = uuid(
    input.assessmentAttemptId,
    "STAFF_ASSESSMENT_ATTEMPT_ID_INVALID",
  );
  const reviewerStaffUserId = uuid(
    input.reviewerStaffUserId,
    "STAFF_ASSESSMENT_REVIEWER_STAFF_USER_ID_INVALID",
  );

  const reviewer = await requireActiveStaffUser({
    hotelId,
    staffUserId: reviewerStaffUserId,
    allowedRoles: ["department_manager", "hotel_manager"],
  });

  const { data: attemptRow, error: attemptError } = await supabaseAdmin
    .from("staff_assessment_attempts")
    .select("id,hotel_id,staff_user_id,attempt_status,result_hash,attempt_json")
    .eq("hotel_id", hotelId)
    .eq("id", assessmentAttemptId)
    .eq("attempt_status", "pending_human_review")
    .maybeSingle();

  if (
    attemptError
    || !attemptRow
    || !isRecord(attemptRow.attempt_json)
  ) {
    throw new Error("STAFF_ASSESSMENT_PENDING_ATTEMPT_NOT_FOUND");
  }

  const verified = verifyStaffAssessmentHumanReview({
    attempt: attemptRow.attempt_json,
    reviewerStaffUserId,
    reviewerRole: reviewer.role,
    reviewedAt: input.reviewedAt,
    reviews: input.reviews,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "verify_staff_assessment_attempt_v2",
    {
      p_hotel_id: hotelId,
      p_assessment_attempt_id: assessmentAttemptId,
      p_reviewer_staff_user_id: reviewerStaffUserId,
      p_verified_json: verified,
    },
  );

  if (error) {
    throw new Error(error.message || "STAFF_ASSESSMENT_REVIEW_PERSIST_FAILED");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("STAFF_ASSESSMENT_REVIEW_PERSIST_EMPTY");

  return { ...row, verified };
}

export async function persistStaffHrRuleRevision(input: {
  hotelId: unknown;
  ruleSet: unknown;
  createdByStaffUserId?: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_HR_HOTEL_ID_INVALID");
  const ruleSet = normalizeStaffHrRuleSet(input.ruleSet);

  let creatorId: string | null = null;
  if (input.createdByStaffUserId) {
    creatorId = uuid(
      input.createdByStaffUserId,
      "STAFF_HR_CREATOR_ID_INVALID",
    );
    await requireActiveStaffUser({
      hotelId,
      staffUserId: creatorId,
      allowedRoles: ["department_manager", "hotel_manager"],
    });
  }

  const { data, error } = await supabaseAdmin
    .from("hotel_staff_hr_rule_revisions")
    .insert({
      hotel_id: hotelId,
      rule_set_key: ruleSet.ruleSetKey,
      revision_no: ruleSet.revisionNo,
      rule_set_hash: ruleSet.ruleSetHash,
      rules_json: ruleSet,
      created_by_staff_user_id: creatorId,
    })
    .select("id,hotel_id,rule_set_key,revision_no,rule_set_hash,created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "STAFF_HR_RULE_PERSIST_FAILED");
  }
  return { ...data, ruleSet };
}

export async function evaluateAndPersistStaffHrRules(input: {
  hotelId: unknown;
  staffUserId: unknown;
  hrRuleRevisionId: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const hotelId = uuid(input.hotelId, "STAFF_HR_HOTEL_ID_INVALID");
  const staffUserId = uuid(
    input.staffUserId,
    "STAFF_HR_STAFF_USER_ID_INVALID",
  );
  const hrRuleRevisionId = uuid(
    input.hrRuleRevisionId,
    "STAFF_HR_RULE_REVISION_ID_INVALID",
  );

  await requireActiveStaffUser({ hotelId, staffUserId });

  const { data: ruleRow, error: ruleError } = await supabaseAdmin
    .from("hotel_staff_hr_rule_revisions")
    .select("id,hotel_id,rule_set_hash,rules_json")
    .eq("hotel_id", hotelId)
    .eq("id", hrRuleRevisionId)
    .maybeSingle();

  if (ruleError || !ruleRow || !isRecord(ruleRow.rules_json)) {
    throw new Error("STAFF_HR_RULE_REVISION_NOT_FOUND");
  }

  const { data: resultRows, error: resultError } = await supabaseAdmin
    .from("staff_verified_results")
    .select("result_json,verified_at")
    .eq("hotel_id", hotelId)
    .eq("staff_user_id", staffUserId)
    .order("verified_at", { ascending: false });

  if (resultError) {
    throw new Error("STAFF_HR_VERIFIED_RESULTS_READ_FAILED");
  }

  const verifiedResults = (resultRows || []).map((row) => ({
    ...(isRecord(row.result_json) ? row.result_json : {}),
    verifiedAt: row.verified_at,
  }));

  const evaluation = evaluateStaffHrRules({
    hotelId,
    staffUserId,
    ruleSet: ruleRow.rules_json,
    verifiedResults,
  });

  const { data, error } = await supabaseAdmin
    .from("staff_hr_evaluations")
    .insert({
      hotel_id: hotelId,
      staff_user_id: staffUserId,
      hr_rule_revision_id: hrRuleRevisionId,
      evaluation_hash: evaluation.evaluationHash,
      evaluation_json: evaluation,
    })
    .select("id,hotel_id,staff_user_id,evaluation_hash,evaluated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "STAFF_HR_EVALUATION_PERSIST_FAILED");
  }
  return { ...data, evaluation };
}

export const STAFF_DEVELOPMENT_HASH_PATTERN = HASH_RE;
