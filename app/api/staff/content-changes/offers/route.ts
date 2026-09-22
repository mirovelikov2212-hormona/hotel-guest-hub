import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  getManagerOfferEditorState,
  saveManagerOfferDraft,
} from "@/lib/server/manager-offer-changes";
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
    const editor = await getManagerOfferEditorState(hotelSlug);
    return NextResponse.json({ ok: true, editor });
  } catch (error) {
    console.error("manager offer editor GET failed", error);
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: "offer_editor_load",
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
    if (!body) return NextResponse.json({ ok: false, error: "CM5_BODY_REQUIRED" }, { status: 400 });

    action = String(body.action || "").trim().toLowerCase();
    hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();
    if (action !== "save_draft") {
      return NextResponse.json({ ok: false, error: "CM5_ACTION_INVALID" }, { status: 400 });
    }

    const result = await saveManagerOfferDraft({
      hotelSlug,
      changeRequestId: body.changeRequestId,
      offers: body.offers,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("manager offer editor POST failed", error);
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
