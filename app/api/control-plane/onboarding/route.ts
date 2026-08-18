import { NextRequest, NextResponse } from "next/server";

import { prepareFactoryOnboarding } from "@/lib/product-factory/factory-onboarding-model.mjs";
import { beginFactoryOnboarding } from "@/lib/server/factory-onboarding";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 262_144;
const BLUEPRINT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type FoundationApproval = {
  createDraftTenant?: unknown;
  keepProductionInactive?: unknown;
  keepSandboxInactive?: unknown;
  publishRevision?: unknown;
  activateLive?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function hasExactFoundationApproval(value: unknown): value is FoundationApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const approval = value as FoundationApproval;
  const keys = Object.keys(approval).sort();
  const expectedKeys = [
    "activateLive",
    "createDraftTenant",
    "keepProductionInactive",
    "keepSandboxInactive",
    "publishRevision",
  ];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return false;
  }
  return (
    approval.createDraftTenant === true &&
    approval.keepProductionInactive === true &&
    approval.keepSandboxInactive === true &&
    approval.publishRevision === false &&
    approval.activateLive === false
  );
}

function mapFactoryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("P2_FACTORY_ADMIN_FORBIDDEN")) {
    return { status: 403, code: "forbidden" };
  }

  if (
    message.includes("P2_FACTORY_IDEMPOTENCY_CONFLICT") ||
    message.includes("P2_FACTORY_PROPERTY_EXISTS") ||
    message.includes("P2_FACTORY_HOTEL_IDENTITY_EXISTS")
  ) {
    return { status: 409, code: "conflict" };
  }

  if (
    message.includes("P0_FACTORY_") ||
    message.includes("P2_FACTORY_INVALID_") ||
    message.includes("P2_FACTORY_SECRET_FORBIDDEN") ||
    message.includes("P2_FACTORY_ENVIRONMENTS_REQUIRED") ||
    message.includes("P2_FACTORY_SANDBOX_IDENTITY_TOO_LONG")
  ) {
    return { status: 400, code: "invalid_blueprint" };
  }

  return { status: 503, code: "unavailable" };
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

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
      idempotencyKey?: unknown;
      expectedBlueprintHash?: unknown;
      approval?: unknown;
      blueprint?: unknown;
    };

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    if (!body.blueprint || typeof body.blueprint !== "object" || Array.isArray(body.blueprint)) {
      return jsonResponse({ ok: false, error: "invalid_blueprint" }, 400);
    }

    if (!hasExactFoundationApproval(body.approval)) {
      return jsonResponse({ ok: false, error: "approval_required" }, 400);
    }

    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const expectedBlueprintHash = String(body.expectedBlueprintHash || "").trim().toLowerCase();
    if (!BLUEPRINT_HASH_PATTERN.test(expectedBlueprintHash)) {
      return jsonResponse({ ok: false, error: "invalid_preflight_hash" }, 400);
    }

    // Re-run the exact P2.1 normalization and secret checks on the server. The
    // approved hash must match the blueprint that is about to enter the DB transaction.
    const prepared = prepareFactoryOnboarding({
      idempotencyKey,
      blueprint: body.blueprint as Record<string, unknown>,
    });
    if (prepared.blueprintHash !== expectedBlueprintHash) {
      return jsonResponse({ ok: false, error: "stale_preflight" }, 409);
    }

    const result = await beginFactoryOnboarding({
      authority,
      idempotencyKey,
      blueprint: prepared.blueprint,
    });

    return jsonResponse(
      {
        ok: true,
        replayed: result.replayed,
        onboardingRunId: result.onboardingRunId,
        organizationId: result.organizationId,
        propertyId: result.propertyId,
        productionHotelId: result.productionHotelId,
        sandboxHotelId: result.sandboxHotelId,
        productionRevisionId: result.productionRevisionId,
        sandboxRevisionId: result.sandboxRevisionId,
        blueprintHash: result.blueprintHash,
        identities: result.identities,
        foundation: {
          propertyLifecycle: "draft",
          productionActive: false,
          sandboxActive: false,
          revisionPublished: false,
          liveActivated: false,
        },
      },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    const mapped = mapFactoryError(error);
    console.error("Control Plane onboarding failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
