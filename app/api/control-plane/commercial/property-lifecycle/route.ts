import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { transitionPropertyCommercialLifecycle } from "@/lib/server/property-commercial-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 65_536;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapCommercialError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("P3_1_FACTORY_ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (
    message.includes("P3_1_IDEMPOTENCY_CONFLICT")
    || message.includes("P3_1_VERSION_CONFLICT")
    || message.includes("P3_1_REPLAY_STATE_DRIFT")
  ) {
    return { status: 409, code: "commercial_state_conflict" };
  }
  if (message.includes("P3_1_PRODUCTION_NOT_LIVE")) {
    return { status: 409, code: "production_not_live" };
  }
  if (message.includes("P3_1_")) return { status: 400, code: "commercial_transition_rejected" };
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
      propertyId?: unknown;
      requestId?: unknown;
      action?: unknown;
      expectedVersion?: unknown;
      trialDays?: unknown;
      trialEndsAt?: unknown;
      planCode?: unknown;
      reason?: unknown;
    };

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await transitionPropertyCommercialLifecycle({
      authority,
      propertyId: body.propertyId,
      requestId: body.requestId,
      action: body.action,
      expectedVersion: body.expectedVersion,
      trialDays: body.trialDays,
      trialEndsAt: body.trialEndsAt,
      planCode: body.planCode,
      reason: body.reason,
    });

    return jsonResponse({ ok: true, ...result }, result.replayed ? 200 : 201);
  } catch (error) {
    const mapped = mapCommercialError(error);
    console.error("Control Plane commercial lifecycle transition failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
