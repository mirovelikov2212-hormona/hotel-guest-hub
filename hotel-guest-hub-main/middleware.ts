import { NextRequest, NextResponse } from "next/server";

const STAFF_ROLES = new Set(["reception", "housekeeping", "maintenance", "manager"]);

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = req.headers.get("host") || "";
  const hostWithoutPort = host.split(":")[0].toLowerCase();

  const isMainHost =
    hostWithoutPort === "www.stayhub.app" ||
    hostWithoutPort === "stayhub.app" ||
    hostWithoutPort === "localhost";

  if (!isMainHost && hostWithoutPort.endsWith(".stayhub.app")) {
    const subdomain = hostWithoutPort.replace(".stayhub.app", "").trim();

    if (subdomain && pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = `/h/${subdomain}`;
      url.search = search;
      return NextResponse.rewrite(url);
    }
  }

  if (!pathname.startsWith("/staff/")) {
    return NextResponse.next();
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    return NextResponse.next();
  }

  const [, hotelSlug, role] = parts;

  if (role === "pin") {
    return NextResponse.next();
  }

  if (!STAFF_ROLES.has(role)) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(req.cookies.get("stayhub_staff_session")?.value);
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = `/staff/${hotelSlug}/pin`;
  url.searchParams.set("role", role);
  url.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/staff/:path*"],
};