import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  getPropertyGostayaValueBaseline,
  updatePropertyGostayaValueBaseline,
} from "@/lib/server/gostaya-value-baseline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("FACTORY_ADMIN_FORBIDDEN")) {
    return { status: 403, code: "forbidden" };
  }
  if (message.includes("REVISION_CONFLICT")) {
    return { status: 409, code: "baseline_revision_conflict" };
  }
  if (message.includes("LOCKED_AFTER_GOLIVE")) {
    return { status: 409, code: "baseline_locked_after_go_live" };
  }
  if (message.includes("PROPERTY_NOT_FOUND")) {
    return { status: 404, code: "property_not_found" };
  }
  if (message.includes("PRODUCTION_HOTEL_REQUIRED")) {
    return { status: 409, code: "production_hotel_required" };
  }
  if (message.includes("VALUE_BASELINE_")) {
    return { status: 400, code: "baseline_rejected" };
  }

  return { status: 503, code: "unavailable" };
}

export async function GET(req: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const result = await getPropertyGostayaValueBaseline(
      req.nextUrl.searchParams.get("propertyId"),
    );
    return json({ ok: true, result });
  } catch (error) {
    const mapped = mapError(error);
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload_too_large" }, 413);
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await updatePropertyGostayaValueBaseline({
      authority,
      propertyId: body.propertyId,
      expectedRevision: body.expectedRevision,
      baseline: body.baseline,
    });

    return json({ ok: true, result });
  } catch (error) {
    const mapped = mapError(error);
    console.error("GOSTAYA Value baseline update failed", error);
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}
