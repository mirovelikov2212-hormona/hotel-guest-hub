import { NextRequest, NextResponse } from "next/server";

import { getHotelConfig } from "@/lib/config";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  hasGuestCommunicationCapability,
  resolveGuestCommunicationsAccess,
} from "@/lib/server/guest-communications-access";
import {
  GUEST_COMMUNICATION_LANGUAGES,
  translateGuestCommunication,
  type GuestCommunicationLanguage,
} from "@/lib/server/guest-communications-translation";
import { guestCommunicationsDeliveryEnabled } from "@/lib/server/guest-communications-delivery";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const CATEGORIES = new Set(["information", "event", "change", "offer", "emergency", "operational"]);
const ACTIONS = new Set(["draft", "send_now", "schedule", "cancel"]);
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function cleanText(value: unknown, max: number) {
  const text = String(value || "").trim().replace(/\r\n/g, "\n");
  return text.length <= max ? text : "";
}

function asCommunicationLanguage(value: unknown): GuestCommunicationLanguage | null {
  const candidate = String(value || "").trim().toLowerCase() as GuestCommunicationLanguage;
  return GUEST_COMMUNICATION_LANGUAGES.includes(candidate) ? candidate : null;
}

async function resolveHotelSourceLanguage(hotelSlug: string): Promise<GuestCommunicationLanguage> {
  const config = await getHotelConfig(hotelSlug).catch((error) => {
    console.warn("Guest Communications hotel language lookup failed", { hotelSlug, error });
    return null;
  });

  const candidates = [
    config?.languageDefault,
    config?.opsLanguage,
    ...(config?.languages || []),
  ];

  for (const candidate of candidates) {
    const language = asCommunicationLanguage(candidate);
    if (language) return language;
  }

  return "en";
}

