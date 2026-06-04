import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_ACCESS_COOKIE_NAME,
  getDemoAccessCookieValue,
  isDemoAccessConfigured,
  validateDemoAccessPin,
} from "@/lib/demo-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSafeNextPath(value: FormDataEntryValue | null) {
  const candidate = String(value ?? "").trim();

  if (candidate === "/h/demo" || candidate.startsWith("/h/demo?")) {
    return candidate;
  }

  return "/h/demo";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const nextPath = getSafeNextPath(formData.get("next"));
  const redirectUrl = new URL(nextPath, request.url);

  if (!isDemoAccessConfigured()) {
    redirectUrl.searchParams.set("demoAccess", "unavailable");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!validateDemoAccessPin(formData.get("pin"))) {
    redirectUrl.searchParams.set("demoAccess", "invalid");
    return NextResponse.redirect(redirectUrl, 303);
  }

  redirectUrl.searchParams.delete("demoAccess");

  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set({
    name: DEMO_ACCESS_COOKIE_NAME,
    value: getDemoAccessCookieValue(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
