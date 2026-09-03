import { NextRequest, NextResponse } from "next/server";

import { getHotelConfig } from "@/lib/config";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  hasGuestCommunicationCapability,
  resolveGuestCommunicationsAccess,
} from "@/lib/server/guest-communications-access";
import { deliverDirectGuestCommunication } from "@/lib/server/guest-direct-communications-delivery";
import { guestCommunicationsDeliveryEnabledForHotel } from "@/lib/server/guest-communications-delivery-policy";
import {
  GUEST_COMMUNICATION_LANGUAGES,
  translateGuestCommunication,
  type GuestCommunicationLanguage,
} from "@/lib/server/guest-communications-translation";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function asLanguage(value: unknown): GuestCommunicationLanguage | null {
  const candidate = String(value || "").trim().toLowerCase() as GuestCommunicationLanguage;
  return GUEST_COMMUNICATION_LANGUAGES.includes(candidate) ? candidate : null;
}

function localized(map: unknown, language: GuestCommunicationLanguage, sourceLanguage: GuestCommunicationLanguage, fallback: string) {
  const values = map && typeof map === "object" && !Array.isArray(map) ? map as Record<string, unknown> : {};
  const candidates = Array.from(new Set([language, sourceLanguage, "en", "bg", "de", "ro", "cs", "ru"]));
  for (const key of candidates) {
    const value = String(values[key] || "").trim();
    if (value) return value;
  }
  return fallback;
}

async function resolveHotelSourceLanguage(hotelSlug: string): Promise<GuestCommunicationLanguage> {
  const config = await getHotelConfig(hotelSlug).catch(() => null);
  for (const candidate of [config?.languageDefault, config?.opsLanguage, ...(config?.languages || [])]) {
    const language = asLanguage(candidate);
    if (language) return language;
  }
  return "en";
}

function directTitle(language: GuestCommunicationLanguage, sender: "staff" | "guest") {
  const staff: Record<GuestCommunicationLanguage, string> = {
    bg: "Съобщение от рецепция",
    en: "Message from reception",
    de: "Nachricht von der Rezeption",
    ro: "Mesaj de la recepție",
    cs: "Zpráva z recepce",
    ru: "Сообщение от стойки регистрации",
  };
  const guest: Record<GuestCommunicationLanguage, string> = {
    bg: "Отговор от гост",
    en: "Guest reply",
    de: "Antwort des Gastes",
    ro: "Răspunsul oaspetelui",
    cs: "Odpověď hosta",
    ru: "Ответ гостя",
  };
  return sender === "staff" ? staff[language] : guest[language];
}

