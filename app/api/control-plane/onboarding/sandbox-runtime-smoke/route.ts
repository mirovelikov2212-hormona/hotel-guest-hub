import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  getFactoryPreviewRuntimeSmokeStatus,
  settleFactoryPreviewRuntimeSmoke,
  startFactoryPreviewRuntimeSmoke,
} from "@/lib/server/factory-preview-runtime-smoke";

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

function mapSmokeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("P4_8_INVALID_")) return { status: 400, code: "invalid_request" };
  if (message.includes("P4_8_ENVELOPE_NOT_FOUND")) return { status: 404, code: "envelope_not_found" };
  if (
    message.includes("P4_8_PREFLIGHT_NOT_READY")
    || message.includes("P4_8_PREVIEW_RELEASE_EVIDENCE_NOT_VALIDATED")
    || message.includes("P4_8_PREVIEW_")
  ) return { status: 409, code: "preview_not_ready" };
  if (message.includes("P4_8_MARKER_") || message.includes("P4_8_SMOKE_WINDOW_LINEAGE_MISMATCH")) {
    return { status: 409, code: "smoke_lineage_conflict" };
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

    const body = JSON.parse(rawBody) as {
      action?: unknown;
      envelopeProjectionRunId?: unknown;
      smokeRunId?: unknown;
    };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const action = String(body.action || "").trim().toLowerCase();
    if (action === "start") {
      const result = await startFactoryPreviewRuntimeSmoke(body.envelopeProjectionRunId);
      return jsonResponse({ ok: true, ...result }, 201);
    }
    if (action === "settle") {
      const result = await settleFactoryPreviewRuntimeSmoke({
        envelopeProjectionRunId: body.envelopeProjectionRunId,
        smokeRunId: body.smokeRunId,
      });
      return jsonResponse({ ok: true, ...result }, result.state === "waiting" ? 202 : 200);
    }
    if (action === "status") {
      const result = await getFactoryPreviewRuntimeSmokeStatus({
        envelopeProjectionRunId: body.envelopeProjectionRunId,
        smokeRunId: body.smokeRunId,
      });
      return jsonResponse({ ok: true, ...result }, 200);
    }

    return jsonResponse({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    const mapped = mapSmokeError(error);
    console.error("Control Plane Preview runtime smoke failed", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
