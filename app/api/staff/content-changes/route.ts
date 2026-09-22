import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  cancelManagerContentChangeDraft,
  confirmManagerContentChangeDraft,
  createManagerContentChangeDraft,
  getManagerContentChangeSnapshot,
} from "@/lib/server/manager-content-changes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const match = message.match(/(CM5_[A-Z0-9_]+)/);
  return match?.[1] || "CM5_UNEXPECTED_ERROR";
}

function errorStatus(code: string) {
  if (
    code.includes("SESSION_REQUIRED")
    || code.includes("HOTEL_FORBIDDEN")
    || code.includes("RUNTIME_ROLE_REQUIRED")
    || code.includes("MANAGER_SESSION_FORBIDDEN")
  ) return 403;

  if (
    code.includes("STALE_")
    || code.includes("NOT_DRAFT")
    || code.includes("CONCURRENT_")
    || code.includes("OPERATIONS_REQUIRED")
    || code.includes("CURRENT_LIVE_STATE_INVALID")
  ) return 409;

  if (
    code.includes("INVALID")
    || code.includes("REQUIRED")
  ) return 400;

  if (code.includes("NOT_FOUND")) return 404;
  return 500;
}

function failure(error: unknown) {
  const code = errorCode(error);
  return NextResponse.json(
    { ok: false, error: code },
    { status: errorStatus(code) },
  );
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const snapshot = await getManagerContentChangeSnapshot(hotelSlug);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("manager content changes GET failed", error);
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "CM5_BODY_REQUIRED" },
        { status: 400 },
      );
    }

    const action = String(body.action || "").trim().toLowerCase();
    const hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();

    if (action === "create_draft") {
      const change = await createManagerContentChangeDraft({
        hotelSlug,
        changeScope: body.changeScope,
      });
      return NextResponse.json({ ok: true, change }, { status: 201 });
    }

    if (action === "confirm_draft") {
      const change = await confirmManagerContentChangeDraft({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, change });
    }

    if (action === "cancel_draft") {
      const change = await cancelManagerContentChangeDraft({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, change });
    }

    return NextResponse.json(
      { ok: false, error: "CM5_ACTION_INVALID" },
      { status: 400 },
    );
  } catch (error) {
    console.error("manager content changes POST failed", error);
    return failure(error);
  }
}
