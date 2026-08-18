import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { certifyFactorySandboxFromTrustedEvidence } from "@/lib/server/factory-trusted-sandbox-certification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const ALLOWED_BODY_KEYS = new Set(["envelopeProjectionRunId", "smokeRunId"]);
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
  if (message.includes("P2_5_FACTORY_ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (message.includes("P2_5_IDEMPOTENCY_CONFLICT")) return { status: 409, code: "conflict" };
  if (message.includes("P4_10_INVALID_")) return { status: 400, code: "invalid_request" };
  if (message.includes("P4_10_ENVELOPE_NOT_FOUND")) return { status: 404, code: "envelope_not_found" };
  if (message.includes("P4_10_")) return { status: 409, code: "trusted_evidence_not_ready" };
  if (message.includes("P2_5_")) return { status: 400, code: "certification_gate_failed" };
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

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }
    if ("checks" in body || "evidence" in body) {
      return jsonResponse({ ok: false, error: "client_evidence_not_accepted" }, 400);
    }
    if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await certifyFactorySandboxFromTrustedEvidence({
      authority,
      envelopeProjectionRunId: body.envelopeProjectionRunId,
      smokeRunId: body.smokeRunId,
    });

    return jsonResponse({ ok: true, ...result }, result.replayed ? 200 : 201);
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane Sandbox certification failed", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
