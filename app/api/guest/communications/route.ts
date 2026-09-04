import { NextRequest, NextResponse } from "next/server";

import { guestCommunicationsDeliveryEnabledForHotel } from "@/lib/server/guest-communications-delivery-policy";
import {
  translateGuestCommunication,
  type GuestCommunicationLanguage,
} from "@/lib/server/guest-communications-translation";
import { getGuestStayAccessState } from "@/lib/server/guest-stay-access";
import { getGuestStayStatus } from "@/lib/server/guest-stays";
import {
  maybeForwardSandboxGuestRequest,
  runtimeCanaryRoutingErrorResponse,
} from "@/lib/server/runtime-sandbox-canary-router";
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

function localized(map: unknown, language: SupportedLanguage, sourceLanguage: SupportedLanguage, fallback: string) {
  const values = map && typeof map === "object" && !Array.isArray(map) ? map as Record<string, unknown> : {};
  const candidates = Array.from(new Set([language, sourceLanguage, "en", "bg", "de", "ro", "cs", "ru"]));
  for (const key of candidates) {
    const value = String(values[key] || "").trim();
    if (value) return value;
  }
  return fallback;
}

function guestReplyTitle(language: SupportedLanguage) {
  const titles: Record<SupportedLanguage, string> = {
    bg: "Отговор от гост",
    en: "Guest reply",
    de: "Antwort des Gastes",
    ro: "Răspunsul oaspetelui",
    cs: "Odpověď hosta",
    ru: "Ответ гостя",
  };
  return titles[language];
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

    try {
      const routed = await maybeForwardSandboxGuestRequest({
        req,
        hotel: stayResult.hotel,
        body,
        routePath: "/api/guest/communications",
      });
      if (routed) return routed;
    } catch (routingError) {
      return runtimeCanaryRoutingErrorResponse(routingError);
    }

    const access = await getGuestStayAccessState({
      hotelId: stayResult.hotel.id,
      room: stayResult.stay.room,
      stayId: stayResult.stay.id,
      stayDeviceId: stayResult.stay.stayDeviceId,
    });

    const requestedLanguage = supportedLanguage(body?.language) || "en";

    if (String(body?.action || "").trim().toLowerCase() === "reply") {
      if (!access.canWrite) {
        return NextResponse.json({ ok: false, error: "stay_read_only" }, { status: 409, headers: NO_STORE });
      }
      if (!(await guestCommunicationsDeliveryEnabledForHotel(stayResult.hotel.id))) {
        return NextResponse.json({ ok: false, error: "delivery_disabled" }, { status: 409, headers: NO_STORE });
      }
      const messageBody = String(body?.body || "").trim().replace(/\r\n/g, "\n");
      if (!messageBody || messageBody.length > 1000) {
        return NextResponse.json({ ok: false, error: "invalid_content" }, { status: 400, headers: NO_STORE });
      }

      const { data: openedThread, error: threadError } = await supabaseAdmin
        .from("guest_communications")
        .select("id")
        .eq("hotel_id", stayResult.hotel.id)
        .eq("stay_id", stayResult.stay.id)
        .eq("audience_type", "direct_guest")
        .eq("sender_type", "staff")
        .limit(1)
        .maybeSingle();
      if (threadError) throw threadError;
      if (!openedThread?.id) {
        return NextResponse.json({ ok: false, error: "direct_thread_not_open" }, { status: 409, headers: NO_STORE });
      }

      const title = guestReplyTitle(requestedLanguage);
      const translated = await translateGuestCommunication({
        sourceLanguage: requestedLanguage as GuestCommunicationLanguage,
        title,
        body: messageBody,
      });
      const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc("append_guest_direct_communication_v1", {
        p_hotel_id: stayResult.hotel.id,
        p_stay_id: stayResult.stay.id,
        p_stay_device_id: stayResult.stay.stayDeviceId,
        p_sender_type: "guest",
        p_actor_role: "guest",
        p_sender_session_id: null,
        p_department_id: null,
        p_source_language: requestedLanguage,
        p_title: title,
        p_body: messageBody,
        p_title_i18n: translated.titleI18n,
        p_body_i18n: translated.bodyI18n,
        p_translation_status: "ready",
      });
      if (rpcError) throw rpcError;
      const communicationId = String(Array.isArray(rpcRows) ? rpcRows[0]?.communication_id || "" : "");
      return NextResponse.json({ ok: true, communicationId }, { status: 201, headers: NO_STORE });
    }

    if (!access.canWrite) {
      return NextResponse.json({ ok: true, messages: [] }, { headers: NO_STORE });
    }

    const now = new Date().toISOString();
    const [{ data: broadcasts, error: broadcastError }, { data: directRows, error: directError }] = await Promise.all([
      supabaseAdmin
        .from("guest_communications")
        .select("id,category,source_language,title,body,title_i18n,body_i18n,display_from,display_until,sent_at,created_at,departments(name,code)")
        .eq("hotel_id", stayResult.hotel.id)
        .eq("audience_type", "all_active_guests")
        .eq("translation_status", "ready")
        .in("status", ["sent", "partial_failed", "failed"])
        .lte("display_from", now)
        .or(`display_until.is.null,display_until.gt.${now}`)
        .order("display_from", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("guest_communications")
        .select("id,category,source_language,title,body,title_i18n,body_i18n,sent_at,created_at,sender_type,departments(name,code)")
        .eq("hotel_id", stayResult.hotel.id)
        .eq("stay_id", stayResult.stay.id)
        .eq("audience_type", "direct_guest")
        .in("translation_status", ["ready", "partial"])
        .in("status", ["sent", "partial_failed", "failed"])
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (broadcastError) throw broadcastError;
    if (directError) throw directError;

    const broadcastMessages = (broadcasts || []).map((message) => {
      const sourceLanguage = supportedLanguage(message.source_language) || "en";
      return {
        id: message.id,
        category: message.category,
        audienceType: "all_active_guests",
        senderType: "staff",
        title: localized(message.title_i18n, requestedLanguage, sourceLanguage, String(message.title || "")),
        body: localized(message.body_i18n, requestedLanguage, sourceLanguage, String(message.body || "")),
        displayFrom: message.display_from,
        displayUntil: message.display_until,
        sentAt: message.sent_at,
        createdAt: message.created_at,
        language: requestedLanguage,
        department: Array.isArray(message.departments) ? message.departments[0] || null : message.departments || null,
      };
    });

    const directMessages = (directRows || []).map((message) => {
      const sourceLanguage = supportedLanguage(message.source_language) || "en";
      return {
        id: message.id,
        category: message.category,
        audienceType: "direct_guest",
        senderType: message.sender_type,
        title: localized(message.title_i18n, requestedLanguage, sourceLanguage, String(message.title || "")),
        body: localized(message.body_i18n, requestedLanguage, sourceLanguage, String(message.body || "")),
        displayFrom: message.created_at,
        displayUntil: null,
        sentAt: message.sent_at,
        createdAt: message.created_at,
        language: requestedLanguage,
        department: Array.isArray(message.departments) ? message.departments[0] || null : message.departments || null,
      };
    });

    const messages = [...broadcastMessages, ...directMessages]
      .sort((a, b) => new Date(b.sentAt || b.displayFrom || b.createdAt || 0).getTime() - new Date(a.sentAt || a.displayFrom || a.createdAt || 0).getTime())
      .slice(0, 70);

    return NextResponse.json({
      ok: true,
      authority: "guest_communications",
      hotelId: stayResult.hotel.id,
      stayId: stayResult.stay.id,
      language: requestedLanguage,
      directReplyEnabled: directMessages.some((message) => message.senderType === "staff"),
      messages,
    }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GUEST_COMMUNICATIONS_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 404, headers: NO_STORE });
  }
}
