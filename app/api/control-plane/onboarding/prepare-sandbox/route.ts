import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { prepareFactorySandbox } from "@/lib/server/factory-prepare-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapFactoryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("ADMIN_FORBIDDEN")) {
    return { status: 403, code: "forbidden" };
  }
  if (message.includes("P4_PREPARE_SANDBOX_RUN_NOT_FOUND")) {
    return { status: 404, code: "not_found" };
  }
  if (
    message.includes("IDEMPOTENCY_CONFLICT") ||
    message.includes("ALREADY_EXIST") ||
    message.includes("P4_PREPARE_SANDBOX_NOT_FAIL_CLOSED") ||
    message.includes("P4_PREPARE_SANDBOX_LINEAGE_DRIFT") ||
    message.includes("P4_PREPARE_SANDBOX_INCOMPLETE") ||
    message.includes("P4_PREPARE_SANDBOX_") &&
      (message.includes("_REQUIRED") || message.includes("_NOT_VISIBLE"))
  ) {
    return { status: 409, code: "conflict" };
  }
  if (
    message.includes("P0_FACTORY_") ||
    message.includes("P2_FACTORY_") ||
    message.includes("P2_2_") ||
    message.includes("P2_3_") ||
    message.includes("P2_4_") ||
    message.includes("P2C_") ||
    message.includes("P2D_")
  ) {
    return { status: 400, code: "invalid_blueprint" };
  }

  return { status: 503, code: "unavailable" };
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
    }

    const body = JSON.parse(rawBody) as { onboardingRunId?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const onboardingRunId = String(body.onboardingRunId || "").trim();
    if (!UUID_PATTERN.test(onboardingRunId)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await prepareFactorySandbox({ authority, onboardingRunId });
    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane Prepare Sandbox failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
