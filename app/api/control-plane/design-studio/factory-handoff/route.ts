import { NextRequest, NextResponse } from "next/server";

import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { loadVerifiedHubDesignFactoryHandoff } from "@/lib/server/factory-release-design-authority";

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

function mapHandoffError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("WORKSPACE_INVALID") || message.includes("REVISION_INVALID")) {
    return { status: 400, code: "invalid_revision_identity" };
  }
  if (message.includes("REVISION_NOT_FOUND") || message.includes("WORKSPACE_NOT_FOUND")) {
    return { status: 404, code: "revision_not_found" };
  }
  if (message.includes("READ_FAILED")) return { status: 503, code: "handoff_unavailable" };
  if (message.includes("CHECKSUM")) return { status: 409, code: "revision_checksum_mismatch" };
  if (message.includes("APPROVED_INTELLIGENCE_LINEAGE_REQUIRED")) {
    return { status: 409, code: "approved_intelligence_lineage_required" };
  }
  if (message.includes("APPROVED_INTELLIGENCE_SOURCE_MISMATCH")) {
    return { status: 409, code: "approved_intelligence_source_mismatch" };
  }
  if (message.includes("APPROVED_INTELLIGENCE_LINEAGE_MISMATCH")) {
    return { status: 409, code: "approved_intelligence_lineage_mismatch" };
  }
  if (message.includes("HOTEL_INTELLIGENCE") || message.includes("APPROVED_REVISION")) {
    return { status: 409, code: "approved_intelligence_lineage_invalid" };
  }
  return { status: 409, code: "invalid_revision_payload" };
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const handoff = await loadVerifiedHubDesignFactoryHandoff({
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      revisionId: request.nextUrl.searchParams.get("revisionId"),
    });
    return json({ ok: true, handoff });
  } catch (error) {
    const mapped = mapHandoffError(error);
    console.error("Design Factory handoff validation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}
