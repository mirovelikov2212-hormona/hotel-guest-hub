import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  cancelManagerContentChangeDraft,
  confirmManagerContentChangeDraft,
  createManagerContentChangeDraft,
  getManagerContentChangeSnapshot,
} from "@/lib/server/manager-content-changes";
import {
  classifyManagerChangeFailure,
  managerChangeFailurePayload,
  reportManagerChangeSystemFailure,
} from "@/lib/server/manager-change-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const failure = classifyManagerChangeFailure(error);
  return NextResponse.json(
    managerChangeFailurePayload(error),
    { status: failure.status },
  );
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const snapshot = await getManagerContentChangeSnapshot(hotelSlug);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("manager content changes GET failed", error);
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: "content_change_snapshot_load",
        error,
      });
    }
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  let hotelSlug = "";
  let action = "unknown";
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "CM5_BODY_REQUIRED" },
        { status: 400 },
      );
    }

    action = String(body.action || "").trim().toLowerCase();
    hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();

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
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: action,
        error,
      });
    }
    return failure(error);
  }
}
