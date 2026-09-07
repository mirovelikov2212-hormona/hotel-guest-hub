import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { upsertMassageCatalogService } from "@/lib/server/massage-catalog-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 65_536;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("MASSAGE_CATALOG_ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (message.includes("MASSAGE_CATALOG_HOTEL_NOT_FOUND")) return { status: 404, code: "hotel_not_found" };
  if (message.includes("MASSAGE_CATALOG_")) return { status: 400, code: "catalog_update_rejected" };
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

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const result = await upsertMassageCatalogService({
      authority,
      service: {
        hotelId: String(body.hotelId || "").trim(),
        serviceId: String(body.serviceId || "").trim(),
        active: body.active === true,
        nameI18n:
          body.nameI18n && typeof body.nameI18n === "object" && !Array.isArray(body.nameI18n)
            ? (body.nameI18n as Record<string, string>)
            : {},
        durationMinutes: Number(body.durationMinutes),
        bufferMinutes: Number(body.bufferMinutes),
        price: Number(body.price),
        currency: String(body.currency || "").trim(),
        sortOrder: Number(body.sortOrder),
      },
    });

    return jsonResponse({ ok: true, result }, result.created === true ? 201 : 200);
  } catch (error) {
    const mapped = mapError(error);
    console.error("Control Plane massage catalogue update failed", error);
    return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
  }
}
