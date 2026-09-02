import { NextRequest, NextResponse } from "next/server";

import { getGuestStayAccessState } from "@/lib/server/guest-stay-access";
import { getGuestStayStatus } from "@/lib/server/guest-stays";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const SUPPORTED_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

function supportedLanguage(value: unknown): SupportedLanguage | null {
  const candidate = String(value || "").trim().toLowerCase() as SupportedLanguage;
  return SUPPORTED_LANGUAGES.includes(candidate) ? candidate : null;
}

function localized(
  map: unknown,
  language: SupportedLanguage,
  sourceLanguage: SupportedLanguage,
  fallback: string,
) {
  const values = map && typeof map === "object" && !Array.isArray(map)
    ? map as Record<string, unknown>
    : {};
  const candidates = Array.from(new Set([language, sourceLanguage, "en", "bg", "de", "ro", "cs", "ru"]));
  for (const key of candidates) {
    const value = String(values[key] || "").trim();
    if (value) return value;
  }
  return fallback;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const stayResult = await getGuestStayStatus({
      hotelSlug: body?.hotelSlug,
      stayId: body?.stayId,
      stayDeviceId: body?.stayDeviceId,
      deviceToken: body?.deviceToken,
    });
    const access = await getGuestStayAccessState({
      hotelId: stayResult.hotel.id,
      room: stayResult.stay.room,
      stayId: stayResult.stay.id,
      stayDeviceId: stayResult.stay.stayDeviceId,
    });

    // Guest Communications broadcasts target current active guests only. A stay in
    // checkout/read-only mode keeps historical access but receives no new broadcasts.
    if (!access.canWrite) {
      return NextResponse.json({ ok: true, messages: [] }, { headers: NO_STORE });
    }

    const requestedLanguage = supportedLanguage(body?.language);
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("guest_communications")
      .select("id,category,source_language,title,body,title_i18n,body_i18n,display_from,display_until,sent_at,created_at,departments(name,code)")
      .eq("hotel_id", stayResult.hotel.id)
      .eq("audience_type", "all_active_guests")
      .eq("translation_status", "ready")
      .in("status", ["sent", "partial_failed", "failed"])
      .lte("display_from", now)
      .or(`display_until.is.null,display_until.gt.${now}`)
      .order("display_from", { ascending: false })
      .limit(20);
    if (error) throw error;

    const messages = (data || []).map((message) => {
      const sourceLanguage = supportedLanguage(message.source_language) || "en";
      const language = requestedLanguage || sourceLanguage;
      return {
        id: message.id,
        category: message.category,
        title: localized(message.title_i18n, language, sourceLanguage, String(message.title || "")),
        body: localized(message.body_i18n, language, sourceLanguage, String(message.body || "")),
        displayFrom: message.display_from,
        displayUntil: message.display_until,
        sentAt: message.sent_at,
        language,
        department: Array.isArray(message.departments)
          ? message.departments[0] || null
          : message.departments || null,
      };
    });

    return NextResponse.json({
      ok: true,
      authority: "guest_communications",
      hotelId: stayResult.hotel.id,
      stayId: stayResult.stay.id,
      language: requestedLanguage,
      messages,
    }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GUEST_COMMUNICATIONS_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 404, headers: NO_STORE });
  }
}
