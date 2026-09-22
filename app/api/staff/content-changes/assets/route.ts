import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  finalizeHotelContentAssetUpload,
  listHotelContentAssets,
  prepareHotelContentAssetUpload,
  reviewHotelContentAsset,
} from "@/lib/server/hotel-content-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.match(/(CM5_[A-Z0-9_]+)/)?.[1] || "CM5_UNEXPECTED_ERROR";
}

function errorStatus(code: string) {
  if (code.includes("SESSION") || code.includes("FORBIDDEN") || code.includes("NOT_OWNED")) return 403;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("STALE_") || code.includes("NOT_DRAFT") || code.includes("CONCURRENT_")) return 409;
  if (
    code.includes("INVALID")
    || code.includes("REQUIRED")
    || code.includes("UNSUPPORTED")
    || code.includes("FAILED")
  ) return 400;
  return 500;
}

function failure(error: unknown) {
  const code = errorCode(error);
  return NextResponse.json({ ok: false, error: code }, { status: errorStatus(code) });
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const changeRequestId = String(req.nextUrl.searchParams.get("changeRequestId") || "").trim().toLowerCase();
    const assets = await listHotelContentAssets({ hotelSlug, changeRequestId });
    return NextResponse.json({ ok: true, assets });
  } catch (error) {
    console.error("manager content assets GET failed", error);
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "CM5_BODY_REQUIRED" }, { status: 400 });
    }

    const action = String(body.action || "").trim().toLowerCase();
    if (action === "prepare") {
      const upload = await prepareHotelContentAssetUpload({
        hotelSlug: body.hotelSlug,
        changeRequestId: body.changeRequestId,
        originalName: body.originalName,
        mimeType: body.mimeType,
        fileSize: body.fileSize,
        creativeSurface: body.creativeSurface,
      });
      return NextResponse.json({ ok: true, upload });
    }

    if (action === "finalize") {
      const asset = await finalizeHotelContentAssetUpload({
        hotelSlug: body.hotelSlug,
        changeRequestId: body.changeRequestId,
        assetId: body.assetId,
        storagePath: body.storagePath,
        originalName: body.originalName,
        mimeType: body.mimeType,
        fileSize: body.fileSize,
        creativeSurface: body.creativeSurface,
      });
      return NextResponse.json({ ok: true, asset });
    }

    if (action === "review") {
      const review = await reviewHotelContentAsset({
        hotelSlug: body.hotelSlug,
        assetId: body.assetId,
        decision: body.decision,
      });
      return NextResponse.json({ ok: true, review });
    }

    return NextResponse.json({ ok: false, error: "CM5_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    console.error("manager content assets POST failed", error);
    return failure(error);
  }
}