async function loadAccess(hotelSlug: string, role: string) {
  if (!hotelSlug || !ROLE_PATTERN.test(role)) return null;
  return resolveGuestCommunicationsAccess(hotelSlug, role);
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(req.nextUrl.searchParams.get("role") || "").trim().toLowerCase();
    const access = await loadAccess(hotelSlug, role);
    if (!access) return json({ ok: false, error: "unauthorized" }, 401);

    const canViewAll = hasGuestCommunicationCapability(access, "guest_communications.view_all");
    const canViewOwn = hasGuestCommunicationCapability(access, "guest_communications.view_own");
    if (!canViewAll && !canViewOwn) return json({ ok: false, error: "forbidden" }, 403);

    let messagesQuery = supabaseAdmin
      .from("guest_communications")
      .select("id,department_id,actor_role,category,source_language,title,body,title_i18n,body_i18n,translation_status,translated_at,audience_type,status,scheduled_at,queued_at,sent_at,display_from,display_until,delivery_total,delivery_sent,delivery_failed,delivery_expired,last_error,created_at,updated_at,departments(name,code)")
      .eq("hotel_id", access.hotel.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!canViewAll) {
      if (!access.runtimeRole.departmentId) return json({ ok: false, error: "department_scope_required" }, 403);
      messagesQuery = messagesQuery.eq("department_id", access.runtimeRole.departmentId);
    }

    const [{ data: messages, error: messagesError }, { count: pushReach, error: pushError }, hotelSourceLanguage] = await Promise.all([
      messagesQuery,
      supabaseAdmin
        .from("guest_push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", access.hotel.id)
        .eq("enabled", true)
        .or("is_test.is.null,is_test.eq.false"),
      resolveHotelSourceLanguage(hotelSlug),
    ]);

    if (messagesError) throw messagesError;
    if (pushError) throw pushError;

    return json({
      ok: true,
      hotel: access.hotel,
      role: access.role,
      department: access.runtimeRole.kind === "department" ? {
        id: access.runtimeRole.departmentId,
        code: access.runtimeRole.departmentCode,
        name: access.runtimeRole.departmentName,
      } : null,
      capabilities: access.capabilities,
      pushReach: Number(pushReach || 0),
      hotelSourceLanguage,
      supportedLanguages: [...GUEST_COMMUNICATION_LANGUAGES],
      deliveryEnabled: guestCommunicationsDeliveryEnabled(),
      messages: messages || [],
    });
  } catch (error) {
    console.error("Guest Communications GET failed", error);
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
    const action = String(body?.action || "draft").trim().toLowerCase();
    const access = await loadAccess(hotelSlug, role);
    if (!access) return json({ ok: false, error: "unauthorized" }, 401);
    if (!ACTIONS.has(action)) return json({ ok: false, error: "invalid_action" }, 400);

    if (action === "cancel") {
      const communicationId = String(body?.communicationId || "").trim();
      if (!UUID_PATTERN.test(communicationId)) return json({ ok: false, error: "invalid_communication" }, 400);
      if (!hasGuestCommunicationCapability(access, "guest_communications.create")) return json({ ok: false, error: "forbidden" }, 403);

      let cancelQuery = supabaseAdmin
        .from("guest_communications")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("hotel_id", access.hotel.id)
        .eq("id", communicationId)
        .in("status", ["draft", "scheduled", "queued"]);
      if (!hasGuestCommunicationCapability(access, "guest_communications.view_all")) {
        if (!access.runtimeRole.departmentId) return json({ ok: false, error: "department_scope_required" }, 403);
        cancelQuery = cancelQuery.eq("department_id", access.runtimeRole.departmentId);
      }
      const { data, error } = await cancelQuery.select("id,status").maybeSingle();
      if (error) throw error;
      if (!data) return json({ ok: false, error: "not_cancellable" }, 409);
      return json({ ok: true, message: data });
    }

    if (!hasGuestCommunicationCapability(access, "guest_communications.create")) return json({ ok: false, error: "forbidden" }, 403);
    if (action === "send_now" && !hasGuestCommunicationCapability(access, "guest_communications.send")) return json({ ok: false, error: "send_forbidden" }, 403);
    if (action === "schedule" && !hasGuestCommunicationCapability(access, "guest_communications.schedule")) return json({ ok: false, error: "schedule_forbidden" }, 403);
    if ((action === "send_now" || action === "schedule") && !guestCommunicationsDeliveryEnabled()) {
      return json({ ok: false, error: "delivery_disabled" }, 409);
    }

    const category = String(body?.category || "information").trim().toLowerCase();
    const sourceLanguage = await resolveHotelSourceLanguage(hotelSlug);
    const title = cleanText(body?.title, 120);
    const messageBody = cleanText(body?.body, 1000);
    if (!CATEGORIES.has(category) || !title || !messageBody) {
      return json({ ok: false, error: "invalid_content" }, 400);
    }
    if (category === "emergency" && !hasGuestCommunicationCapability(access, "guest_communications.emergency_send")) {
      return json({ ok: false, error: "emergency_forbidden" }, 403);
    }

    const now = new Date();
    let scheduledAt: string | null = null;
    if (action === "schedule") {
      const parsed = new Date(String(body?.scheduledAt || ""));
      const maxFuture = now.getTime() + 90 * 24 * 60 * 60 * 1000;
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime() || parsed.getTime() > maxFuture) {
        return json({ ok: false, error: "invalid_schedule" }, 400);
      }
      scheduledAt = parsed.toISOString();
    }

    let titleI18n: Record<string, string> = { [sourceLanguage]: title };
    let bodyI18n: Record<string, string> = { [sourceLanguage]: messageBody };
    let translationStatus = "pending";
    let translatedAt: string | null = null;

    // Drafts can be saved before translation. Anything prepared for delivery
    // must have all six guest languages ready first, otherwise fail closed.
    if (action !== "draft") {
      try {
        const translated = await translateGuestCommunication({
          sourceLanguage,
          title,
          body: messageBody,
        });
        titleI18n = translated.titleI18n;
        bodyI18n = translated.bodyI18n;
        translationStatus = "ready";
        translatedAt = new Date().toISOString();
      } catch (translationError) {
        console.error("Guest Communications translation failed", {
          hotelId: access.hotel.id,
          role: access.role,
          category,
          sourceLanguage,
          error: translationError,
        });
        return json({ ok: false, error: "translation_unavailable" }, 503);
      }
    }

    const status = action === "schedule" ? "scheduled" : action === "send_now" ? "queued" : "draft";
    const displayFrom = status === "scheduled" ? scheduledAt : status === "queued" ? now.toISOString() : null;
    const displayUntilInput = body?.displayUntil ? new Date(String(body.displayUntil)) : null;
    const displayUntil = displayUntilInput && !Number.isNaN(displayUntilInput.getTime())
      ? displayUntilInput.toISOString()
      : displayFrom ? new Date(new Date(displayFrom).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;

    const { data, error } = await supabaseAdmin
      .from("guest_communications")
      .insert({
        hotel_id: access.hotel.id,
        department_id: access.runtimeRole.kind === "department" ? access.runtimeRole.departmentId : null,
        actor_role: access.role,
        category,
        source_language: sourceLanguage,
        title,
        body: messageBody,
        title_i18n: titleI18n,
        body_i18n: bodyI18n,
        translation_status: translationStatus,
        translated_at: translatedAt,
        audience_type: "all_active_guests",
        status,
        scheduled_at: scheduledAt,
        queued_at: status === "queued" ? now.toISOString() : null,
        display_from: displayFrom,
        display_until: displayUntil,
      })
      .select("id,department_id,actor_role,category,source_language,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at,queued_at,display_from,display_until,created_at")
      .single();

    if (error) throw error;
    return json({
      ok: true,
      message: data,
      delivery: status === "queued" ? "queued_not_sent_yet" : status,
      translation: translationStatus,
      sourceLanguage,
    }, 201);
  } catch (error) {
    console.error("Guest Communications POST failed", error);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
