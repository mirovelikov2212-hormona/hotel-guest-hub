import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { projectFactoryOnboardingEnvelope } from "@/lib/server/factory-onboarding-envelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 786_432;
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
  if (message.includes("P2_4_FACTORY_ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (message.includes("P2_4_IDEMPOTENCY_CONFLICT") || message.includes("P2_4_ENVELOPE_ALREADY_EXISTS")) {
    return { status: 409, code: "conflict" };
  }
  if (message.includes("P0_FACTORY_") || message.includes("P2_FACTORY_") || message.includes("P2_2_") || message.includes("P2_3_") || message.includes("P2_4_")) {
    return { status: 400, code: "invalid_blueprint" };
  }
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

    const body = JSON.parse(rawBody) as { operationalProjectionRunId?: unknown; blueprint?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }
    if (!body.blueprint || typeof body.blueprint !== "object" || Array.isArray(body.blueprint)) {
      return jsonResponse({ ok: false, error: "invalid_blueprint" }, 400);
    }

    const result = await projectFactoryOnboardingEnvelope({
      authority,
      operationalProjectionRunId: String(body.operationalProjectionRunId || ""),
      blueprint: body.blueprint as Record<string, unknown>,
    });

    return jsonResponse({ ok: true, ...result }, result.replayed ? 200 : 201);
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane onboarding envelope projection failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
