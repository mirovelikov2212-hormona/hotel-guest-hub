import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { persistHotelScannerV2Result, loadPersistedSyncScannerV2Result } from "@/lib/server/hotel-intelligence-persistence-v2";
import { assertV2IdempotencyKey, deriveSyncScanRunIdV2 } from "@/lib/server/hotel-scan-envelope-v2";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { HotelScannerV2NetworkError } from "@/lib/server/hotel-scanner-v2-network";
import { runHotelIntakePipelineV2 } from "@/lib/server/hotel-scanner-v2-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Preview benchmark only. Scanner V2 is still a synchronous compatibility route;
// production client UX will move to a durable job/workflow so the browser request
// does not need to remain open for the entire crawl + extraction lifecycle.
export const maxDuration = 800;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  try {
    const idempotencyKey = request.headers.get("Idempotency-Key");
    assertV2IdempotencyKey(idempotencyKey);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((key) => !["url", "lang"].includes(key))
      || typeof body.url !== "string" || (body.lang !== undefined && !["en", "bg"].includes(body.lang))) {
      return json({ ok: false, error: "invalid_v2_request" }, 400);
    }
    const url = body.url.trim();
    const lang: "en" | "bg" = body.lang ?? "bg";
    if (!url) return json({ ok: false, error: "missing_url", stage: "discovery" }, 400);
    const scanRunId = deriveSyncScanRunIdV2(authority.adminId, idempotencyKey);
    const syncRequest = { requestedUrl: url, outputLanguage: lang, idempotencyKey };
    const retry = await loadPersistedSyncScannerV2Result({ actorAdminId: authority.adminId, syncRequest });
    if (retry) return json({ ok: true, draft: true, lang, ...retry.result, persistence: retry.persistence });
    const result = await runHotelIntakePipelineV2({ url, outputLanguage: lang });
    await persistHotelScannerV2Result({ result, scanRunId, actorAdminId: authority.adminId, outputLanguage: lang, syncRequest });
    const persisted = await loadPersistedSyncScannerV2Result({ actorAdminId: authority.adminId, syncRequest });
    if (!persisted) throw new Error("V2_SCAN_NOT_FOUND");
    return json({ ok: true, draft: true, lang, ...persisted.result, persistence: persisted.persistence });
  } catch (error) {
    if (error instanceof HotelScannerV2NetworkError) {
      return json({ ok: false, error: error.code, stage: "discovery" }, error.statusCode);
    }

    const message = errorMessage(error);
    if (message.includes("V2_IDEMPOTENCY_INVALID")) return json({ ok: false, error: "invalid_idempotency_key" }, 400);
    if (message.includes("V2_ADMIN_FORBIDDEN")) return json({ ok: false, error: "forbidden" }, 403);
    if (/V2_.*(?:CONFLICT|CHECKSUM|LINEAGE)/u.test(message)) return json({ ok: false, error: "v2_authority_conflict" }, 409);
    console.error("Hotel Scanner V2 failed", { error: message });
    if (message === "openai_api_key_missing") return json({ ok: false, error: "scanner_v2_ai_not_configured", stage: "extraction" }, 503);
    if (message.includes("Request timed out") || message.includes("timeout")) return json({ ok: false, error: "scanner_v2_timeout", stage: "extraction" }, 504);
    if (/\b429\b|rate limit|tokens per min|TPM/iu.test(message)) return json({ ok: false, error: "scanner_v2_rate_limited", stage: "extraction" }, 503);
    if (message.startsWith("hotel_scanner_v2_ai_incomplete:")) return json({ ok: false, error: "scanner_v2_ai_incomplete", stage: "extraction" }, 502);
    return json({ ok: false, error: "scanner_v2_failed", stage: "pipeline" }, 502);
  }
}
