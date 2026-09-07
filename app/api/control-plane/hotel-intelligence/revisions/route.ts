import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  approveHotelIntelligenceRevision,
  loadApprovedHotelIntelligenceEnvelope,
  loadHotelIntelligenceWorkspaceByCanonicalUrl,
  prepareHotelIntelligenceReview,
  prepareInitialHotelIntelligenceReview,
  saveHotelIntelligenceRevision,
} from "@/lib/server/hotel-intelligence-revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function idempotencyKey(kind: "save" | "approve", parts: Array<string | null | undefined>) {
  const digest = crypto.createHash("sha256").update(parts.map((part) => String(part || "-")).join("|")).digest("hex");
  return `hotel-intelligence-${kind}:${digest}`;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PARENT_CONFLICT") || message.includes("CURRENT_REVISION_CONFLICT")) {
    return { code: "revision_conflict", status: 409 };
  }
  if (message.includes("IDEMPOTENCY_CONFLICT")) return { code: "idempotency_conflict", status: 409 };
  if (message.includes("NOT_APPROVED")) return { code: "revision_not_approved", status: 409 };
  if (message.includes("APPROVAL_NOT_READY") || message.includes("PENDING_FACTS") || message.includes("UNRESOLVED")) {
    return { code: "approval_not_ready", status: 409 };
  }
  if (message.includes("NOT_FOUND")) return { code: "not_found", status: 404 };
  if (message.includes("INVALID") || message.includes("REQUIRED") || message.includes("MISMATCH")) {
    return { code: "invalid_intelligence_revision", status: 400 };
  }
  return { code: "hotel_intelligence_revision_failed", status: 500 };
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const approvedRevisionId = request.nextUrl.searchParams.get("approvedRevisionId") || "";
  const canonicalUrl = request.nextUrl.searchParams.get("canonicalUrl") || "";

  try {
    if (approvedRevisionId) {
      const approved = await loadApprovedHotelIntelligenceEnvelope(approvedRevisionId);
      return json({ ok: true, approved });
    }
    if (!canonicalUrl) return json({ ok: false, error: "missing_canonical_url" }, 400);
    const snapshot = await loadHotelIntelligenceWorkspaceByCanonicalUrl(canonicalUrl);
    return json({ ok: true, snapshot });
  } catch (error) {
    const mapped = errorCode(error);
    console.error("Hotel Intelligence review read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || "");

  try {
    if (action === "save") {
      const parentRevisionId = body?.parentRevisionId ? String(body.parentRevisionId) : null;
      const intelligencePackage = body?.intelligencePackage;
      const reviewContent = body?.reviewContent;
      const scannerPackageChecksum = String(body?.scannerPackageChecksum || "").trim();
      const diagnostics = body?.diagnostics && typeof body.diagnostics === "object"
        ? body.diagnostics as { model?: unknown; coreMode?: unknown }
        : null;

      const prepared = intelligencePackage
        ? prepareInitialHotelIntelligenceReview({ intelligencePackage, diagnostics })
        : prepareHotelIntelligenceReview({
            content: reviewContent,
            scannerPackageChecksum,
            provenance: { kind: "human_review" },
          });
      const effectiveContent = reviewContent || prepared.contentJson;
      const finalPrepared = reviewContent
        ? prepareHotelIntelligenceReview({
            content: effectiveContent,
            scannerPackageChecksum: prepared.scannerPackageChecksum,
            provenance: intelligencePackage ? prepared.provenanceJson : { kind: "human_review" },
          })
        : prepared;
      const requestedKey = String(body?.idempotencyKey || "").trim();
      const saveKey = requestedKey || idempotencyKey("save", [
        authority.adminId,
        finalPrepared.sourceKey,
        parentRevisionId,
        finalPrepared.scannerPackageChecksum,
        finalPrepared.contentChecksum,
      ]);

      const result = await saveHotelIntelligenceRevision({
        actorAdminId: authority.adminId,
        idempotencyKey: saveKey,
        parentRevisionId,
        content: effectiveContent,
        intelligencePackage,
        scannerPackageChecksum: finalPrepared.scannerPackageChecksum,
        provenance: finalPrepared.provenanceJson,
        diagnostics,
      });
      return json({ ok: true, revision: result });
    }

    if (action === "approve") {
      const workspaceId = String(body?.workspaceId || "");
      const sourceRevisionId = String(body?.sourceRevisionId || "");
      const expectedCurrentRevisionId = String(body?.expectedCurrentRevisionId || "");
      if (!workspaceId || !sourceRevisionId || !expectedCurrentRevisionId) {
        return json({ ok: false, error: "approval_input_required" }, 400);
      }
      const requestedKey = String(body?.idempotencyKey || "").trim();
      const approveKey = requestedKey || idempotencyKey("approve", [
        authority.adminId,
        workspaceId,
        sourceRevisionId,
        expectedCurrentRevisionId,
      ]);
      const result = await approveHotelIntelligenceRevision({
        actorAdminId: authority.adminId,
        workspaceId,
        sourceRevisionId,
        expectedCurrentRevisionId,
        idempotencyKey: approveKey,
      });
      const approved = await loadApprovedHotelIntelligenceEnvelope(result.revisionId);
      return json({ ok: true, revision: result, approved });
    }

    return json({ ok: false, error: "unsupported_action" }, 400);
  } catch (error) {
    const mapped = errorCode(error);
    console.error("Hotel Intelligence review mutation failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}
