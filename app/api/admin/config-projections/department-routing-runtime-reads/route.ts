import { NextRequest, NextResponse } from "next/server";
import { setSandboxNormalizedDepartmentRoutingReads } from "@/lib/server/normalized-department-routing-runtime-activation";

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

  const authorization = req.headers.get("authorization") || "";
  return authorization === `Bearer ${configuredSecret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "hotelSlug" && key !== "enabled") ||
    typeof (body as { hotelSlug?: unknown }).hotelSlug !== "string" ||
    typeof (body as { enabled?: unknown }).enabled !== "boolean"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_DEPARTMENT_ROUTING_RUNTIME_READ_ACTIVATION_REQUEST",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const request = body as { hotelSlug: string; enabled: boolean };
  const result = await setSandboxNormalizedDepartmentRoutingReads({
    hotelSlug: request.hotelSlug,
    enabled: request.enabled,
    actor: "internal_config_department_routing_runtime_reads",
  });

  return NextResponse.json(result, {
    status: Number(result.status || (result.ok ? 200 : 500)),
    headers: NO_STORE_HEADERS,
  });
}
