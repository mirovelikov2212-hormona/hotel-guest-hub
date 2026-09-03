import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { moveHotelRuntimeCell } from "@/lib/server/runtime-cell-control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapRuntimeCellError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("RUNTIME_CELL_ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (message.includes("RUNTIME_CELL_HOTEL_NOT_FOUND") || message.includes("RUNTIME_CELL_TARGET_NOT_FOUND")) {
    return { status: 404, code: "not_found" };
  }
  if (
    message.includes("RUNTIME_CELL_GENERATION_CONFLICT")
    || message.includes("RUNTIME_CELL_ASSIGNMENT_CAS_FAILED")
    || message.includes("RUNTIME_CELL_TARGET_CAPACITY_EXHAUSTED")
    || message.includes("RUNTIME_CELL_ENVIRONMENT_MISMATCH")
    || message.includes("RUNTIME_CELL_TARGET_NOT_ACTIVE")
  ) {
    return { status: 409, code: "cell_assignment_conflict" };
  }
  if (message.includes("RUNTIME_CELL_")) return { status: 400, code: "invalid_request" };
  return { status: 503, code: "unavailable" };
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
    }

    const body = JSON.parse(rawBody) as {
      hotelId?: unknown;
      targetCellKey?: unknown;
      expectedGeneration?: unknown;
      reason?: unknown;
    };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await moveHotelRuntimeCell({
      authority,
      hotelId: body.hotelId,
      targetCellKey: body.targetCellKey,
      expectedGeneration: body.expectedGeneration,
      reason: body.reason,
    });

    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    const mapped = mapRuntimeCellError(error);
    console.error("Control Plane runtime cell move failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}