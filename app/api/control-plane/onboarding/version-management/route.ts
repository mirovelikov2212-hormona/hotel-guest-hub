import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  runFactoryVersionManagementAction,
  type FactoryVersionManagementAction,
} from "@/lib/server/factory-production-version-management-actions";
import { getFactoryProductionVersionManagementSnapshot } from "@/lib/server/factory-production-version-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const ACTIONS = new Set<FactoryVersionManagementAction>([
  "upgrade_readiness",
  "upgrade_publication",
  "upgrade_certification",
  "upgrade_activation",
  "restore_readiness",
  "restore_publication",
  "restore_certification",
  "restore_activation",
]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isMigrationRequired(message: string) {
  const text = message.toLowerCase();
  return text.includes("schema cache")
    || text.includes("pgrst202")
    || text.includes("pgrst204")
    || text.includes("release_mode")
    || text.includes("assess_factory_production_readiness_v2")
    || text.includes("publish_factory_production_revision_v2")
    || text.includes("certify_factory_production_runtime_v2")
    || text.includes("activate_factory_production_live_v2")
    || text.includes("assess_factory_production_restore_readiness_v1")
    || text.includes("publish_factory_production_restore_v1")
    || text.includes("certify_factory_production_restore_runtime_v1")
    || text.includes("activate_factory_production_restore_live_v1");
}

function mapFactoryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (message.includes("_FACTORY_ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (message.includes("stale_live_revision") || message.includes("_STALE_LIVE_REVISION") || message.includes("_LIVE_AUTHORITY_CHANGED")) {
    return { status: 409, code: "stale_live_revision" };
  }
  if (message.includes("EXACT_PRODUCTION_RELEASE_NOT_VALIDATED") || message.includes("CERTIFIED_DEPLOYMENT_CHANGED")) {
    return { status: 409, code: "production_release_not_certified" };
  }
  if (isMigrationRequired(message)) return { status: 503, code: "change_management_migration_required" };
  if (message.includes("CM1_") || message.includes("CM2_") || message.includes("CM3_") || message.includes("CM4_")) {
    return { status: 400, code: "version_management_gate_failed" };
  }
  if (lower.includes("invalid input syntax") || lower.includes("invalid uuid")) return { status: 400, code: "invalid_request" };
  return { status: 503, code: "unavailable" };
}

export async function GET(req: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const hotelId = req.nextUrl.searchParams.get("hotelId");
  if (!hotelId) return jsonResponse({ ok: false, error: "hotel_id_required" }, 400);

  try {
    const snapshot = await getFactoryProductionVersionManagementSnapshot({
      authority,
      productionHotelId: hotelId,
    });
    return jsonResponse({ ok: true, snapshot });
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane version-management snapshot failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return jsonResponse({ ok: false, error: "forbidden" }, 403);

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
      locator?: unknown;
      reason?: unknown;
      confirmed?: unknown;
    };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const action = String(body.action || "") as FactoryVersionManagementAction;
    if (!ACTIONS.has(action) || body.confirmed !== true || body.locator == null) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await runFactoryVersionManagementAction({
      authority,
      action,
      locator: body.locator,
      reason: body.reason,
      confirmed: true,
    });

    return jsonResponse({ ok: true, action, result }, 201);
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane version-management action failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
