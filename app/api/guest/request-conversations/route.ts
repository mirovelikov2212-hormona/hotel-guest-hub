import { NextRequest, NextResponse } from "next/server";

import {
  GuestStayAccessError,
  getGuestStayAccessState,
} from "@/lib/server/guest-stay-access";
import { getGuestStayStatus } from "@/lib/server/guest-stays";
import {
  appendGuestConversationMessage,
  asGuestCommunicationLanguage,
  getRequestForConversation,
  loadConversationMessages,
} from "@/lib/server/guest-request-conversations";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function resolveGuestIdentity(body: any) {
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
  return { stayResult, access };
}

function mapError(error: unknown) {
  if (error instanceof GuestStayAccessError) {
    return json({ ok: false, error: error.message, code: error.code }, error.statusCode);
  }
  const message = error instanceof Error ? error.message : "request_conversation_unavailable";
  if (message.includes("REQUEST_CLOSED")) return json({ ok: false, error: "request_closed" }, 409);
  if (message.includes("CONTENT_INVALID")) return json({ ok: false, error: "invalid_content" }, 400);
  return json({ ok: false, error: "request_conversation_unavailable" }, 503);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const action = String(body?.action || "list").trim().toLowerCase();
    if (action !== "list" && action !== "reply") {
      return json({ ok: false, error: "invalid_action" }, 400);
    }

    const { stayResult, access } = await resolveGuestIdentity(body);
    const language = asGuestCommunicationLanguage(body?.language)
      || asGuestCommunicationLanguage(stayResult.stay.language)
      || "en";

    if (action === "reply") {
      if (!access.canWrite) {
        return json({ ok: false, error: "stay_read_only", state: access.state }, 409);
      }
      const requestId = String(body?.requestId || "").trim();
      if (!UUID_PATTERN.test(requestId)) return json({ ok: false, error: "invalid_request" }, 400);

      const request = await getRequestForConversation(stayResult.hotel.id, requestId);
      if (!request
        || request.stay_id !== stayResult.stay.id
        || request.stay_device_id !== stayResult.stay.stayDeviceId
        || String(request.room_number_snapshot || "") !== String(stayResult.stay.room || "")) {
        return json({ ok: false, error: "request_not_found" }, 404);
      }

      const appended = await appendGuestConversationMessage({
        hotelId: stayResult.hotel.id,
        request,
        sourceLanguage: language,
        body: body?.message,
      });
      return json({ ok: true, ...appended }, 201);
    }

    if (!access.canRead) {
      return json({ ok: true, lifecycleState: access.state, readOnly: true, requests: [], messages: [] });
    }

    const { data: requests, error: requestsError } = await supabaseAdmin
      .from("guest_requests")
      .select("id,room_number_snapshot,title,status,conversation_state,conversation_updated_at,conversation_last_sender_type")
      .eq("hotel_id", stayResult.hotel.id)
      .eq("stay_id", stayResult.stay.id)
      .eq("stay_device_id", stayResult.stay.stayDeviceId)
      .neq("conversation_state", "none")
      .order("conversation_updated_at", { ascending: false })
      .limit(50);
    if (requestsError) throw requestsError;

    const messages = await loadConversationMessages({
      hotelId: stayResult.hotel.id,
      stayId: stayResult.stay.id,
      stayDeviceId: stayResult.stay.stayDeviceId,
      language,
      limit: 200,
    });

    return json({
      ok: true,
      authority: "guest_request_conversations",
      lifecycleState: access.state,
      readOnly: !access.canWrite,
      hotelId: stayResult.hotel.id,
      stayId: stayResult.stay.id,
      stayDeviceId: stayResult.stay.stayDeviceId,
      language,
      requests: requests || [],
      messages,
    });
  } catch (error) {
    console.error("Guest request conversation POST failed", error);
    return mapError(error);
  }
}
