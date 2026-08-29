import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  compareHubDesignDraftRevisions,
  loadHubDesignWorkspaceByCanonicalUrl,
  prepareHubDesignRevision,
  restoreHubDesignDraftRevision,
  saveHubDesignDraftRevision,
} from "@/lib/server/hub-design-draft-revisions";

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

function idempotencyKey(kind: "save" | "restore", parts: Array<string | null | undefined>) {
  const digest = crypto.createHash("sha256").update(parts.map((part) => String(part || "-")).join("|")).digest("hex");
  return `hub-design-${kind}:${digest}`;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PARENT_CONFLICT") || message.includes("CURRENT_REVISION_CONFLICT")) return { code: "revision_conflict", status: 409 };
  if (message.includes("IDEMPOTENCY_CONFLICT")) return { code: "idempotency_conflict", status: 409 };
  if (message.includes("NOT_FOUND")) return { code: "not_found", status: 404 };
  if (message.includes("INVALID") || message.includes("REQUIRED") || message.includes("MISMATCH")) return { code: "invalid_draft", status: 400 };
  return { code: "design_draft_failed", status: 500 };
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const canonicalUrl = request.nextUrl.searchParams.get("canonicalUrl") || "";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || "";
  const leftRevisionId = request.nextUrl.searchParams.get("leftRevisionId") || "";
  const rightRevisionId = request.nextUrl.searchParams.get("rightRevisionId") || "";

  try {
    if (workspaceId && leftRevisionId && rightRevisionId) {
      const diff = await compareHubDesignDraftRevisions({ workspaceId, leftRevisionId, rightRevisionId });
      return json({ ok: true, diff });
    }
    if (!canonicalUrl) return json({ ok: false, error: "missing_canonical_url" }, 400);
    const snapshot = await loadHubDesignWorkspaceByCanonicalUrl(canonicalUrl);
    return json({ ok: true, snapshot });
  } catch (error) {
    const mapped = errorCode(error);
    console.error("Design Studio draft read failed", { error: error instanceof Error ? error.message : String(error) });
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || "");

  try {
    if (action === "compare") {
      const workspaceId = String(body?.workspaceId || "");
      const leftRevisionId = String(body?.leftRevisionId || "");
      const rightRevisionId = String(body?.rightRevisionId || "");
      if (!workspaceId || !leftRevisionId || !rightRevisionId) return json({ ok: false, error: "compare_input_required" }, 400);
      const diff = await compareHubDesignDraftRevisions({ workspaceId, leftRevisionId, rightRevisionId });
      return json({ ok: true, diff });
    }

    if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

    if (action === "save") {
      const sourcePackage = body?.sourcePackage;
      const payload = body?.payload;
      const parentRevisionId = body?.parentRevisionId ? String(body.parentRevisionId) : null;
      const prepared = prepareHubDesignRevision({ sourcePackage, payload });
      const requestedKey = String(body?.idempotencyKey || "").trim();
      const saveKey = requestedKey || idempotencyKey("save", [
        authority.adminId,
        prepared.sourceKey,
        parentRevisionId,
        prepared.payloadChecksum,
        prepared.sourcePackageChecksum,
      ]);
      const result = await saveHubDesignDraftRevision({
        actorAdminId: authority.adminId,
        idempotencyKey: saveKey,
        parentRevisionId,
        sourcePackage,
        payload,
      });
      return json({ ok: true, revision: result });
    }

    if (action === "restore") {
      const workspaceId = String(body?.workspaceId || "");
      const sourceRevisionId = String(body?.sourceRevisionId || "");
      const expectedCurrentRevisionId = String(body?.expectedCurrentRevisionId || "");
      if (!workspaceId || !sourceRevisionId || !expectedCurrentRevisionId) {
        return json({ ok: false, error: "restore_input_required" }, 400);
      }
      const requestedKey = String(body?.idempotencyKey || "").trim();
      const restoreKey = requestedKey || idempotencyKey("restore", [
        authority.adminId,
        workspaceId,
        sourceRevisionId,
        expectedCurrentRevisionId,
      ]);
      const result = await restoreHubDesignDraftRevision({
        actorAdminId: authority.adminId,
        workspaceId,
        sourceRevisionId,
        expectedCurrentRevisionId,
        idempotencyKey: restoreKey,
      });
      return json({ ok: true, revision: result });
    }

    return json({ ok: false, error: "unsupported_action" }, 400);
  } catch (error) {
    const mapped = errorCode(error);
    console.error("Design Studio draft mutation failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}
