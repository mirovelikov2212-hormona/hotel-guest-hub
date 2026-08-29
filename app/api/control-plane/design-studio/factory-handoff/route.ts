import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  asHubDesignDraftPayload,
  stableDesignDraftStringify,
} from "@/lib/product-factory/hub-design-draft";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function sha256(value: unknown) {
  return crypto.createHash("sha256").update(stableDesignDraftStringify(value)).digest("hex");
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const workspaceId = String(request.nextUrl.searchParams.get("workspaceId") || "").trim();
  const revisionId = String(request.nextUrl.searchParams.get("revisionId") || "").trim();
  if (!UUID.test(workspaceId) || !UUID.test(revisionId)) {
    return json({ ok: false, error: "invalid_revision_identity" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("hub_design_draft_revisions")
    .select("id,workspace_id,revision_no,status,schema_version,payload_checksum,source_package_checksum,source_package_json,payload_json,created_at,hub_design_workspaces!inner(id,canonical_url,hotel_name,current_revision_id)")
    .eq("workspace_id", workspaceId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error) {
    console.error("Design Factory handoff revision read failed", { error: error.message });
    return json({ ok: false, error: "handoff_unavailable" }, 503);
  }
  if (!data) return json({ ok: false, error: "revision_not_found" }, 404);

  const payload = asHubDesignDraftPayload(data.payload_json);
  const sourcePackage = data.source_package_json as HotelIntelligencePackage | null;
  if (!payload || sourcePackage?.schemaVersion !== "hotel-intelligence-v1") {
    return json({ ok: false, error: "invalid_revision_payload" }, 409);
  }

  const payloadChecksum = sha256(payload);
  const sourcePackageChecksum = sha256(sourcePackage);
  if (payloadChecksum !== data.payload_checksum || sourcePackageChecksum !== data.source_package_checksum) {
    return json({ ok: false, error: "revision_checksum_mismatch" }, 409);
  }

  const workspace = Array.isArray(data.hub_design_workspaces)
    ? data.hub_design_workspaces[0]
    : data.hub_design_workspaces;
  if (!workspace) return json({ ok: false, error: "workspace_not_found" }, 404);

  return json({
    ok: true,
    handoff: {
      schemaVersion: "hub-design-factory-handoff-v1",
      workspaceId,
      revisionId,
      revisionNo: Number(data.revision_no),
      revisionStatus: data.status,
      revisionSchemaVersion: data.schema_version,
      payloadChecksum,
      sourcePackageChecksum,
      canonicalUrl: workspace.canonical_url,
      hotelName: workspace.hotel_name,
      isCurrentRevision: workspace.current_revision_id === revisionId,
      createdAt: data.created_at,
      sourcePackage,
      designDraft: payload,
      policies: {
        sandboxFirst: true,
        keepProductionInactive: true,
        keepSandboxInactive: true,
        publishRevision: false,
        activateLive: false,
      },
    },
  });
}
