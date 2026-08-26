import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { projectFactoryCommunications } from "@/lib/server/factory-communications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_572_864;
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

  if (message.includes("P2D_COMMUNICATION_FACTORY_ADMIN_FORBIDDEN")) {
    return { status: 403, code: "forbidden" };
  }

  if (
    message.includes("P2D_COMMUNICATION_IDEMPOTENCY_CONFLICT") ||
    message.includes("P2D_COMMUNICATION_EXISTING_CONTACT_CONFLICT") ||
    message.includes("P2D_COMMUNICATION_REPLAY_STATE_INVALID") ||
    message.includes("P2D_COMMUNICATION_STATE_NOT_FAIL_CLOSED") ||
    message.includes("P2D_COMMUNICATION_NATIVE_FAIL_CLOSED_STATE_INVALID")
  ) {
    return { status: 409, code: "conflict" };
  }

  if (
    message.includes("P0_FACTORY_") ||
    message.includes("P2_FACTORY_") ||
    message.includes("P2_3_") ||
    message.includes("P2D_COMMUNICATION_REQUIRED_") ||
    message.includes("P2D_COMMUNICATION_HASH_") ||
    message.includes("P2D_COMMUNICATION_OBJECT_") ||
    message.includes("P2D_COMMUNICATION_OPERATIONAL_") ||
    message.includes("P2D_COMMUNICATION_CORE_") ||
    message.includes("P2D_COMMUNICATION_ONBOARDING_") ||
    message.includes("P2D_COMMUNICATION_BLUEPRINT_") ||
    message.includes("P2D_COMMUNICATION_ENVELOPE_") ||
    message.includes("P2D_COMMUNICATION_NATIVE_PROJECTION_") ||
    message.includes("P2D_COMMUNICATION_SCHEMA_") ||
    message.includes("P2D_COMMUNICATION_CONTACT_") ||
    message.includes("P2D_COMMUNICATION_DEPARTMENT_") ||
    message.includes("P2D_COMMUNICATION_PROJECTION_COUNT_")
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

    const body = JSON.parse(rawBody) as {
      operationalProjectionRunId?: unknown;
      blueprint?: unknown;
    };

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    if (!body.blueprint || typeof body.blueprint !== "object" || Array.isArray(body.blueprint)) {
      return jsonResponse({ ok: false, error: "invalid_blueprint" }, 400);
    }

    const result = await projectFactoryCommunications({
      authority,
      operationalProjectionRunId: String(body.operationalProjectionRunId || ""),
      blueprint: body.blueprint as Record<string, unknown>,
    });

    return jsonResponse(
      {
        ok: true,
        replayed: result.replayed,
        projectionRunId: result.projectionRunId,
        productionHotelId: result.productionHotelId,
        sandboxHotelId: result.sandboxHotelId,
        blueprintHash: result.blueprintHash,
        operationalResourcesHash: result.operationalResourcesHash,
        communicationsHash: result.communicationsHash,
        counts: result.counts,
      },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane communications projection failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
