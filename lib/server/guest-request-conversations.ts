import "server-only";

import { getHotelConfig } from "@/lib/config";
import { sendGuestCommunicationPush } from "@/lib/guest-push/guest-communications-web-push";
import {
  disableGuestPushSubscriptions,
  type GuestPushSubscriptionRow,
} from "@/lib/guest-push/web-push";
import {
  GUEST_COMMUNICATION_LANGUAGES,
  translateGuestCommunication,
  type GuestCommunicationLanguage,
} from "@/lib/server/guest-communications-translation";
import { guestCommunicationsDeliveryEnabled } from "@/lib/server/guest-communications-delivery";
import {
  hasGuestCommunicationCapability,
  type GuestCommunicationCapability,
} from "@/lib/server/guest-communications-access";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";

const THREAD_AUDIENCE = "request_thread" as const;

const STAFF_THREAD_TITLE: Record<GuestCommunicationLanguage, string> = {
  bg: "Уточнение по заявката",
  en: "Request clarification",
  de: "Rückfrage zu Ihrer Anfrage",
  ro: "Clarificare privind solicitarea",
  cs: "Upřesnění požadavku",
  ru: "Уточнение по запросу",
};

const GUEST_REPLY_TITLE: Record<GuestCommunicationLanguage, string> = {
  bg: "Отговор от госта",
  en: "Guest reply",
  de: "Antwort des Gastes",
  ro: "Răspunsul oaspetelui",
  cs: "Odpověď hosta",
  ru: "Ответ гостя",
};

export type GuestRequestConversationAccess = {
  hotel: {
    id: string;
    slug: string;
    publicSlug: string;
    name: string;
    timezone: string;
    isSandbox: boolean;
  };
  role: string;
  sessionId: string;
  runtimeRole: {
    kind: "manager" | "department";
    departmentId: string | null;
    departmentCode: string | null;
    departmentName: string | null;
  };
  capabilities: Record<GuestCommunicationCapability, boolean>;
};

type RequestRow = {
  id: string;
  hotel_id: string;
  department_id: string | null;
  stay_id: string | null;
  stay_device_id: string | null;
  room_number_snapshot: string | null;
  request_type: string;
  title: string;
  status: string;
  guest_language: string | null;
  metadata_json: Record<string, unknown> | null;
  conversation_state: string;
  conversation_updated_at: string | null;
  conversation_last_sender_type: string | null;
  departments?: { code?: string | null; name?: string | null } | Array<{ code?: string | null; name?: string | null }> | null;
};

type CommunicationRow = {
  id: string;
  request_id: string;
  stay_id: string;
  stay_device_id: string;
  sender_type: "staff" | "guest" | "system" | "ai";
  actor_role: string;
  source_language: string;
  title: string;
  body: string;
  title_i18n: Record<string, unknown> | null;
  body_i18n: Record<string, unknown> | null;
  translation_status: string;
  sent_at: string | null;
  created_at: string;
};

function cleanText(value: unknown, max = 1000) {
  const normalized = String(value ?? "").trim().replace(/\r\n/g, "\n");
  return normalized.length > 0 && normalized.length <= max ? normalized : "";
}

export function asGuestCommunicationLanguage(value: unknown): GuestCommunicationLanguage | null {
  const candidate = String(value || "").trim().toLowerCase() as GuestCommunicationLanguage;
  return GUEST_COMMUNICATION_LANGUAGES.includes(candidate) ? candidate : null;
}

function firstDepartment(value: RequestRow["departments"]) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function resolveRequestDepartmentCode(request: RequestRow) {
  const relational = String(firstDepartment(request.departments)?.code || "").trim().toLowerCase();
  if (relational) return relational;

  const metadataDepartment = String(request.metadata_json?.department || "").trim().toLowerCase();
  if (metadataDepartment) return metadataDepartment;

  const normalizedType = normalizeStaffRequestType(request.request_type, metadataDepartment || undefined);
  return getDepartmentForRequestType(normalizedType);
}

