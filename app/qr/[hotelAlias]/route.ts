import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function getPublicAlias(hotel: { slug: string; public_slug?: string | null }) {
  return sanitizeSlug(hotel.public_slug || hotel.slug);
}

function getGuestTargetBaseUrl(publicAlias: string) {
  return `https://${publicAlias}.stayhub.app`;
}

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
  const requestedAlias = sanitizeSlug(hotelAlias);

  let hotel;
  try {
    hotel = await resolveHotelByAnySlugAdmin(requestedAlias);
  } catch (error) {
    console.error("guest qr hotel resolve error:", error);
    return NextResponse.redirect(new URL("https://www.stayhub.app"), 307);
  }

  const publicAlias = getPublicAlias(hotel);
  if (!hotel.id || !hotel.slug || !publicAlias) {
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

  const target = new URL(getGuestTargetBaseUrl(publicAlias));
  target.searchParams.set("src", src);
  target.searchParams.set("qr", "1");
  target.searchParams.set("qsid", scanSessionId);
  target.searchParams.set("code", qrCode);
  if (campaign) target.searchParams.set("campaign", campaign);
  if (roomHint) target.searchParams.set("room", roomHint);

  const { error } = await supabaseAdmin.from("qr_scans").insert({
    hotel_id: hotel.id,
    hotel_slug: hotel.slug,
    hotel_alias: publicAlias,
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
      kind: "guest",
      requestedAlias,
      resolvedHotelSlug: hotel.slug,
      resolvedPublicAlias: publicAlias,
      isSandbox: Boolean(hotel.is_sandbox),
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
