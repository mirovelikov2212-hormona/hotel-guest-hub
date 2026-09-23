import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  listPlatformIncidents,
  transitionPlatformIncident,
} from "@/lib/server/incident-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function mapError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error || "");

  if (message.includes("PLATFORM_ADMIN_FORBIDDEN")) {
    return { status: 403, code: "forbidden" };
  }
  if (message === "INCIDENT_NOT_FOUND") {
    return { status: 404, code: "incident_not_found" };
  }
  if (message.includes("STATUS_TRANSITION_INVALID")) {
    return { status: 409, code: "incident_transition_invalid" };
  }
  if (message.includes("DATASET_CAP_EXCEEDED")) {
    return { status: 409, code: "incident_dataset_too_large" };
  }
  if (message.startsWith("INCIDENT_")) {
    return { status: 400, code: "incident_request_rejected" };
  }
  return { status: 503, code: "incident_center_unavailable" };
}

export async function GET() {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const result = await listPlatformIncidents({ authority });
    return json({ ok: true, result });
  } catch (error) {
    const mapped = mapError(error);
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload_too_large" }, 413);
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await transitionPlatformIncident({
      authority,
      hotelId: body.hotelId,
      incidentId: body.incidentId,
      status: body.status,
      note: body.note,
    });

    return json({ ok: true, result });
  } catch (error) {
    const mapped = mapError(error);
    console.error("Incident Center transition failed", error);
    return json({ ok: false, error: mapped.code }, mapped.status);
  }
}
