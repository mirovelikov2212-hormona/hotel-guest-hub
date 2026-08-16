import "server-only";

import { NextRequest, NextResponse } from "next/server";

function forbidden() {
  return NextResponse.json(
    {
      ok: false,
      error: "Cross-site Control Plane request is not allowed",
      code: "CONTROL_PLANE_ORIGIN_FORBIDDEN",
    },
    { status: 403 },
  );
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function enforceControlPlaneSameOrigin(req: NextRequest) {
  const secFetchSite = String(req.headers.get("sec-fetch-site") || "")
    .trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") return forbidden();

  const originHeader = String(req.headers.get("origin") || "").trim();
  if (!originHeader) return null;
  if (originHeader.toLowerCase() === "null") return forbidden();

  const requestOrigin = normalizeOrigin(req.nextUrl.origin);
  const suppliedOrigin = normalizeOrigin(originHeader);
  if (!requestOrigin || !suppliedOrigin || requestOrigin !== suppliedOrigin) {
    return forbidden();
  }

  return null;
}
