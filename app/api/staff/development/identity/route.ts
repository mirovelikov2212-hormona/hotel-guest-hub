import { NextRequest, NextResponse } from "next/server";

import {
  authenticateStaffDevelopmentIdentity,
  getCurrentStaffDevelopmentIdentity,
  listStaffDevelopmentIdentityCandidates,
  revokeCurrentStaffDevelopmentIdentity,
} from "@/lib/server/staff-development-identity";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("WRITES_DISABLED")) return 503;
  if (message.includes("PIN_LOCKED")) return 429;
  if (
    message.includes("OPERATIONAL_SESSION_REQUIRED")
    || message.includes("PERSONAL_PIN_INVALID")
    || message.includes("CREDENTIAL_NOT_FOUND")
  ) return 401;
  if (
    message.includes("ROLE_MISMATCH")
    || message.includes("DEPARTMENT_MISMATCH")
  ) return 403;
  return 400;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (
    message.includes("PERSONAL_PIN_INVALID")
    || message.includes("CREDENTIAL_NOT_FOUND")
  ) {
    return "STAFF_DEVELOPMENT_IDENTITY_AUTH_FAILED";
  }
  return message || "STAFF_DEVELOPMENT_IDENTITY_FAILED";
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();
  const operationalRole = String(
    req.nextUrl.searchParams.get("operationalRole") || "",
  ).trim().toLowerCase();

  try {
    const identity = await getCurrentStaffDevelopmentIdentity(hotelSlug);
    const candidates = operationalRole
      ? await listStaffDevelopmentIdentityCandidates({
          hotelSlug,
          operationalRole,
        })
      : [];

    return NextResponse.json(
      {
        ok: true,
        identity,
        candidates,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: errorStatus(error), headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "STAFF_DEVELOPMENT_BODY_REQUIRED" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || null;

    const identity = await authenticateStaffDevelopmentIdentity({
      hotelSlug: body.hotelSlug,
      operationalRole: body.operationalRole,
      staffUserId: body.staffUserId,
      personalPin: body.personalPin,
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json(
      { ok: true, identity },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: errorStatus(error), headers: NO_STORE_HEADERS },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();

  await revokeCurrentStaffDevelopmentIdentity(hotelSlug).catch(() => null);

  return NextResponse.json(
    { ok: true },
    { headers: NO_STORE_HEADERS },
  );
}
