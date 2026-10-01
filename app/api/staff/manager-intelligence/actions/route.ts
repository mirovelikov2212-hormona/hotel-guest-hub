import { NextRequest, NextResponse } from "next/server";

import {
  decideManagerIntelligenceRecommendation,
  executeManagerIntelligenceRecommendation,
  getManagerIntelligenceActionLoop,
  markManagerIntelligenceRecommendationViewed,
} from "@/lib/server/manager-intelligence-actions";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function statusFor(message: string) {
  if (message.includes("MANAGER_SESSION_REQUIRED")) return 401;
  if (message.includes("HOTEL_SCOPE_MISMATCH")) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (
    message.includes("INVALID")
    || message.includes("ALREADY_DECIDED")
    || message.includes("DECISION_STATE")
    || message.includes("APPROVAL_REQUIRED")
    || message.includes("ALREADY_EXECUTED")
    || message.includes("NOT_EXECUTABLE")
  ) return 409;
  return 503;
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "")
    .trim()
    .toLowerCase();

  try {
    const result = await getManagerIntelligenceActionLoop({ hotelSlug });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "MANAGER_INTELLIGENCE_ACTION_LOOP_UNAVAILABLE";
    console.error("Manager Intelligence action loop GET failed", error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusFor(message), headers: NO_STORE },
    );
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const action = String(body?.action || "").trim().toLowerCase();
  const recommendationId = body?.recommendationId;

  try {
    if (action === "view") {
      const result = await markManagerIntelligenceRecommendationViewed({
        hotelSlug,
        recommendationId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
    }

    if (action === "approve" || action === "reject") {
      const result = await decideManagerIntelligenceRecommendation({
        hotelSlug,
        recommendationId,
        decision: action === "approve" ? "approved" : "rejected",
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
    }

    if (action === "execute") {
      const result = await executeManagerIntelligenceRecommendation({
        hotelSlug,
        recommendationId,
        executionNote: body?.executionNote,
        previousValue: body?.previousValue,
        newValue: body?.newValue,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
    }

    return NextResponse.json(
      { ok: false, error: "MANAGER_INTELLIGENCE_ACTION_INVALID" },
      { status: 400, headers: NO_STORE },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "MANAGER_INTELLIGENCE_ACTION_FAILED";
    console.error("Manager Intelligence action loop POST failed", error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusFor(message), headers: NO_STORE },
    );
  }
}
