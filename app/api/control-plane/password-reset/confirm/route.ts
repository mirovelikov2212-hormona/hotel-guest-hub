import { NextRequest, NextResponse } from "next/server";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { confirmPlatformAdminPasswordReset } from "@/lib/server/control-plane-password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function redirectToReset(
  req: NextRequest,
  lang: "bg" | "en",
  tokenHash: string,
  error: string,
) {
  const url = new URL("/control-plane/reset-password", req.url);
  url.searchParams.set("lang", lang);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const lang = normalizeControlPlaneLang(req.nextUrl.searchParams.get("lang"));
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return redirectToReset(req, lang, "", "invalid");
  }

  const form = await req.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") || "").trim();
  const password = String(form?.get("password") || "");
  const confirmPassword = String(form?.get("confirm_password") || "");

  if (!tokenHash || !password || password !== confirmPassword) {
    return redirectToReset(req, lang, tokenHash, "mismatch");
  }

  try {
    await confirmPlatformAdminPasswordReset({
      tokenHash,
      password,
    });

    const loginUrl = new URL("/control-plane/login", req.url);
    loginUrl.searchParams.set("lang", lang);
    loginUrl.searchParams.set("reset", "success");
    return NextResponse.redirect(loginUrl, { status: 303, headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Control Plane password reset confirm failed", error);

    if (message.includes("PASSWORD_WEAK")) {
      return redirectToReset(req, lang, tokenHash, "weak");
    }
    if (message.includes("TOKEN_INVALID") || message.includes("AUTHORITY_REQUIRED")) {
      return redirectToReset(req, lang, "", "invalid");
    }
    return redirectToReset(req, lang, tokenHash, "unavailable");
  }
}
