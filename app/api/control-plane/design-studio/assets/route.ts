import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  finalizeHubDesignAssetUpload,
  listHubDesignAssets,
  prepareHubDesignAssetUpload,
} from "@/lib/server/hub-design-assets-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("STORAGE_NOT_READY")) return { error: "asset_storage_not_ready", status: 503 };
  if (message.includes("FOREIGN_OR_MISSING")) return { error: "asset_reference_invalid", status: 409 };
  if (message.includes("NOT_FOUND") || message.includes("DOWNLOAD_FAILED")) return { error: "asset_not_found", status: 404 };
  if (message.includes("INVALID") || message.includes("MISMATCH") || message.includes("NOT_IMAGE")) {
    return { error: "asset_invalid", status: 400 };
  }
  return { error: "asset_operation_failed", status: 500 };
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const canonicalUrl = String(request.nextUrl.searchParams.get("canonicalUrl") || "").trim();
  if (!canonicalUrl) return json({ ok: false, error: "missing_canonical_url" }, 400);

  try {
    const result = await listHubDesignAssets(canonicalUrl);
    return json({ ok: true, ready: true, ...result });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped.error === "asset_storage_not_ready") {
      return json({ ok: true, ready: false, assets: [], error: mapped.error }, 200);
    }
    console.error("Design Studio asset read failed", { error: error instanceof Error ? error.message : String(error) });
    return json({ ok: false, error: mapped.error }, mapped.status);
  }
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || "");

  try {
    if (action === "prepare") {
      const upload = await prepareHubDesignAssetUpload({
        canonicalUrl: String(body?.canonicalUrl || ""),
        originalName: String(body?.originalName || ""),
        mimeType: String(body?.mimeType || ""),
        fileSize: Number(body?.fileSize),
      });
      return json({ ok: true, upload });
    }

    if (action === "finalize") {
      const asset = await finalizeHubDesignAssetUpload({
        actorAdminId: authority.adminId,
        canonicalUrl: String(body?.canonicalUrl || ""),
        assetId: String(body?.assetId || ""),
        storagePath: String(body?.storagePath || ""),
        originalName: String(body?.originalName || ""),
        mimeType: String(body?.mimeType || ""),
        fileSize: Number(body?.fileSize),
      });
      return json({ ok: true, asset });
    }

    return json({ ok: false, error: "unsupported_action" }, 400);
  } catch (error) {
    const mapped = mapError(error);
    console.error("Design Studio asset mutation failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: mapped.error }, mapped.status);
  }
}
