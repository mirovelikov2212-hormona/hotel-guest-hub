import { NextRequest, NextResponse } from "next/server";

import {
  assignTrainingToStaff,
  completeOwnTraining,
  evaluateStaffDevelopmentRules,
  publishStaffAssessment,
  publishStaffHrRules,
  publishStaffStandardAndTraining,
  reviewStaffAssessment,
  setStaffDevelopmentPersonalPin,
  submitOwnStaffAssessment,
} from "@/lib/server/staff-development-actions";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function classify(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("WRITES_DISABLED")) return 503;
  if (message.includes("IDENTITY_REQUIRED")) return 401;
  if (
    message.includes("FORBIDDEN")
    || message.includes("MANAGER_REQUIRED")
    || message.includes("HOTEL_MANAGER_REQUIRED")
  ) return 403;
  if (
    message.includes("NOT_FOUND")
    || message.includes("NOT_COMPLETED")
  ) return 404;
  if (
    message.includes("DUPLICATE")
    || message.includes("ALREADY_VERIFIED")
  ) return 409;
  return 400;
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  let action = "unknown";

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "STAFF_DEVELOPMENT_BODY_REQUIRED" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    action = String(body.action || "").trim().toLowerCase();
    const hotelSlug = body.hotelSlug;

    if (action === "publish_standard") {
      const result = await publishStaffStandardAndTraining({
        hotelSlug,
        standard: body.standard,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "assign_training") {
      const result = await assignTrainingToStaff({
        hotelSlug,
        targetStaffUserId: body.targetStaffUserId,
        trainingPlanRevisionId: body.trainingPlanRevisionId,
        dueAt: body.dueAt,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "complete_training") {
      const result = await completeOwnTraining({
        hotelSlug,
        assignmentId: body.assignmentId,
        completedUnitIds: body.completedUnitIds,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "publish_assessment") {
      const result = await publishStaffAssessment({
        hotelSlug,
        trainingPlanRevisionId: body.trainingPlanRevisionId,
        assessment: body.assessment,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "submit_assessment") {
      const result = await submitOwnStaffAssessment({
        hotelSlug,
        trainingAssignmentId: body.trainingAssignmentId,
        assessmentRevisionId: body.assessmentRevisionId,
        answers: body.answers,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "review_assessment") {
      const result = await reviewStaffAssessment({
        hotelSlug,
        assessmentAttemptId: body.assessmentAttemptId,
        reviews: body.reviews,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "set_personal_pin") {
      const result = await setStaffDevelopmentPersonalPin({
        hotelSlug,
        targetStaffUserId: body.targetStaffUserId,
        personalPin: body.personalPin,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "publish_hr_rules") {
      const result = await publishStaffHrRules({
        hotelSlug,
        ruleSet: body.ruleSet,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "evaluate_hr_rules") {
      const result = await evaluateStaffDevelopmentRules({
        hotelSlug,
        targetStaffUserId: body.targetStaffUserId,
        hrRuleRevisionId: body.hrRuleRevisionId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { ok: false, error: "STAFF_DEVELOPMENT_ACTION_INVALID" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff development action failed", {
      action,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "STAFF_DEVELOPMENT_ACTION_FAILED",
      },
      { status: classify(error), headers: NO_STORE_HEADERS },
    );
  }
}
