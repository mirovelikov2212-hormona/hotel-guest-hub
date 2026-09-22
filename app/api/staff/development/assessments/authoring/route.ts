import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  generateStaffAssessmentAiProposal,
} from "@/lib/server/staff-development-ai-authoring";
import {
  createStaffAssessmentAuthoringDraft,
  listStaffAssessmentAuthoring,
  publishStaffAssessmentAuthoring,
  saveStaffAssessmentAuthoringProposal,
} from "@/lib/server/staff-assessment-authoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /^[A-Z0-9_]+(?::[A-Z0-9_,.-]+)?$/.test(message)
    ? message
    : "STAFF_ASSESSMENT_AUTHORING_FAILED";
}

function status(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("WRITES_DISABLED") || message.includes("AI_CONFIG_MISSING")) return 503;
  if (message.includes("STAFF_AI_")) return 502;
  if (message.includes("IDENTITY_REQUIRED")) return 401;
  if (
    message.includes("MANAGER_REQUIRED")
    || message.includes("SCOPE_FORBIDDEN")
  ) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("CONFLICT")) return 409;
  return 400;
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();

  try {
    const authoring = await listStaffAssessmentAuthoring({ hotelSlug });
    return NextResponse.json(
      { ok: true, authoring },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: status(error), headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "STAFF_ASSESSMENT_AUTHORING_BODY_REQUIRED" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const action = String(body.action || "").trim().toLowerCase();
    const hotelSlug = body.hotelSlug;

    if (action === "create_draft") {
      const result = await createStaffAssessmentAuthoringDraft({
        hotelSlug,
        trainingPlanRevisionId: body.trainingPlanRevisionId,
        assessmentKey: body.assessmentKey,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "generate_ai_proposal") {
      const result = await generateStaffAssessmentAiProposal({
        hotelSlug,
        authoringId: body.authoringId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "save_proposal") {
      const result = await saveStaffAssessmentAuthoringProposal({
        hotelSlug,
        authoringId: body.authoringId,
        proposal: body.proposal,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "publish") {
      const result = await publishStaffAssessmentAuthoring({
        hotelSlug,
        authoringId: body.authoringId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { ok: false, error: "STAFF_ASSESSMENT_AUTHORING_ACTION_INVALID" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff assessment authoring action failed", error);
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: status(error), headers: NO_STORE_HEADERS },
    );
  }
}
