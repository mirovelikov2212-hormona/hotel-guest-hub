import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Immediate production-safe mapping for your current hotels.
// Later you can move this mapping into Supabase.
const HOTEL_REDIRECTS: Record<
  string,
  {
    hotelId: string;
    canonicalSlug: string;
    publicAlias: string;
    targetUrl: string;
  }
> = {
  aquamarine: {
    hotelId: "843ec551-786a-46c4-989b-9da98956cd19",
    canonicalSlug: "aquamarin",
    publicAlias: "aquamarine",
    targetUrl: "https://aquamarine.stayhub.app",
  },
  demo: {
    hotelId: "243c8e86-af66-455f-b664-ec2185d5f3f3",
    canonicalSlug: "demo",
    publicAlias: "demo",
    targetUrl: "https://demo.stayhub.app",
  },
};

function getDeviceType(ua: string) {
  const s = ua.toLowerCase();
  if (/ipad|tablet|android(?!.*mobile)/.test(s)) return "tablet";
  if (/mobile|iphone|ipod|android/.test(s)) return "mobile";
  return "desktop";
}

function getOS(ua: string) {
  const s = ua.toLowerCase();
  if (s.includes("iphone") || s.includes("ipad") || s.includes("ios")) return "iOS";
  if (s.includes("android")) return "Android";
  if (s.includes("windows")) return "Windows";
  if (s.includes("mac os") || s.includes("macintosh")) return "macOS";
  if (s.includes("linux")) return "Linux";
  return "Other";
}

function getBrowser(ua: string) {
  const s = ua.toLowerCase();
  if (s.includes("edg/")) return "Edge";
  if (s.includes("chrome/") && !s.includes("edg/")) return "Chrome";
  if (s.includes("safari/") && !s.includes("chrome/")) return "Safari";
  if (s.includes("firefox/")) return "Firefox";
  return "Other";
}

function isBot(ua: string) {
  return /bot|crawl|spider|preview|slurp|facebookexternalhit|whatsapp/i.test(ua);
}

function hashIp(ip: string) {
  const salt = process.env.QR_IP_HASH_SALT || "stayhub-default-salt-change-me";
  return crypto.createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ hotelAlias: string }> }
) {
  const { hotelAlias } = await context.params;
  const hotel = HOTEL_REDIRECTS[hotelAlias];

  if (!hotel) {
    return NextResponse.redirect(new URL("https://www.stayhub.app"), 307);
  }

  const url = new URL(request.url);
  const src = url.searchParams.get("src") || "main";
  const campaign = url.searchParams.get("campaign");
  const qrCode = url.searchParams.get("code") || src || "main";
  const roomHint = url.searchParams.get("room");
  const ua = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer");
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || "0.0.0.0";
  const scanSessionId = crypto.randomUUID();

  // Build redirect target
  const target = new URL(hotel.targetUrl);
  target.searchParams.set("src", src);
  target.searchParams.set("qr", "1");
  target.searchParams.set("qsid", scanSessionId);
  target.searchParams.set("code", qrCode);
  if (campaign) target.searchParams.set("campaign", campaign);
  if (roomHint) target.searchParams.set("room", roomHint);

  // Best effort tracking insert
  const { error } = await supabase.from("qr_scans").insert({
    hotel_id: hotel.hotelId,
    hotel_slug: hotel.canonicalSlug,
    hotel_alias: hotel.publicAlias,
    qr_code: qrCode,
    src,
    campaign,
    room_hint: roomHint,
    target_url: target.toString(),
    scan_session_id: scanSessionId,
    ip_hash: hashIp(ip),
    device_type: getDeviceType(ua),
    os: getOS(ua),
    browser: getBrowser(ua),
    referer,
    user_agent: ua,
    is_bot: isBot(ua),
    extra: {
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    },
  });

  if (error) {
    console.error("qr_scans insert error:", error);
  }

  const response = NextResponse.redirect(target, 307);

  response.cookies.set("sh_qr_sid", scanSessionId, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set("sh_qr_src", src, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set("sh_qr_code", qrCode, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}