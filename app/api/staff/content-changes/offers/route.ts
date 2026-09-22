import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  getManagerOfferEditorState,
  saveManagerOfferDraft,
} from "@/lib/server/manager-offer-changes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function codeFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const match = message.match(/(CM5_[A-Z0-9_]+)/);
  return match?.[1] || "CM5_UNEXPECTED_ERROR";
}

function statusForCode(code: string) {
  if (code.includes("SESSION") || code.includes("FORBIDDEN") || code.includes("NOT_OWNED")) return 403;
  if (code.includes("STALE_") || code.includes("NOT_DRAFT") || code.includes("CONCURRENT_")) return 409;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("INVALID") || code.includes("REQUIRED") || code.includes("UNSUPPORTED") || code.includes("DUPLICATE")) return 400;
  return 500;
}

function failure(error: unknown) {
  const code = codeFromError(error);
  return NextResponse.json({ ok: false, error: code }, { status: statusForCode(code) });
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const editor = await getManagerOfferEditorState(hotelSlug);
    return NextResponse.json({ ok: true, editor });
  } catch (error) {
    console.error("manager offer editor GET failed", error);
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: "CM5_BODY_REQUIRED" }, { status: 400 });

    const action = String(body.action || "").trim().toLowerCase();
    if (action !== "save_draft") {
      return NextResponse.json({ ok: false, error: "CM5_ACTION_INVALID" }, { status: 400 });
    }

    const result = await saveManagerOfferDraft({
      hotelSlug: body.hotelSlug,
      changeRequestId: body.changeRequestId,
      offers: body.offers,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("manager offer editor POST failed", error);
    return failure(error);
  }
}
