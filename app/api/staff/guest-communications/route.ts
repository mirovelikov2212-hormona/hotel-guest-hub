import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  hasGuestCommunicationCapability,
  resolveGuestCommunicationsAccess,
} from "@/lib/server/guest-communications-access";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const CATEGORIES = new Set(["information", "event", "change", "offer", "emergency", "operational"]);
const ACTIONS = new Set(["draft", "send_now", "schedule", "cancel"]);
const LANGUAGES = new Set(["bg", "en", "de", "ro", "cs", "ru"]);
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function cleanText(value: unknown, max: number) {
  const text = String(value || "").trim().replace(/\r\n/g, "\n");
  return text.length <= max ? text : "";
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

    const [{ data: messages, error: messagesError }, { count: pushReach, error: pushError }] = await Promise.all([
      messagesQuery,
      supabaseAdmin
        .from("guest_push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", access.hotel.id)
        .eq("enabled", true)
        .or("is_test.is.null,is_test.eq.false"),
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
      supportedLanguages: [...LANGUAGES],
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

    const category = String(body?.category || "information").trim().toLowerCase();
    const sourceLanguage = String(body?.sourceLanguage || "en").trim().toLowerCase();
    const title = cleanText(body?.title, 120);
    const messageBody = cleanText(body?.body, 1000);
    if (!CATEGORIES.has(category) || !LANGUAGES.has(sourceLanguage) || !title || !messageBody) {
      return json({ ok: false, error: "invalid_content" }, 400);
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
        title_i18n: { [sourceLanguage]: title },
        body_i18n: { [sourceLanguage]: messageBody },
        translation_status: "pending",
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
      translation: "pending",
    }, 201);
  } catch (error) {
    console.error("Guest Communications POST failed", error);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
