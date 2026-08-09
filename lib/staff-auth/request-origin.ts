import "server-only";
import { NextRequest, NextResponse } from "next/server";

function forbidden() {
  return NextResponse.json(
    {
      ok: false,
      error: "Cross-site staff request is not allowed",
      code: "STAFF_ORIGIN_FORBIDDEN",
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

export function enforceStaffSameOrigin(req: NextRequest) {
  const secFetchSite = String(req.headers.get("sec-fetch-site") || "")
    .trim()
    .toLowerCase();

  if (secFetchSite === "cross-site") {
    return forbidden();
  }

  const originHeader = String(req.headers.get("origin") || "").trim();

  // Some installed PWAs, older browsers, tests, and server-side callers may
  // omit browser provenance headers. Keep that compatibility path while
  // rejecting requests that are explicitly proven to be cross-origin.
  if (!originHeader) {
    return null;
  }

  if (originHeader.toLowerCase() === "null") {
    return forbidden();
  }

  const requestOrigin = normalizeOrigin(req.nextUrl.origin);
  const suppliedOrigin = normalizeOrigin(originHeader);

  if (!requestOrigin || !suppliedOrigin || suppliedOrigin !== requestOrigin) {
    return forbidden();
  }

  return null;
}
