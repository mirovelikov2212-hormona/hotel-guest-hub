import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const STAFF_TARGETS: Record<
  string,
  Record<
    string,
    {
      hotelId: string;
      targetUrl: string;
      qrCode: string;
    }
  >
> = {
  aquamarin: {
    housekeeping: {
      hotelId: "843ec551-786a-46c4-989b-9da98956cd19",
      targetUrl: "https://www.stayhub.app/staff/aquamarin/housekeeping",
      qrCode: "staff_housekeeping",
    },
    maintenance: {
      hotelId: "843ec551-786a-46c4-989b-9da98956cd19",
      targetUrl: "https://www.stayhub.app/staff/aquamarin/maintenance",
      qrCode: "staff_maintenance",
    },
    reception: {
      hotelId: "843ec551-786a-46c4-989b-9da98956cd19",
      targetUrl: "https://www.stayhub.app/staff/aquamarin/reception",
      qrCode: "staff_reception",
    },
    manager: {
      hotelId: "843ec551-786a-46c4-989b-9da98956cd19",
      targetUrl: "https://www.stayhub.app/staff/aquamarin/manager",
      qrCode: "staff_manager",
    },
  },
};

function hashIp(ip: string) {
  const salt = process.env.QR_IP_HASH_SALT || "stayhub-default-salt-change-me";
  return crypto.createHash("sha256").update(`${ip}|${salt}`).digest("hex");
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ hotelSlug: string; department: string }> }
) {
  const { hotelSlug, department } = await context.params;
  const hotelMap = STAFF_TARGETS[hotelSlug];
  const target = hotelMap?.[department];

  if (!target) {
    return NextResponse.redirect(new URL("https://www.stayhub.app"), 307);
  }

  const url = new URL(request.url);
  const src = url.searchParams.get("src") || "staff_qr";
  const ua = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer");
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || "0.0.0.0";
  const scanSessionId = crypto.randomUUID();

  const { error } = await supabase.from("qr_scans").insert({
    hotel_id: target.hotelId,
    hotel_slug: hotelSlug,
    hotel_alias: "aquamarine",
    qr_code: target.qrCode,
    src,
    campaign: null,
    room_hint: null,
    target_url: target.targetUrl,
    scan_session_id: scanSessionId,
    ip_hash: hashIp(ip),
    device_type: getDeviceType(ua),
    os: getOS(ua),
    browser: getBrowser(ua),
    referer,
    user_agent: ua,
    is_bot: isBot(ua),
    extra: {
      kind: "staff",
      department,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    },
  });

  if (error) {
    console.error("staff qr_scans insert error:", error);
  }

  const response = NextResponse.redirect(target.targetUrl, 307);

  response.cookies.set("sh_staff_qr_sid", scanSessionId, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set("sh_qr_code", target.qrCode, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}