export async function getRequestForConversation(hotelId: string, requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("guest_requests")
    .select("id,hotel_id,department_id,stay_id,stay_device_id,room_number_snapshot,request_type,title,status,guest_language,metadata_json,conversation_state,conversation_updated_at,conversation_last_sender_type,departments!guest_requests_hotel_department_id_fkey(code,name)")
    .eq("hotel_id", hotelId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data as RequestRow | null;
}

export function staffCanViewRequestConversation(
  access: GuestRequestConversationAccess,
  request: RequestRow,
) {
  if (hasGuestCommunicationCapability(access, "guest_request_conversations.view_all")) return true;
  if (!hasGuestCommunicationCapability(access, "guest_request_conversations.view_own")) return false;
  if (access.runtimeRole.kind !== "department" || !access.runtimeRole.departmentCode) return false;
  return resolveRequestDepartmentCode(request) === access.runtimeRole.departmentCode;
}

export function staffCanReplyToRequestConversation(
  access: GuestRequestConversationAccess,
  request: RequestRow,
) {
  return staffCanViewRequestConversation(access, request)
    && hasGuestCommunicationCapability(access, "guest_request_conversations.reply");
}

export async function resolveHotelConversationSourceLanguage(hotelSlug: string) {
  const config = await getHotelConfig(hotelSlug).catch(() => null);
  const candidates = [config?.opsLanguage, config?.languageDefault, ...(config?.languages || [])];
  for (const candidate of candidates) {
    const language = asGuestCommunicationLanguage(candidate);
    if (language) return language;
  }
  return "en" as GuestCommunicationLanguage;
}

function localized(
  map: Record<string, unknown> | null,
  requestedLanguage: GuestCommunicationLanguage,
  sourceLanguage: GuestCommunicationLanguage,
  fallback: string,
) {
  const candidates = Array.from(new Set<GuestCommunicationLanguage>([
    requestedLanguage,
    sourceLanguage,
    "en",
    "bg",
    "de",
    "ro",
    "cs",
    "ru",
  ]));
  for (const candidate of candidates) {
    const value = cleanText(map?.[candidate], 1000);
    if (value) return value;
  }
  return fallback;
}

export function mapConversationMessage(
  row: CommunicationRow,
  requestedLanguageInput: unknown,
) {
  const sourceLanguage = asGuestCommunicationLanguage(row.source_language) || "en";
  const requestedLanguage = asGuestCommunicationLanguage(requestedLanguageInput) || sourceLanguage;
  return {
    id: row.id,
    requestId: row.request_id,
    senderType: row.sender_type,
    actorRole: row.actor_role,
    title: localized(row.title_i18n, requestedLanguage, sourceLanguage, row.title),
    body: localized(row.body_i18n, requestedLanguage, sourceLanguage, row.body),
    sourceLanguage,
    language: requestedLanguage,
    translationStatus: row.translation_status,
    sentAt: row.sent_at || row.created_at,
    createdAt: row.created_at,
  };
}

export async function loadConversationMessages(input: {
  hotelId: string;
  requestId?: string | null;
  stayId?: string | null;
  stayDeviceId?: string | null;
  language?: unknown;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("guest_communications")
    .select("id,request_id,stay_id,stay_device_id,sender_type,actor_role,source_language,title,body,title_i18n,body_i18n,translation_status,sent_at,created_at")
    .eq("hotel_id", input.hotelId)
    .eq("audience_type", THREAD_AUDIENCE)
    .in("status", ["sent", "partial_failed", "failed"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(200, Math.trunc(input.limit || 100))));

  if (input.requestId) query = query.eq("request_id", input.requestId);
  if (input.stayId) query = query.eq("stay_id", input.stayId);
  if (input.stayDeviceId) query = query.eq("stay_device_id", input.stayDeviceId);

  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as CommunicationRow[]).map((row) => mapConversationMessage(row, input.language));
}

async function appendConversationMessage(input: {
  hotelId: string;
  request: RequestRow;
  senderType: "staff" | "guest";
  actorRole: string;
  senderSessionId: string | null;
  sourceLanguage: GuestCommunicationLanguage;
  title: string;
  body: string;
  titleI18n: Record<string, string>;
  bodyI18n: Record<string, string>;
  translationStatus: "ready" | "partial";
}) {
  if (!input.request.stay_id || !input.request.stay_device_id) {
    throw new Error("GUEST_REQUEST_CONVERSATION_STAY_IDENTITY_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.rpc("append_guest_request_communication_v1", {
    p_hotel_id: input.hotelId,
    p_request_id: input.request.id,
    p_stay_id: input.request.stay_id,
    p_stay_device_id: input.request.stay_device_id,
    p_sender_type: input.senderType,
    p_actor_role: input.actorRole,
    p_sender_session_id: input.senderSessionId,
    p_source_language: input.sourceLanguage,
    p_title: input.title,
    p_body: input.body,
    p_title_i18n: input.titleI18n,
    p_body_i18n: input.bodyI18n,
    p_translation_status: input.translationStatus,
    p_delivery_status: "sent",
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.communication_id) throw new Error("GUEST_REQUEST_CONVERSATION_APPEND_FAILED");
  return {
    communicationId: String(row.communication_id),
    conversationState: String(row.conversation_state),
    conversationUpdatedAt: String(row.conversation_updated_at),
  };
}

async function getCommunicationForPush(hotelId: string, communicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("guest_communications")
    .select("id,hotel_id,audience_type,request_id,stay_id,stay_device_id,category,source_language,title,body,title_i18n,body_i18n,translation_status,status")
    .eq("hotel_id", hotelId)
    .eq("id", communicationId)
    .eq("audience_type", THREAD_AUDIENCE)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deliverRequestConversationPush(input: {
  hotel: GuestRequestConversationAccess["hotel"];
  request: RequestRow;
  communicationId: string;
}) {
  if (!guestCommunicationsDeliveryEnabled()) {
    return { attempted: false, reason: "delivery_disabled", total: 0, sent: 0, failed: 0, expired: 0 };
  }
  if (input.hotel.isSandbox) {
    return { attempted: false, reason: "sandbox_delivery_disabled", total: 0, sent: 0, failed: 0, expired: 0 };
  }
  if (!input.request.stay_id || !input.request.stay_device_id) {
    return { attempted: false, reason: "stay_identity_missing", total: 0, sent: 0, failed: 0, expired: 0 };
  }

  const communication = await getCommunicationForPush(input.hotel.id, input.communicationId);
  if (!communication
    || communication.request_id !== input.request.id
    || communication.stay_id !== input.request.stay_id
    || communication.stay_device_id !== input.request.stay_device_id
    || communication.status !== "sent") {
    return { attempted: false, reason: "communication_scope_mismatch", total: 0, sent: 0, failed: 0, expired: 0 };
  }

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .select("id, hotel_id, room_number, stay_id, stay_device_id, check_in_date, check_out_date, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test")
    .eq("hotel_id", input.hotel.id)
    .eq("stay_id", input.request.stay_id)
    .eq("stay_device_id", input.request.stay_device_id)
    .eq("enabled", true)
    .limit(10);
  if (subscriptionsError) throw subscriptionsError;

  const scopedSubscriptions = (subscriptions || []) as GuestPushSubscriptionRow[];
  if (!scopedSubscriptions.length) {
    await supabaseAdmin
      .from("guest_communications")
      .update({ delivery_total: 0, delivery_sent: 0, delivery_failed: 0, delivery_expired: 0 })
      .eq("hotel_id", input.hotel.id)
      .eq("id", input.communicationId)
      .eq("audience_type", THREAD_AUDIENCE);
    return { attempted: false, reason: "no_subscription", total: 0, sent: 0, failed: 0, expired: 0 };
  }

  const evidenceRows = scopedSubscriptions.map((subscription) => ({
    communication_id: input.communicationId,
    hotel_id: input.hotel.id,
    subscription_id: subscription.id,
    stay_id: input.request.stay_id,
    room_number: input.request.room_number_snapshot,
    language: subscription.language || communication.source_language,
    status: "queued",
  }));
  const { error: evidenceError } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .upsert(evidenceRows, { onConflict: "communication_id,subscription_id", ignoreDuplicates: true });
  if (evidenceError) throw evidenceError;

  const { data: evidence, error: evidenceLoadError } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .select("id,subscription_id,status")
    .eq("hotel_id", input.hotel.id)
    .eq("communication_id", input.communicationId)
    .in("subscription_id", scopedSubscriptions.map((subscription) => subscription.id));
  if (evidenceLoadError) throw evidenceLoadError;
  const evidenceMap = new Map((evidence || []).map((row) => [String(row.subscription_id), row]));

  let sent = 0;
  let failed = 0;
  let expired = 0;
  const expiredIds: string[] = [];
  const now = new Date().toISOString();

  for (const subscription of scopedSubscriptions) {
    const delivery = evidenceMap.get(subscription.id);
    if (!delivery) continue;
    if (delivery.status === "sent") {
      sent += 1;
      continue;
    }

    const result = await sendGuestCommunicationPush({
      subscription,
      hotelSlug: input.hotel.publicSlug,
      communicationId: input.communicationId,
      sourceLanguage: String(communication.source_language || "en"),
      sourceTitle: String(communication.title || ""),
      sourceBody: String(communication.body || ""),
      titleI18n: communication.title_i18n || {},
      bodyI18n: communication.body_i18n || {},
      category: "operational",
    });
    const status = result.sent ? "sent" : result.expired ? "expired" : "failed";
    if (status === "sent") sent += 1;
    else if (status === "expired") {
      expired += 1;
      expiredIds.push(subscription.id);
    } else failed += 1;

    const { error: updateError } = await supabaseAdmin
      .from("guest_communication_deliveries")
      .update({
        status,
        attempted_at: now,
        sent_at: status === "sent" ? now : null,
        status_code: result.statusCode || null,
        error_message: result.error || null,
        updated_at: now,
      })
      .eq("hotel_id", input.hotel.id)
      .eq("id", delivery.id);
    if (updateError) throw updateError;
  }

  await disableGuestPushSubscriptions(expiredIds);
  const { error: summaryError } = await supabaseAdmin
    .from("guest_communications")
    .update({
      delivery_total: scopedSubscriptions.length,
      delivery_sent: sent,
      delivery_failed: failed,
      delivery_expired: expired,
      last_error: failed > 0 ? `${failed} targeted push deliveries failed` : expired > 0 ? `${expired} targeted push subscriptions expired` : null,
      updated_at: now,
    })
    .eq("hotel_id", input.hotel.id)
    .eq("id", input.communicationId)
    .eq("audience_type", THREAD_AUDIENCE);
  if (summaryError) throw summaryError;

  return {
    attempted: true,
    reason: sent === scopedSubscriptions.length ? "sent" : failed || expired ? "partial_failed" : "sent",
    total: scopedSubscriptions.length,
    sent,
    failed,
    expired,
  };
}

export async function appendStaffConversationMessage(input: {
  access: GuestRequestConversationAccess;
  request: RequestRow;
  body: unknown;
}) {
  const messageBody = cleanText(input.body);
  if (!messageBody) throw new Error("GUEST_REQUEST_CONVERSATION_CONTENT_INVALID");
  const sourceLanguage = await resolveHotelConversationSourceLanguage(input.access.hotel.slug);
  const sourceTitle = STAFF_THREAD_TITLE[sourceLanguage];
  const translated = await translateGuestCommunication({
    sourceLanguage,
    title: sourceTitle,
    body: messageBody,
  });

  const appended = await appendConversationMessage({
    hotelId: input.access.hotel.id,
    request: input.request,
    senderType: "staff",
    actorRole: input.access.role,
    senderSessionId: input.access.sessionId,
    sourceLanguage,
    title: sourceTitle,
    body: messageBody,
    titleI18n: translated.titleI18n,
    bodyI18n: translated.bodyI18n,
    translationStatus: "ready",
  });

  let push;
  try {
    push = await deliverRequestConversationPush({
      hotel: input.access.hotel,
      request: input.request,
      communicationId: appended.communicationId,
    });
  } catch (error) {
    console.error("Request conversation targeted push failed", {
      hotelId: input.access.hotel.id,
      requestId: input.request.id,
      communicationId: appended.communicationId,
      error,
    });
    push = { attempted: true, reason: "push_error", total: 0, sent: 0, failed: 0, expired: 0 };
  }

  return { ...appended, push };
}

export async function appendGuestConversationMessage(input: {
  hotelId: string;
  request: RequestRow;
  sourceLanguage: GuestCommunicationLanguage;
  body: unknown;
}) {
  const messageBody = cleanText(input.body);
  if (!messageBody) throw new Error("GUEST_REQUEST_CONVERSATION_CONTENT_INVALID");
  const sourceTitle = GUEST_REPLY_TITLE[input.sourceLanguage];

  let titleI18n: Record<string, string> = { [input.sourceLanguage]: sourceTitle };
  let bodyI18n: Record<string, string> = { [input.sourceLanguage]: messageBody };
  let translationStatus: "ready" | "partial" = "partial";

  try {
    const translated = await translateGuestCommunication({
      sourceLanguage: input.sourceLanguage,
      title: sourceTitle,
      body: messageBody,
    });
    titleI18n = translated.titleI18n;
    bodyI18n = translated.bodyI18n;
    translationStatus = "ready";
  } catch (error) {
    // Never lose a guest reply solely because the translation provider is down.
    // Staff receive the authoritative source text and the row remains marked partial.
    console.error("Guest request reply translation unavailable", {
      hotelId: input.hotelId,
      requestId: input.request.id,
      sourceLanguage: input.sourceLanguage,
      error,
    });
  }

  return appendConversationMessage({
    hotelId: input.hotelId,
    request: input.request,
    senderType: "guest",
    actorRole: "guest",
    senderSessionId: null,
    sourceLanguage: input.sourceLanguage,
    title: sourceTitle,
    body: messageBody,
    titleI18n,
    bodyI18n,
    translationStatus,
  });
}