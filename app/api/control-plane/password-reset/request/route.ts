import { NextRequest, NextResponse } from "next/server";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { requestPlatformAdminPasswordReset } from "@/lib/server/control-plane-password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function redirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/control-plane/forgot-password", req.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const lang = normalizeControlPlaneLang(req.nextUrl.searchParams.get("lang"));
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 8_192) {
    return redirect(req, { lang, sent: "1" });
  }

  try {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();

    await requestPlatformAdminPasswordReset({
      email,
      origin: req.nextUrl.origin,
      lang,
    });

    return redirect(req, { lang, sent: "1" });
  } catch (error) {
    console.error("Control Plane password reset request failed", error);
    return redirect(req, { lang, error: "unavailable" });
  }
}