async function loadReceptionAccess(hotelSlug: string, role: string) {
  const access = await resolveGuestCommunicationsAccess(hotelSlug, role);
  if (!access || access.role !== "reception" || access.runtimeRole.kind !== "department" || !access.runtimeRole.departmentId) return null;
  return access;
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(req.nextUrl.searchParams.get("role") || "").trim().toLowerCase();
    const language = asLanguage(req.nextUrl.searchParams.get("language")) || "bg";
    const access = await loadReceptionAccess(hotelSlug, role);
    if (!access) return json({ ok: false, error: "unauthorized" }, 401);
    if (!hasGuestCommunicationCapability(access, "guest_communications.view_own")) return json({ ok: false, error: "forbidden" }, 403);

    const now = new Date().toISOString();
    const [{ data: stays, error: staysError }, { data: rows, error: rowsError }, deliveryEnabled] = await Promise.all([
      supabaseAdmin
        .from("guest_stays")
        .select("id,room_number,effective_check_out_at,last_seen_at")
        .eq("hotel_id", access.hotel.id)
        .eq("status", "active")
        .eq("lifecycle_state", "active")
        .eq("is_test", false)
        .gt("effective_check_out_at", now)
        .order("room_number", { ascending: true })
        .limit(1000),
      supabaseAdmin
        .from("guest_communications")
        .select("id,stay_id,stay_device_id,sender_type,source_language,title,body,title_i18n,body_i18n,translation_status,sent_at,created_at")
        .eq("hotel_id", access.hotel.id)
        .eq("audience_type", "direct_guest")
        .in("status", ["sent", "partial_failed", "failed"])
        .order("created_at", { ascending: false })
        .limit(250),
      guestCommunicationsDeliveryEnabledForHotel(access.hotel.id),
    ]);
    if (staysError) throw staysError;
    if (rowsError) throw rowsError;

    const messages = (rows || []).map((row) => {
      const sourceLanguage = asLanguage(row.source_language) || "en";
      return {
        id: row.id,
        stayId: row.stay_id,
        stayDeviceId: row.stay_device_id,
        senderType: row.sender_type,
        title: localized(row.title_i18n, language, sourceLanguage, String(row.title || "")),
        body: localized(row.body_i18n, language, sourceLanguage, String(row.body || "")),
        createdAt: row.created_at,
        sentAt: row.sent_at,
      };
    });

    return json({
      ok: true,
      hotel: access.hotel,
      department: { id: access.runtimeRole.departmentId, code: access.runtimeRole.departmentCode, name: access.runtimeRole.departmentName },
      deliveryEnabled,
      stays: stays || [],
      messages,
    });
  } catch (error) {
    console.error("Guest direct communications GET failed", error);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const stayId = String(body?.stayId || "").trim();
    const messageBody = String(body?.body || "").trim().replace(/\r\n/g, "\n");
    const access = await loadReceptionAccess(hotelSlug, role);
    if (!access) return json({ ok: false, error: "unauthorized" }, 401);
    if (!hasGuestCommunicationCapability(access, "guest_communications.send")) return json({ ok: false, error: "forbidden" }, 403);
    if (!UUID_PATTERN.test(stayId) || !messageBody || messageBody.length > 1000) return json({ ok: false, error: "invalid_content" }, 400);
    if (!(await guestCommunicationsDeliveryEnabledForHotel(access.hotel.id))) return json({ ok: false, error: "delivery_disabled" }, 409);

    const sourceLanguage = await resolveHotelSourceLanguage(hotelSlug);
    const title = directTitle(sourceLanguage, "staff");
    const translated = await translateGuestCommunication({ sourceLanguage, title, body: messageBody });

    const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc("append_guest_direct_communication_v1", {
      p_hotel_id: access.hotel.id,
      p_stay_id: stayId,
      p_stay_device_id: null,
      p_sender_type: "staff",
      p_actor_role: access.role,
      p_sender_session_id: access.staffSessionId,
      p_department_id: access.runtimeRole.departmentId,
      p_source_language: sourceLanguage,
      p_title: title,
      p_body: messageBody,
      p_title_i18n: translated.titleI18n,
      p_body_i18n: translated.bodyI18n,
      p_translation_status: "ready",
    });
    if (rpcError) throw rpcError;
    const communicationId = String(Array.isArray(rpcRows) ? rpcRows[0]?.communication_id || "" : "");
    if (!UUID_PATTERN.test(communicationId)) throw new Error("direct_communication_insert_failed");

    const { data: communication, error: communicationError } = await supabaseAdmin
      .from("guest_communications")
      .select("id,hotel_id,stay_id,category,source_language,title,body,title_i18n,body_i18n")
      .eq("hotel_id", access.hotel.id)
      .eq("id", communicationId)
      .eq("audience_type", "direct_guest")
      .single();
    if (communicationError) throw communicationError;

    const delivery = await deliverDirectGuestCommunication({
      communication,
      hotel: {
        id: access.hotel.id,
        slug: access.hotel.slug,
        publicSlug: access.hotel.publicSlug,
        isSandbox: access.hotel.isSandbox,
      },
    });

    return json({ ok: true, communicationId, delivery }, 201);
  } catch (error) {
    console.error("Guest direct communications POST failed", error);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
