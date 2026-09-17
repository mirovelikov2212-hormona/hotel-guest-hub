import { NextRequest, NextResponse } from "next/server";
import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  importHotelIntelligenceReviewV2, loadHotelIntelligenceReviewV2,
  approvePersistedHotelIntelligenceV2, loadApprovedHotelIntelligenceV2,
} from "@/lib/server/hotel-intelligence-persistence-v2";
import { assertV2Uuid } from "@/lib/server/hotel-scan-envelope-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" } });
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORBIDDEN")) return json({ ok: false, error: "forbidden" }, 403);
  if (message.includes("NOT_FOUND")) return json({ ok: false, error: "not_found" }, 404);
  if (/CONFLICT|CHECKSUM|LINEAGE|NOT_READY/u.test(message)) return json({ ok: false, error: "v2_authority_conflict" }, 409);
  if (/INVALID|REQUIRED|FORBIDDEN_CONTENT/u.test(message)) return json({ ok: false, error: "invalid_v2_request" }, 400);
  return json({ ok: false, error: "v2_persistence_failed" }, 500);
}
function strictKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(body, key))) throw new Error("V2_INPUT_INVALID");
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  try {
    const reviewId = request.nextUrl.searchParams.get("reviewId");
    const approvedRevisionId = request.nextUrl.searchParams.get("approvedRevisionId");
    if (Boolean(reviewId) === Boolean(approvedRevisionId)) throw new Error("V2_READ_INPUT_INVALID");
    if (approvedRevisionId) return json({ ok: true, approved: await loadApprovedHotelIntelligenceV2(approvedRevisionId) });
    return json({ ok: true, review: await loadHotelIntelligenceReviewV2(reviewId!) });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("V2_INPUT_INVALID");
    if (body.action === "import") {
      strictKeys(body, ["action", "scanRunId"]);
      assertV2Uuid(body.scanRunId);
      return json({ ok: true, review: await importHotelIntelligenceReviewV2({ actorAdminId: authority.adminId, scanRunId: body.scanRunId }) });
    }
    if (body.action === "approve") {
      strictKeys(body, ["action", "reviewId", "expectedCurrentRevisionId", "idempotencyKey"]);
      assertV2Uuid(body.reviewId);
      assertV2Uuid(body.expectedCurrentRevisionId);
      if (typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,180}$/u.test(body.idempotencyKey)) throw new Error("V2_INPUT_INVALID");
      const approved = await approvePersistedHotelIntelligenceV2({ actorAdminId: authority.adminId, reviewId: body.reviewId,
        expectedCurrentRevisionId: body.expectedCurrentRevisionId, idempotencyKey: body.idempotencyKey });
      return json({ ok: true, approved });
    }
    throw new Error("V2_ACTION_INVALID");
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: "invalid_json" }, 400);
    return failure(error);
  }
}
