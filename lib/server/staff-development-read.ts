import "server-only";

import {
  materializeStaffAssessmentForLearner,
} from "@/lib/staff-development/staff-assessment-model.mjs";
import {
  requireStaffDevelopmentIdentity,
} from "@/lib/server/staff-development-identity";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function ids(values: unknown[]) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function learnerAttemptSummary(row: Record<string, any>) {
  const payload = isRecord(row.attempt_json) ? row.attempt_json : {};
  const score = Number(payload.scorePercent ?? payload.autoScorePercent);
  return {
    id: String(row.id),
    assessmentRevisionId: String(row.assessment_revision_id),
    attemptNo: Number(row.attempt_no),
    status: String(row.attempt_status),
    submittedAt: String(row.submitted_at || ""),
    scorePercent: Number.isFinite(score) ? score : null,
    passed: typeof payload.passed === "boolean" ? payload.passed : null,
  };
}

function learnerVerifiedResultSummary(row: Record<string, any>) {
  const payload = isRecord(row.result_json) ? row.result_json : {};
  const score = Number(payload.scorePercent ?? payload.autoScorePercent);
  return {
    id: String(row.id),
    assessmentAttemptId: String(row.assessment_attempt_id),
    verificationKind: String(row.verification_kind || ""),
    verifiedAt: String(row.verified_at || ""),
    scorePercent: Number.isFinite(score) ? score : null,
    passed: typeof payload.passed === "boolean" ? payload.passed : null,
  };
}

async function fetchPlans(hotelId: string, planIds: string[]) {
  if (!planIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("staff_training_plan_revisions")
    .select(
      "id,hotel_id,standard_revision_id,source_standard_hash,training_plan_hash,plan_json,created_at",
    )
    .eq("hotel_id", hotelId)
    .in("id", planIds);

  if (error) throw new Error("STAFF_DEVELOPMENT_PLAN_READ_FAILED");
  return data || [];
}

async function fetchAssessmentsForPlans(
  hotelId: string,
  planIds: string[],
) {
  if (!planIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("staff_assessment_revisions")
    .select(
      "id,hotel_id,training_plan_revision_id,assessment_key,revision_no,assessment_hash,assessment_json,created_at",
    )
    .eq("hotel_id", hotelId)
    .in("training_plan_revision_id", planIds)
    .order("revision_no", { ascending: false });

  if (error) throw new Error("STAFF_DEVELOPMENT_ASSESSMENT_READ_FAILED");
  return data || [];
}

export async function getOwnStaffDevelopmentState(hotelSlug: unknown) {
  const identity = await requireStaffDevelopmentIdentity(hotelSlug);
  const hotelId = identity.hotelId;
  const staffUserId = identity.staffUserId;

  const [
    assignmentsResult,
    completionsResult,
    attemptsResult,
    verifiedResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("staff_training_assignments")
      .select(
        "id,hotel_id,staff_user_id,training_plan_revision_id,assignment_hash,assigned_at,due_at,assignment_json",
      )
      .eq("hotel_id", hotelId)
      .eq("staff_user_id", staffUserId)
      .order("assigned_at", { ascending: false }),
    supabaseAdmin
      .from("staff_training_completions")
      .select(
        "id,hotel_id,assignment_id,staff_user_id,completion_hash,completion_json,completed_at",
      )
      .eq("hotel_id", hotelId)
      .eq("staff_user_id", staffUserId)
      .order("completed_at", { ascending: false }),
    supabaseAdmin
      .from("staff_assessment_attempts")
      .select(
        "id,hotel_id,staff_user_id,training_assignment_id,assessment_revision_id,attempt_no,attempt_status,result_hash,attempt_json,submitted_at",
      )
      .eq("hotel_id", hotelId)
      .eq("staff_user_id", staffUserId)
      .order("submitted_at", { ascending: false }),
    supabaseAdmin
      .from("staff_verified_results")
      .select(
        "id,hotel_id,staff_user_id,assessment_attempt_id,verification_kind,result_hash,result_json,verified_at",
      )
      .eq("hotel_id", hotelId)
      .eq("staff_user_id", staffUserId)
      .order("verified_at", { ascending: false }),
  ]);

  if (assignmentsResult.error) {
    throw new Error("STAFF_DEVELOPMENT_ASSIGNMENTS_READ_FAILED");
  }
  if (completionsResult.error) {
    throw new Error("STAFF_DEVELOPMENT_COMPLETIONS_READ_FAILED");
  }
  if (attemptsResult.error) {
    throw new Error("STAFF_DEVELOPMENT_ATTEMPTS_READ_FAILED");
  }
  if (verifiedResult.error) {
    throw new Error("STAFF_DEVELOPMENT_RESULTS_READ_FAILED");
  }

  const assignments = assignmentsResult.data || [];
  const completions = completionsResult.data || [];
  const attempts = attemptsResult.data || [];
  const verifiedResults = verifiedResult.data || [];

  const planIds = ids(
    assignments.map((row) => row.training_plan_revision_id),
  );
  const plans = await fetchPlans(hotelId, planIds);
  const assessments = await fetchAssessmentsForPlans(hotelId, planIds);

  const completionByAssignment = new Map(
    completions.map((row) => [String(row.assignment_id), row]),
  );
  const planById = new Map(
    plans.map((row) => [String(row.id), row]),
  );
  const attemptsByAssessment = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const assessmentId = String(attempt.assessment_revision_id);
    const current = attemptsByAssessment.get(assessmentId) || [];
    current.push(attempt);
    attemptsByAssessment.set(assessmentId, current);
  }

  const learnerAssessments = assessments.map((row) => {
    if (!isRecord(row.assessment_json)) {
      throw new Error("STAFF_DEVELOPMENT_ASSESSMENT_PAYLOAD_INVALID");
    }
    return {
      id: String(row.id),
      trainingPlanRevisionId: String(row.training_plan_revision_id),
      assessmentKey: String(row.assessment_key),
      revisionNo: Number(row.revision_no),
      learner: materializeStaffAssessmentForLearner(row.assessment_json),
      attempts: (attemptsByAssessment.get(String(row.id)) || [])
        .map((attempt) => learnerAttemptSummary(attempt)),
    };
  });

  return {
    identity,
    assignments: assignments.map((assignment) => {
      const plan = planById.get(String(assignment.training_plan_revision_id));
      return {
        ...assignment,
        plan: plan
          ? {
              id: String(plan.id),
              sourceStandardHash: String(plan.source_standard_hash),
              trainingPlanHash: String(plan.training_plan_hash),
              plan: isRecord(plan.plan_json)
                ? plan.plan_json
                : null,
            }
          : null,
        completion:
          completionByAssignment.get(String(assignment.id)) || null,
        assessments: learnerAssessments.filter(
          (assessment) =>
            assessment.trainingPlanRevisionId
            === String(assignment.training_plan_revision_id),
        ),
      };
    }),
    verifiedResults: verifiedResults.map((row) =>
      learnerVerifiedResultSummary(row),
    ),
  };
}

