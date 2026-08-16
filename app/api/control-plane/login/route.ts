import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformAdminCredentials } from "@/lib/server/control-plane-auth";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import {
  issueControlPlaneSession,
  revokeCurrentControlPlaneSession,
} from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function redirectToLogin(req: NextRequest, code: string) {
  const url = new URL("/control-plane/login", req.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 8_192) {
    return redirectToLogin(req, "invalid");
  }

  try {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    const authority = await authenticatePlatformAdminCredentials({ email, password });
    if (!authority) return redirectToLogin(req, "invalid");

    const expiresAt = await issueControlPlaneSession(authority.adminId);
    try {
      await logControlPlaneAudit({
        actorAdminId: authority.adminId,
        action: "control_plane_login",
        resourceType: "platform_admin_session",
        resourceId: authority.adminId,
        metadata: {
          role: authority.role,
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (auditError) {
      await revokeCurrentControlPlaneSession();
      throw auditError;
    }

    return NextResponse.redirect(new URL("/control-plane", req.url), {
      status: 303,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Control Plane login failed", error);
    return redirectToLogin(req, "unavailable");
  }
}
