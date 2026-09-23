import { NextRequest, NextResponse } from "next/server";

import { reportManagerIncident } from "@/lib/server/incident-center";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

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

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

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
    const result = await reportManagerIncident({
      hotelSlug: body.hotelSlug,
      kind: body.kind,
      module: body.module,
      summary: body.summary,
      details: body.details,
      severity: body.severity,
      roomNumber: body.roomNumber,
      departmentId: body.departmentId,
      requestId: body.requestId,
      errorCode: body.errorCode,
    });

    return json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "INCIDENT_REPORT_UNAVAILABLE";

    if (message === "INCIDENT_MANAGER_SESSION_REQUIRED") {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (message === "INCIDENT_MANAGER_SCOPE_MISMATCH") {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    if (message.startsWith("INCIDENT_")) {
      return json({ ok: false, error: "incident_report_rejected" }, 400);
    }

    console.error("Manager incident report failed", error);
    return json({ ok: false, error: "incident_report_unavailable" }, 503);
  }
}
