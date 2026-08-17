import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  prepareFactoryOnboarding,
} from "@/lib/product-factory/factory-onboarding-model.mjs";
import { validateFactoryBlueprint } from "@/lib/product-factory/factory-blueprint-model.mjs";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 262_144;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapPreflightError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("P2_FACTORY_SECRET_FORBIDDEN")) return "secret_forbidden";
  if (message.includes("P0_FACTORY_") || message.includes("P2_FACTORY_INVALID_")) {
    return "invalid_blueprint";
  }
  return "unavailable";
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

    const body = JSON.parse(rawBody) as { blueprint?: unknown };
    if (!body?.blueprint || typeof body.blueprint !== "object" || Array.isArray(body.blueprint)) {
      return jsonResponse({ ok: false, error: "invalid_blueprint" }, 400);
    }

    const prepared = prepareFactoryOnboarding({
      blueprint: body.blueprint,
      idempotencyKey: `preflight:${randomUUID()}`,
    });
    const summary = validateFactoryBlueprint(prepared.blueprint);

    return jsonResponse(
      {
        ok: true,
        blueprintHash: prepared.blueprintHash,
        identities: prepared.identities,
        summary: {
          roomCount: summary.roomCount,
          localeCount: summary.localeCount,
          departmentCount: summary.departmentCount,
          serviceCount: summary.serviceCount,
          workflowCount: summary.workflowCount,
          integrationCount: summary.integrationCount,
        },
      },
      200,
    );
  } catch (error) {
    const code = mapPreflightError(error);
    console.error("Control Plane factory blueprint preflight failed", error);
    return jsonResponse({ ok: false, error: code }, code === "unavailable" ? 503 : 400);
  }
}
