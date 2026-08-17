import { NextRequest, NextResponse } from "next/server";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
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

  const lang = normalizeControlPlaneLang(req.nextUrl.searchParams.get("lang"));
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

  const target = new URL("/control-plane/login", req.url);
  target.searchParams.set("lang", lang);
  return NextResponse.redirect(target, { status: 303 });
}
