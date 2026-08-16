import { NextRequest, NextResponse } from "next/server";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import {
  getCurrentPlatformAdminSession,
  revokeCurrentControlPlaneSession,
} from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  await revokeCurrentControlPlaneSession();

  if (authority) {
    await logControlPlaneAudit({
      actorAdminId: authority.adminId,
      action: "control_plane_logout",
      resourceType: "platform_admin_session",
      resourceId: authority.adminId,
      metadata: { role: authority.role },
    }).catch((error) => console.error("Control Plane logout audit failed", error));
  }

  return NextResponse.redirect(new URL("/control-plane/login", req.url), { status: 303 });
}
