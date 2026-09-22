import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  finalizeHotelContentAssetUpload,
  listHotelContentAssets,
  prepareHotelContentAssetUpload,
  reviewHotelContentAsset,
} from "@/lib/server/hotel-content-assets";
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
    const changeRequestId = String(req.nextUrl.searchParams.get("changeRequestId") || "").trim().toLowerCase();
    const assets = await listHotelContentAssets({ hotelSlug, changeRequestId });
    return NextResponse.json({ ok: true, assets });
  } catch (error) {
    console.error("manager content assets GET failed", error);
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: "content_asset_list",
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
      return NextResponse.json({ ok: false, error: "CM5_BODY_REQUIRED" }, { status: 400 });
    }

    action = String(body.action || "").trim().toLowerCase();
    hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();
    if (action === "prepare") {
      const upload = await prepareHotelContentAssetUpload({
        hotelSlug,
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
        hotelSlug,
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
        hotelSlug,
        assetId: body.assetId,
        decision: body.decision,
      });
      return NextResponse.json({ ok: true, review });
    }

    return NextResponse.json({ ok: false, error: "CM5_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    console.error("manager content assets POST failed", error);
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: `content_asset_${action}`,
        error,
      });
    }
    return failure(error);
  }
}
