import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  generateStaffHrManagerAnalysis,
} from "@/lib/server/staff-hr-ai-analysis";

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
    : "STAFF_HR_AI_ANALYSIS_FAILED";
}

function status(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("IDENTITY_REQUIRED")) return 401;
  if (
    message.includes("HOTEL_MANAGER_REQUIRED")
    || message.includes("SCOPE_INVALID")
  ) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("AI_CONFIG_MISSING")) return 503;
  if (message.includes("STAFF_HR_AI_")) return 502;
  return 400;
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as
      | Record<string, unknown>
      | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "STAFF_HR_AI_BODY_REQUIRED" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const result = await generateStaffHrManagerAnalysis({
      hotelSlug: body.hotelSlug,
      evaluationId: body.evaluationId,
      language: body.language,
    });

    return NextResponse.json(
      { ok: true, result },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff HR AI Manager analysis failed", error);
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: status(error), headers: NO_STORE_HEADERS },
    );
  }
}
