import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  generateManagerMorningBrief,
  getManagerIntelligenceDashboard,
} from "@/lib/server/manager-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function safeStatus(message: string) {
  if (message.includes("MANAGER_SESSION_REQUIRED")) return 401;
  if (
    message.includes("HOTEL_SCOPE_MISMATCH")
    || message.startsWith("PRODUCT_MODULE_ACCESS_BLOCKED:")
  ) return 403;
  if (message.includes("_CAP_EXCEEDED")) return 409;
  return 503;
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
  const language = String(req.nextUrl.searchParams.get("language") || "bg").trim().toLowerCase();

  try {
    const result = await getManagerIntelligenceDashboard({ hotelSlug, language });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MANAGER_INTELLIGENCE_UNAVAILABLE";
    console.error("Manager Intelligence dashboard failed", error);
    return NextResponse.json(
      { ok: false, error: message.startsWith("PRODUCT_MODULE_ACCESS_BLOCKED:") ? "manager_intelligence_not_entitled" : "manager_intelligence_unavailable" },
      { status: safeStatus(message), headers: NO_STORE },
    );
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const language = String(body?.language || "bg").trim().toLowerCase();

  try {
    const result = await generateManagerMorningBrief({
      hotelSlug,
      language,
      persist: true,
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MANAGER_INTELLIGENCE_GENERATION_FAILED";
    console.error("Manager Intelligence brief generation failed", error);
    return NextResponse.json(
      { ok: false, error: message.startsWith("PRODUCT_MODULE_ACCESS_BLOCKED:") ? "manager_intelligence_not_entitled" : "manager_intelligence_generation_failed" },
      { status: safeStatus(message), headers: NO_STORE },
    );
  }
}
