import { NextRequest, NextResponse } from "next/server";
import { reconcileSandboxGuestRequestRelationalIds } from "@/lib/server/guest-request-relational-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isAuthorizedInternalRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CONFIG_ADMIN_SECRET || "").trim();
  if (!configuredSecret) return false;
  return req.headers.get("authorization") === `Bearer ${configuredSecret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => key !== "hotelSlug" && key !== "apply" && key !== "limit",
    ) ||
    typeof (body as { hotelSlug?: unknown }).hotelSlug !== "string" ||
    ("apply" in body && typeof (body as { apply?: unknown }).apply !== "boolean") ||
    ("limit" in body &&
      (!Number.isInteger((body as { limit?: unknown }).limit) ||
        Number((body as { limit?: unknown }).limit) < 1 ||
        Number((body as { limit?: unknown }).limit) > 200))
  ) {
    return NextResponse.json(
      { ok: false, error: "INVALID_GUEST_REQUEST_RELATIONAL_RECONCILIATION" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const request = body as {
      hotelSlug: string;
      apply?: boolean;
      limit?: number;
    };
    const result = await reconcileSandboxGuestRequestRelationalIds({
      hotelSlug: request.hotelSlug,
      apply: request.apply === true,
      limit: request.limit,
    });

    return NextResponse.json(result, {
      status: Number(result.status || (result.ok ? 200 : 500)),
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Guest request relational reconciliation failed", error);
    return NextResponse.json(
      { ok: false, error: "GUEST_REQUEST_RELATIONAL_RECONCILIATION_FAILED" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