async function managerStaffScope(
  identity: Awaited<ReturnType<typeof requireStaffDevelopmentIdentity>>,
) {
  if (
    identity.staffUserRole !== "department_manager"
    && identity.staffUserRole !== "hotel_manager"
  ) {
    throw new Error("STAFF_DEVELOPMENT_MANAGER_IDENTITY_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("staff_users")
    .select("id,hotel_id,department_id,full_name,email,phone,role,active")
    .eq("hotel_id", identity.hotelId)
    .eq("active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error("STAFF_DEVELOPMENT_STAFF_LIST_FAILED");

  const scoped = (data || []).filter((row) => {
    if (identity.staffUserRole === "hotel_manager") return true;
    return (
      identity.departmentId
      && row.department_id
      && String(row.department_id) === identity.departmentId
      && String(row.role) !== "hotel_manager"
    );
  });

  return scoped;
}

export async function getManagerStaffDevelopmentState(
  hotelSlug: unknown,
) {
  const identity = await requireStaffDevelopmentIdentity(hotelSlug);
  const staff = await managerStaffScope(identity);
  const staffIds = ids(staff.map((row) => row.id));

  const { data: standardRows, error: standardsError } =
    await supabaseAdmin
      .from("hotel_staff_standard_revisions")
      .select(
        "id,hotel_id,standard_key,revision_no,lifecycle_status,standard_hash,standard_json,created_by_staff_user_id,created_at",
      )
      .eq("hotel_id", identity.hotelId)
      .order("created_at", { ascending: false });

  if (standardsError) {
    throw new Error("STAFF_DEVELOPMENT_STANDARDS_READ_FAILED");
  }

  const standards = (standardRows || []).filter((row) => {
    if (identity.staffUserRole === "hotel_manager") return true;
    if (!isRecord(row.standard_json)) return false;
    const departments = Array.isArray(row.standard_json.departmentCodes)
      ? row.standard_json.departmentCodes
          .map((value) => text(value).toLowerCase())
      : [];
    return departments.includes(identity.operationalRole);
  });

  const standardIds = ids(standards.map((row) => row.id));
  let plans: Array<Record<string, unknown>> = [];
  if (standardIds.length) {
    const { data, error } = await supabaseAdmin
      .from("staff_training_plan_revisions")
      .select(
        "id,hotel_id,standard_revision_id,source_standard_hash,training_plan_hash,plan_json,created_at",
      )
      .eq("hotel_id", identity.hotelId)
      .in("standard_revision_id", standardIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error("STAFF_DEVELOPMENT_PLANS_READ_FAILED");
    plans = (data || []) as Array<Record<string, unknown>>;
  }

  const planIds = ids(plans.map((row) => row.id));

  let assignments: Array<Record<string, unknown>> = [];
  if (staffIds.length && planIds.length) {
    const { data, error } = await supabaseAdmin
      .from("staff_training_assignments")
      .select(
        "id,hotel_id,staff_user_id,training_plan_revision_id,assignment_hash,assigned_by_staff_user_id,assigned_at,due_at,assignment_json",
      )
      .eq("hotel_id", identity.hotelId)
      .in("staff_user_id", staffIds)
      .in("training_plan_revision_id", planIds)
      .order("assigned_at", { ascending: false });
    if (error) {
      throw new Error("STAFF_DEVELOPMENT_ASSIGNMENTS_READ_FAILED");
    }
    assignments = (data || []) as Array<Record<string, unknown>>;
  }

  const assignmentIds = ids(assignments.map((row) => row.id));

  let pendingAttempts: Array<Record<string, unknown>> = [];
  if (staffIds.length && assignmentIds.length) {
    const { data, error } = await supabaseAdmin
      .from("staff_assessment_attempts")
      .select(
        "id,hotel_id,staff_user_id,training_assignment_id,assessment_revision_id,attempt_no,attempt_status,result_hash,attempt_json,submitted_at",
      )
      .eq("hotel_id", identity.hotelId)
      .eq("attempt_status", "pending_human_review")
      .in("staff_user_id", staffIds)
      .in("training_assignment_id", assignmentIds)
      .order("submitted_at", { ascending: true });
    if (error) {
      throw new Error("STAFF_DEVELOPMENT_PENDING_REVIEWS_READ_FAILED");
    }
    pendingAttempts = (data || []) as Array<Record<string, unknown>>;
  }

  const assessmentIds = ids(
    pendingAttempts.map((row) => row.assessment_revision_id),
  );
  let assessmentRows: Array<Record<string, unknown>> = [];
  if (assessmentIds.length) {
    const { data, error } = await supabaseAdmin
      .from("staff_assessment_revisions")
      .select(
        "id,hotel_id,training_plan_revision_id,assessment_key,revision_no,assessment_hash,assessment_json",
      )
      .eq("hotel_id", identity.hotelId)
      .in("id", assessmentIds);
    if (error) {
      throw new Error("STAFF_DEVELOPMENT_REVIEW_ASSESSMENTS_READ_FAILED");
    }
    assessmentRows = (data || []) as Array<Record<string, unknown>>;
  }

  let verifiedResults: Array<Record<string, unknown>> = [];
  let hrEvaluations: Array<Record<string, unknown>> = [];
  if (staffIds.length) {
    const [verifiedQuery, evaluationQuery] = await Promise.all([
      supabaseAdmin
        .from("staff_verified_results")
        .select(
          "id,hotel_id,staff_user_id,assessment_attempt_id,verification_kind,verified_by_staff_user_id,result_hash,result_json,verified_at",
        )
        .eq("hotel_id", identity.hotelId)
        .in("staff_user_id", staffIds)
        .order("verified_at", { ascending: false }),
      supabaseAdmin
        .from("staff_hr_evaluations")
        .select(
          "id,hotel_id,staff_user_id,hr_rule_revision_id,evaluation_hash,evaluation_json,evaluated_at",
        )
        .eq("hotel_id", identity.hotelId)
        .in("staff_user_id", staffIds)
        .order("evaluated_at", { ascending: false }),
    ]);

    if (verifiedQuery.error) {
      throw new Error("STAFF_DEVELOPMENT_RESULTS_READ_FAILED");
    }
    if (evaluationQuery.error) {
      throw new Error("STAFF_DEVELOPMENT_HR_EVALUATIONS_READ_FAILED");
    }

    verifiedResults =
      (verifiedQuery.data || []) as Array<Record<string, unknown>>;
    hrEvaluations =
      (evaluationQuery.data || []) as Array<Record<string, unknown>>;
  }

  let hrRules: Array<Record<string, unknown>> = [];
  if (identity.staffUserRole === "hotel_manager") {
    const { data, error } = await supabaseAdmin
      .from("hotel_staff_hr_rule_revisions")
      .select(
        "id,hotel_id,rule_set_key,revision_no,rule_set_hash,rules_json,created_by_staff_user_id,created_at",
      )
      .eq("hotel_id", identity.hotelId)
      .order("revision_no", { ascending: false });
    if (error) {
      throw new Error("STAFF_DEVELOPMENT_HR_RULES_READ_FAILED");
    }
    hrRules = (data || []) as Array<Record<string, unknown>>;
  }

  return {
    identity,
    staff,
    standards,
    trainingPlans: plans,
    assignments,
    pendingReviews: pendingAttempts.map((attempt) => ({
      ...attempt,
      assessment:
        assessmentRows.find(
          (assessment) =>
            String(assessment.id)
            === String(attempt.assessment_revision_id),
        ) || null,
    })),
    verifiedResults,
    hrRules,
    hrEvaluations,
  };
}
