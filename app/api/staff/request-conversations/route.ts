import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  resolveGuestCommunicationsAccess,
} from "@/lib/server/guest-communications-access";
import {
  appendStaffConversationMessage,
  getRequestForConversation,
  loadConversationMessages,
  staffCanReplyToRequestConversation,
  staffCanViewRequestConversation,
  type GuestRequestConversationAccess,
} from "@/lib/server/guest-request-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function resolveAccess(hotelSlug: string, role: string) {
  const access = await resolveGuestCommunicationsAccess(hotelSlug, role);
  return access as GuestRequestConversationAccess | null;
}

function requestAcceptsConversationReplies(status: string) {
  return status !== "completed" && status !== "cancelled";
}

function mapConversationError(error: unknown) {
  const message = error instanceof Error ? error.message : "request_conversation_unavailable";
  if (message.includes("REQUEST_CLOSED")) return json({ ok: false, error: "request_closed" }, 409);
  if (message.includes("STAY_IDENTITY_REQUIRED")) return json({ ok: false, error: "stay_identity_required" }, 409);
  if (message.includes("CONTENT_INVALID")) return json({ ok: false, error: "invalid_content" }, 400);
  if (message.includes("translation") || message.includes("openai")) return json({ ok: false, error: "translation_unavailable" }, 503);
  return json({ ok: false, error: "request_conversation_unavailable" }, 503);
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(req.nextUrl.searchParams.get("role") || "").trim().toLowerCase();
    const requestId = String(req.nextUrl.searchParams.get("requestId") || "").trim();
    const language = String(req.nextUrl.searchParams.get("language") || "").trim().toLowerCase();
    if (!hotelSlug || !role || !UUID_PATTERN.test(requestId)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const access = await resolveAccess(hotelSlug, role);
    if (!access) return json({ ok: false, error: "unauthorized" }, 401);
    const request = await getRequestForConversation(access.hotel.id, requestId);
    if (!request) return json({ ok: false, error: "request_not_found" }, 404);
    if (!staffCanViewRequestConversation(access, request)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const messages = await loadConversationMessages({
      hotelId: access.hotel.id,
      requestId: request.id,
      language,
      limit: 100,
    });

    return json({
      ok: true,
      request: {
        id: request.id,
        room: request.room_number_snapshot,
        title: request.title,
        status: request.status,
        conversationState: request.conversation_state,
        conversationUpdatedAt: request.conversation_updated_at,
        lastSenderType: request.conversation_last_sender_type,
      },
      canReply: requestAcceptsConversationReplies(request.status)
        && staffCanReplyToRequestConversation(access, request),
      messages,
    });
  } catch (error) {
    console.error("Staff request conversation GET failed", error);
    return mapConversationError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const requestId = String(body?.requestId || "").trim();
    if (!hotelSlug || !role || !UUID_PATTERN.test(requestId)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const access = await resolveAccess(hotelSlug, role);
    if (!access) return json({ ok: false, error: "unauthorized" }, 401);
    const request = await getRequestForConversation(access.hotel.id, requestId);
    if (!request) return json({ ok: false, error: "request_not_found" }, 404);
    if (!staffCanViewRequestConversation(access, request)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    if (!requestAcceptsConversationReplies(request.status)) {
      return json({ ok: false, error: "request_closed" }, 409);
    }
    if (!staffCanReplyToRequestConversation(access, request)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const result = await appendStaffConversationMessage({
      access,
      request,
      body: body?.message,
    });

    return json({ ok: true, ...result }, 201);
  } catch (error) {
    console.error("Staff request conversation POST failed", error);
    return mapConversationError(error);
  }
}
