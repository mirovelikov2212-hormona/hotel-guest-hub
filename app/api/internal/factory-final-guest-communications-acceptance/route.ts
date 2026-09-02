import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { POST as guestBroadcastPost } from "@/app/api/guest/communications/route";
import { POST as guestRequestCreatePost } from "@/app/api/guest/request-create/route";
import { POST as guestConversationPost } from "@/app/api/guest/request-conversations/route";
import { translateGuestCommunication } from "@/lib/server/guest-communications-translation";
import {
  appendStaffConversationMessage,
  getRequestForConversation,
  type GuestRequestConversationAccess,
} from "@/lib/server/guest-request-conversations";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const EXPECTED_CHALLENGE_HASH = "70344f07ae05efa8790f114425fa0a293266f93add86fa591e297f5c9dce4ec7";
const HOTEL_SLUG = "factory-heavy-20260901-002-sandbox";
const CROSS_HOTEL_SLUG = "factory-heavy-20260901-003-sandbox";
const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"] as const;

type JsonResult = { status: number; body: Record<string, any> };
type GuestIdentity = {
  stayId: string;
  stayDeviceId: string;
  deviceToken: string;
  room: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function callJsonPost(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  body: Record<string, unknown>,
): Promise<JsonResult> {
  const request = new NextRequest(`https://acceptance.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await handler(request);
  const parsed = (await response.json().catch(() => ({}))) as Record<string, any>;
  return { status: response.status, body: parsed };
}

async function loadHotel(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,name,timezone,active,is_sandbox")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active || !data.is_sandbox || data.slug !== slug) {
    throw new Error(`SANDBOX_HOTEL_REQUIRED:${slug}`);
  }
  return data;
}

async function loadGuestIdentities(hotelId: string, limit = 10): Promise<GuestIdentity[]> {
  const { data: stays, error: staysError } = await supabaseAdmin
    .from("guest_stays")
    .select("id,room_number")
    .eq("hotel_id", hotelId)
    .eq("status", "active")
    .eq("lifecycle_state", "active")
    .order("room_number", { ascending: true })
    .limit(limit);
  if (staysError) throw staysError;

  const stayIds = (stays || []).map((row) => String(row.id));
  if (!stayIds.length) return [];
  const { data: devices, error: devicesError } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id,stay_id,device_token,room_number,created_at")
    .eq("hotel_id", hotelId)
    .in("stay_id", stayIds)
    .order("created_at", { ascending: true });
  if (devicesError) throw devicesError;

  const firstDeviceByStay = new Map<string, any>();
  for (const device of devices || []) {
    const stayId = String(device.stay_id || "");
    if (stayId && !firstDeviceByStay.has(stayId)) firstDeviceByStay.set(stayId, device);
  }

  return (stays || []).flatMap((stay) => {
    const device = firstDeviceByStay.get(String(stay.id));
    if (!device?.id || !device?.device_token) return [];
    return [{
      stayId: String(stay.id),
      stayDeviceId: String(device.id),
      deviceToken: String(device.device_token),
      room: String(stay.room_number || device.room_number || ""),
    }];
  });
}

function guestBroadcastList(slug: string, identity: GuestIdentity, language: string) {
  return callJsonPost(guestBroadcastPost, "/api/guest/communications", {
    hotelSlug: slug,
    stayId: identity.stayId,
    stayDeviceId: identity.stayDeviceId,
    deviceToken: identity.deviceToken,
    language,
  });
}

function guestThreadList(slug: string, identity: GuestIdentity, language: string) {
  return callJsonPost(guestConversationPost, "/api/guest/request-conversations", {
    action: "list",
    hotelSlug: slug,
    stayId: identity.stayId,
    stayDeviceId: identity.stayDeviceId,
    deviceToken: identity.deviceToken,
    language,
  });
}

async function cleanup(hotelId: string, communicationIds: string[], requestId: string | null) {
  const ids = communicationIds.filter(Boolean);
  if (ids.length) {
    await supabaseAdmin
      .from("guest_communication_deliveries")
      .delete()
      .eq("hotel_id", hotelId)
      .in("communication_id", ids);
  }
  if (requestId) {
    await supabaseAdmin.from("request_events").delete().eq("hotel_id", hotelId).eq("request_id", requestId);
    await supabaseAdmin.from("guest_communication_deliveries").delete().eq("hotel_id", hotelId).in("communication_id", ids);
    await supabaseAdmin.from("guest_communications").delete().eq("hotel_id", hotelId).eq("request_id", requestId);
    await supabaseAdmin.from("guest_requests").delete().eq("hotel_id", hotelId).eq("id", requestId);
  }
  if (ids.length) {
    await supabaseAdmin.from("guest_communications").delete().eq("hotel_id", hotelId).in("id", ids);
  }
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return json({ ok: false, code: "NOT_FOUND" }, 404);
  if (sha256(req.nextUrl.searchParams.get("challenge") || "") !== EXPECTED_CHALLENGE_HASH) {
    return json({ ok: false, code: "INVALID_CHALLENGE" }, 401);
  }

  const runId = `final-guest-comms-${randomUUID()}`;
  const marker = `[${runId}]`;
  const startedAt = Date.now();
  let hotelId = "";
  let requestId: string | null = null;
  const communicationIds: string[] = [];

  try {
    const [hotel, crossHotel] = await Promise.all([loadHotel(HOTEL_SLUG), loadHotel(CROSS_HOTEL_SLUG)]);
    hotelId = String(hotel.id);
    const [identities, crossIdentities] = await Promise.all([
      loadGuestIdentities(hotelId),
      loadGuestIdentities(String(crossHotel.id), 2),
    ]);
    if (identities.length < 2) throw new Error(`AT_LEAST_TWO_ACTIVE_GUEST_IDENTITIES_REQUIRED:${identities.length}`);
    if (!crossIdentities.length) throw new Error("CROSS_HOTEL_ACTIVE_GUEST_IDENTITY_REQUIRED");

    const target = identities[0];
    const nonTarget = identities[1];
    const crossTarget = crossIdentities[0];

    const broadcastTranslation = await translateGuestCommunication({
      sourceLanguage: "en",
      title: `StayHub final broadcast ${marker}`,
      body: `Final acceptance message for all active guests ${marker}`,
    });
    const now = new Date();
    const { data: broadcast, error: broadcastError } = await supabaseAdmin
      .from("guest_communications")
      .insert({
        hotel_id: hotelId,
        actor_role: "acceptance",
        category: "information",
        source_language: "en",
        title: `StayHub final broadcast ${marker}`,
        body: `Final acceptance message for all active guests ${marker}`,
        title_i18n: broadcastTranslation.titleI18n,
        body_i18n: broadcastTranslation.bodyI18n,
        translation_status: "ready",
        translated_at: now.toISOString(),
        audience_type: "all_active_guests",
        status: "sent",
        sent_at: now.toISOString(),
        display_from: new Date(now.getTime() - 1000).toISOString(),
        display_until: new Date(now.getTime() + 15 * 60_000).toISOString(),
        metadata_json: { acceptanceRunId: runId, previewOnly: true, syntheticSandboxTransport: true },
      })
      .select("id")
      .single();
    if (broadcastError) throw broadcastError;
    const broadcastId = String(broadcast.id);
    communicationIds.push(broadcastId);

    const sameHotelResults = await Promise.all(
      identities.map((identity, index) => guestBroadcastList(HOTEL_SLUG, identity, LANGUAGES[index % LANGUAGES.length])),
    );
    const sameHotelVisibility = sameHotelResults.map((result, index) => ({
      room: identities[index].room,
      status: result.status,
      visible: Array.isArray(result.body.messages) && result.body.messages.some((item: any) => item.id === broadcastId),
    }));
    const broadcastLanguageResults = await Promise.all(LANGUAGES.map((language) => guestBroadcastList(HOTEL_SLUG, target, language)));
    const broadcastLanguages = broadcastLanguageResults.map((result, index) => {
      const message = Array.isArray(result.body.messages)
        ? result.body.messages.find((item: any) => item.id === broadcastId)
        : null;
      return {
        language: LANGUAGES[index],
        status: result.status,
        visible: Boolean(message?.id),
        localized: Boolean(String(message?.title || "").trim() && String(message?.body || "").trim()),
      };
    });
    const crossHotelBroadcast = await guestBroadcastList(CROSS_HOTEL_SLUG, crossTarget, "en");
    const crossHotelVisible = Array.isArray(crossHotelBroadcast.body.messages)
      && crossHotelBroadcast.body.messages.some((item: any) => item.id === broadcastId);

    const requestCreate = await callJsonPost(guestRequestCreatePost, "/api/guest/request-create", {
      hotelSlug: HOTEL_SLUG,
      room: target.room,
      type: "extra-towel",
      typeLabel: `Final targeted request ${marker}`,
      note: `Targeted communication acceptance ${marker}`,
      sourceRequestDef: "extra-towel",
      serviceTime: "now",
      guestLanguage: "en",
      stayId: target.stayId,
      stayDeviceId: target.stayDeviceId,
    });
    requestId = String(requestCreate.body?.request?.id || "");
    if (requestCreate.status < 200 || requestCreate.status >= 300 || !requestId) {
      throw new Error(`TARGET_REQUEST_CREATE_FAILED:${requestCreate.status}:${requestCreate.body?.error || "unknown"}`);
    }

    const request = await getRequestForConversation(hotelId, requestId);
    if (!request) throw new Error("TARGET_REQUEST_NOT_FOUND_AFTER_CREATE");
    const [{ data: receptionDepartment, error: departmentError }, { data: receptionSession, error: sessionError }] = await Promise.all([
      supabaseAdmin.from("departments").select("id,code,name").eq("hotel_id", hotelId).eq("code", "reception").maybeSingle(),
      supabaseAdmin.from("staff_sessions").select("id").eq("hotel_id", hotelId).eq("role", "reception").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (departmentError) throw departmentError;
    if (sessionError) throw sessionError;
    if (!receptionDepartment?.id || !receptionSession?.id) throw new Error("RECEPTION_ACCEPTANCE_CONTEXT_MISSING");

    const staffAccess: GuestRequestConversationAccess = {
      hotel: {
        id: hotelId,
        slug: String(hotel.slug),
        publicSlug: String(hotel.public_slug || hotel.slug),
        name: String(hotel.name || hotel.slug),
        timezone: String(hotel.timezone || "UTC"),
        isSandbox: true,
      },
      role: "reception",
      sessionId: String(receptionSession.id),
      runtimeRole: {
        kind: "department",
        departmentId: String(receptionDepartment.id),
        departmentCode: "reception",
        departmentName: String(receptionDepartment.name || "Reception"),
      },
      capabilities: {
        "guest_communications.view_own": true,
        "guest_communications.view_all": false,
        "guest_communications.create": true,
        "guest_communications.send": true,
        "guest_communications.schedule": true,
        "guest_communications.approve": false,
        "guest_communications.emergency_send": false,
        "guest_request_conversations.view_own": false,
        "guest_request_conversations.view_all": true,
        "guest_request_conversations.reply": true,
      },
    };

    const staffMessage = await appendStaffConversationMessage({
      access: staffAccess,
      request,
      body: `Reception message to exactly one guest ${marker}`,
    });
    const staffCommunicationId = String(staffMessage.communicationId || "");
    if (!staffCommunicationId) throw new Error("STAFF_TARGETED_COMMUNICATION_ID_MISSING");
    communicationIds.push(staffCommunicationId);

    const targetedLanguageResults = await Promise.all(LANGUAGES.map((language) => guestThreadList(HOTEL_SLUG, target, language)));
    const targetedLanguages = targetedLanguageResults.map((result, index) => {
      const message = Array.isArray(result.body.messages)
        ? result.body.messages.find((item: any) => item.id === staffCommunicationId)
        : null;
      return {
        language: LANGUAGES[index],
        status: result.status,
        visible: Boolean(message?.id),
        localized: Boolean(String(message?.title || "").trim() && String(message?.body || "").trim()),
      };
    });

    const nonTargetBefore = await guestThreadList(HOTEL_SLUG, nonTarget, "en");
    const nonTargetSawStaffMessage = Array.isArray(nonTargetBefore.body.messages)
      && nonTargetBefore.body.messages.some((item: any) => item.id === staffCommunicationId);
    const wrongGuestReply = await callJsonPost(guestConversationPost, "/api/guest/request-conversations", {
      action: "reply",
      hotelSlug: HOTEL_SLUG,
      stayId: nonTarget.stayId,
      stayDeviceId: nonTarget.stayDeviceId,
      deviceToken: nonTarget.deviceToken,
      requestId,
      language: "en",
      message: `This reply must be rejected ${marker}`,
    });
    const targetReply = await callJsonPost(guestConversationPost, "/api/guest/request-conversations", {
      action: "reply",
      hotelSlug: HOTEL_SLUG,
      stayId: target.stayId,
      stayDeviceId: target.stayDeviceId,
      deviceToken: target.deviceToken,
      requestId,
      language: "en",
      message: `Guest confirms the targeted message ${marker}`,
    });
    const guestReplyCommunicationId = String(targetReply.body?.communicationId || "");
    if (guestReplyCommunicationId) communicationIds.push(guestReplyCommunicationId);

    const [targetAfter, nonTargetAfter, targetBroadcastAfter] = await Promise.all([
      guestThreadList(HOTEL_SLUG, target, "en"),
      guestThreadList(HOTEL_SLUG, nonTarget, "en"),
      guestBroadcastList(HOTEL_SLUG, target, "en"),
    ]);
    const targetThreadIds = Array.isArray(targetAfter.body.messages) ? targetAfter.body.messages.map((item: any) => String(item.id)) : [];
    const nonTargetThreadIds = Array.isArray(nonTargetAfter.body.messages) ? nonTargetAfter.body.messages.map((item: any) => String(item.id)) : [];
    const broadcastFeedIds = Array.isArray(targetBroadcastAfter.body.messages) ? targetBroadcastAfter.body.messages.map((item: any) => String(item.id)) : [];

    const { data: scopeRows, error: scopeError } = await supabaseAdmin
      .from("guest_communications")
      .select("id,audience_type,request_id,stay_id,stay_device_id")
      .eq("hotel_id", hotelId)
      .in("id", communicationIds);
    if (scopeError) throw scopeError;

    const allGuestsPass = sameHotelVisibility.length === identities.length
      && sameHotelVisibility.every((row) => row.status === 200 && row.visible);
    const broadcastLanguagesPass = broadcastLanguages.every((row) => row.status === 200 && row.visible && row.localized);
    const targetedLanguagesPass = targetedLanguages.every((row) => row.status === 200 && row.visible && row.localized);
    const targetReplyPass = targetReply.status === 201
      && Boolean(guestReplyCommunicationId)
      && targetThreadIds.includes(staffCommunicationId)
      && targetThreadIds.includes(guestReplyCommunicationId);
    const nonTargetIsolationPass = !nonTargetSawStaffMessage
      && !nonTargetThreadIds.includes(staffCommunicationId)
      && !nonTargetThreadIds.includes(guestReplyCommunicationId)
      && wrongGuestReply.status === 404
      && wrongGuestReply.body.error === "request_not_found";
    const separationPass = broadcastFeedIds.includes(broadcastId)
      && !broadcastFeedIds.includes(staffCommunicationId)
      && !broadcastFeedIds.includes(guestReplyCommunicationId)
      && !targetThreadIds.includes(broadcastId);
    const scopePass = (scopeRows || []).length === communicationIds.length
      && (scopeRows || []).every((row: any) => row.id === broadcastId
        ? row.audience_type === "all_active_guests" && row.request_id === null && row.stay_id === null && row.stay_device_id === null
        : row.audience_type === "request_thread" && row.request_id === requestId && row.stay_id === target.stayId && row.stay_device_id === target.stayDeviceId);
    const sandboxTargetPushGuardPass = staffMessage.push?.attempted === false
      && staffMessage.push?.reason === "sandbox_delivery_disabled";

    const pass = allGuestsPass
      && broadcastLanguagesPass
      && crossHotelBroadcast.status === 200
      && !crossHotelVisible
      && targetedLanguagesPass
      && targetReplyPass
      && nonTargetIsolationPass
      && separationPass
      && scopePass
      && sandboxTargetPushGuardPass;

    const result = {
      ok: pass,
      status: pass ? "FINAL_GUEST_COMMUNICATIONS_ACCEPTANCE_OK" : "FINAL_GUEST_COMMUNICATIONS_ACCEPTANCE_FAILED",
      runId,
      previewCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      previewOnly: true,
      sandboxOnly: true,
      productionLiveActivation: false,
      hotelSlug: HOTEL_SLUG,
      activeGuestIdentityCount: identities.length,
      broadcast: {
        communicationId: broadcastId,
        allGuestsPass,
        sameHotelVisibility,
        sixLanguages: broadcastLanguages,
        crossHotelRejected: crossHotelBroadcast.status === 200 && !crossHotelVisible,
      },
      targeted: {
        requestId,
        staffCommunicationId,
        guestReplyCommunicationId,
        sixLanguages: targetedLanguages,
        targetReplyPass,
        nonTargetIsolationPass,
        wrongGuestReplyStatus: wrongGuestReply.status,
        sandboxPushGuard: staffMessage.push || null,
      },
      separation: { separationPass, scopePass },
      elapsedMs: Date.now() - startedAt,
    };

    await supabaseAdmin.from("system_events").insert({
      hotel_id: hotelId,
      severity: pass ? "info" : "error",
      source: "factory_acceptance",
      event_type: "factory_final_guest_communications_acceptance",
      message: pass ? "Final Preview-only guest communications acceptance passed." : "Final Preview-only guest communications acceptance failed.",
      metadata_json: result,
    });
    return json(result, pass ? 200 : 409);
  } catch (error) {
    const result = {
      ok: false,
      status: "FINAL_GUEST_COMMUNICATIONS_ACCEPTANCE_ERROR",
      runId,
      previewCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      previewOnly: true,
      sandboxOnly: true,
      productionLiveActivation: false,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    };
    if (hotelId) {
      try {
        await supabaseAdmin.from("system_events").insert({
          hotel_id: hotelId,
          severity: "error",
          source: "factory_acceptance",
          event_type: "factory_final_guest_communications_acceptance",
          message: "Final Preview-only guest communications acceptance errored.",
          metadata_json: result,
        });
      } catch {
        // Acceptance error response remains authoritative even if evidence logging fails.
      }
    }
    return json(result, 500);
  } finally {
    if (hotelId) {
      try {
        await cleanup(hotelId, communicationIds, requestId);
      } catch {
        // Forensic residue is checked explicitly below.
      }
      try {
        const { count } = await supabaseAdmin
          .from("guest_communications")
          .select("id", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .contains("metadata_json", { acceptanceRunId: runId });
        if (Number(count || 0) > 0) {
          await supabaseAdmin.from("system_events").insert({
            hotel_id: hotelId,
            severity: "error",
            source: "factory_acceptance",
            event_type: "factory_final_guest_communications_cleanup_failed",
            message: "Guest communications acceptance left synthetic communication residue.",
            metadata_json: { runId, residue: Number(count || 0), previewOnly: true },
          });
        }
      } catch {
        // Cleanup diagnostics must not replace the primary acceptance result.
      }
    }
  }
}
