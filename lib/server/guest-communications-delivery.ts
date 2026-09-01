import "server-only";

import { sendGuestCommunicationPush } from "@/lib/guest-push/guest-communications-web-push";
import { disableGuestPushSubscriptions, type GuestPushSubscriptionRow } from "@/lib/guest-push/web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type CommunicationRow = {
  id: string;
  hotel_id: string;
  category: string;
  source_language: string;
  title: string;
  body: string;
  title_i18n: Record<string, unknown>;
  body_i18n: Record<string, unknown>;
  translation_status: string;
  status: string;
  scheduled_at: string | null;
};

type HotelRow = {
  id: string;
  slug: string;
  public_slug: string | null;
  active: boolean;
  is_sandbox: boolean | null;
};

type ActiveStayRow = {
  id: string;
  room_number: string;
};

type DeliveryResult = {
  sent: boolean;
  expired: boolean;
  skipped: boolean;
  statusCode: number;
  error: string | null;
};

type DeliveryTransport = (input: Parameters<typeof sendGuestCommunicationPush>[0]) => Promise<DeliveryResult>;

type DeliveryMode = {
  includeTest?: boolean;
  allowSandbox?: boolean;
  transport?: DeliveryTransport;
  concurrency?: number;
};

export function guestCommunicationsDeliveryEnabled() {
  return String(process.env.GUEST_COMMUNICATIONS_DELIVERY_ENABLED || "").trim().toLowerCase() === "true";
}

async function claimCommunication(row: CommunicationRow) {
  const now = new Date().toISOString();
  let query = supabaseAdmin
    .from("guest_communications")
    .update({ status: "sending", updated_at: now })
    .eq("id", row.id)
    .eq("hotel_id", row.hotel_id)
    .eq("translation_status", "ready")
    .eq("status", row.status);

  if (row.status === "scheduled") {
    query = query.lte("scheduled_at", now);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function activeStaysForHotel(hotelId: string, includeTest = false) {
  let query = supabaseAdmin
    .from("guest_stays")
    .select("id, room_number")
    .eq("hotel_id", hotelId)
    .eq("status", "active")
    .eq("lifecycle_state", "active")
    .limit(1000);
  if (!includeTest) query = query.or("is_test.is.null,is_test.eq.false");
  else query = query.eq("is_test", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ActiveStayRow[];
}

async function subscriptionsForActiveStays(hotelId: string, stayIds: string[], includeTest = false) {
  if (!stayIds.length) return [] as GuestPushSubscriptionRow[];
  let query = supabaseAdmin
    .from("guest_push_subscriptions")
    .select("id, hotel_id, room_number, stay_id, stay_device_id, check_in_date, check_out_date, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test")
    .eq("hotel_id", hotelId)
    .eq("enabled", true)
    .in("stay_id", stayIds)
    .limit(2000);
  if (!includeTest) query = query.or("is_test.is.null,is_test.eq.false");
  else query = query.eq("is_test", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as GuestPushSubscriptionRow[];
}

async function ensureDeliveryEvidence(input: {
  communication: CommunicationRow;
  subscriptions: GuestPushSubscriptionRow[];
}) {
  if (!input.subscriptions.length) return;
  const rows = input.subscriptions.map((subscription) => ({
    communication_id: input.communication.id,
    hotel_id: input.communication.hotel_id,
    subscription_id: subscription.id,
    stay_id: subscription.stay_id || null,
    room_number: subscription.room_number,
    language: subscription.language || input.communication.source_language || "en",
    status: "queued",
  }));
  const { error } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .upsert(rows, { onConflict: "communication_id,subscription_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function deliveryStatus(hotelId: string, communicationId: string, subscriptionId: string) {
  const { data, error } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .select("id,status")
    .eq("hotel_id", hotelId)
    .eq("communication_id", communicationId)
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string } | null;
}

async function writeDeliveryResult(input: {
  hotelId: string;
  id: string;
  status: "sent" | "failed" | "expired" | "skipped";
  statusCode: number;
  error: string | null;
}) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .update({
      status: input.status,
      attempted_at: now,
      sent_at: input.status === "sent" ? now : null,
      status_code: input.statusCode || null,
      error_message: input.error,
      updated_at: now,
    })
    .eq("hotel_id", input.hotelId)
    .eq("id", input.id);
  if (error) throw error;
}

async function finalizeCommunication(input: {
  communication: CommunicationRow;
  total: number;
  sent: number;
  failed: number;
  expired: number;
  skipped: number;
}) {
  const now = new Date().toISOString();
  const failureCount = input.failed + input.expired + input.skipped;
  const status = failureCount === 0
    ? "sent"
    : input.sent > 0
      ? "partial_failed"
      : "failed";
  const lastError = input.failed > 0
    ? `${input.failed} push deliveries failed`
    : input.expired > 0
      ? `${input.expired} push subscriptions expired`
      : input.skipped > 0
        ? `${input.skipped} push deliveries skipped`
        : null;

  const { error } = await supabaseAdmin
    .from("guest_communications")
    .update({
      status,
      sent_at: now,
      delivery_total: input.total,
      delivery_sent: input.sent,
      delivery_failed: input.failed + input.skipped,
      delivery_expired: input.expired,
      last_error: lastError,
      updated_at: now,
    })
    .eq("id", input.communication.id)
    .eq("hotel_id", input.communication.hotel_id)
    .eq("status", "sending");
  if (error) throw error;

  return { status, skipped: input.skipped };
}

export async function deliverGuestCommunication(input: {
  communication: CommunicationRow;
  hotel: HotelRow;
}, mode: DeliveryMode = {}) {
  if (!guestCommunicationsDeliveryEnabled() && !mode.allowSandbox) {
    return { delivered: false, skipped: true, reason: "delivery_disabled" };
  }
  if (!input.hotel.active) return { delivered: false, skipped: true, reason: "hotel_inactive" };
  if (input.hotel.is_sandbox && !mode.allowSandbox) return { delivered: false, skipped: true, reason: "sandbox_delivery_disabled" };
  if (mode.allowSandbox && (!input.hotel.is_sandbox || !mode.includeTest || !mode.transport)) {
    return { delivered: false, skipped: true, reason: "synthetic_scope_invalid" };
  }
  if (input.communication.translation_status !== "ready") {
    return { delivered: false, skipped: true, reason: "translation_not_ready" };
  }
  if (input.communication.hotel_id !== input.hotel.id) {
    return { delivered: false, skipped: true, reason: "hotel_scope_mismatch" };
  }

  const claimed = await claimCommunication(input.communication);
  if (!claimed) return { delivered: false, skipped: true, reason: "not_claimed" };

  const stays = await activeStaysForHotel(input.communication.hotel_id, mode.includeTest);
  const stayIds = stays.map((stay) => stay.id);
  const subscriptions = await subscriptionsForActiveStays(input.communication.hotel_id, stayIds, mode.includeTest);
  await ensureDeliveryEvidence({ communication: input.communication, subscriptions });

  let sent = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;
  const expiredSubscriptionIds: string[] = [];

  const transport = mode.transport || sendGuestCommunicationPush;
  const deliverOne = async (subscription: GuestPushSubscriptionRow) => {
    if (String(subscription.hotel_id) !== input.communication.hotel_id) {
      return { status: "skipped" as const, subscriptionId: null };
    }

    const evidence = await deliveryStatus(
      input.communication.hotel_id,
      input.communication.id,
      subscription.id,
    );
    if (!evidence || evidence.status === "sent") {
      return { status: evidence?.status === "sent" ? "sent" as const : "skipped" as const, subscriptionId: null };
    }

    const result = await transport({
      subscription,
      hotelSlug: input.hotel.public_slug || input.hotel.slug,
      communicationId: input.communication.id,
      sourceLanguage: input.communication.source_language,
      sourceTitle: input.communication.title,
      sourceBody: input.communication.body,
      titleI18n: input.communication.title_i18n || {},
      bodyI18n: input.communication.body_i18n || {},
      category: input.communication.category,
    });

    const status = result.sent
      ? "sent"
      : result.expired
        ? "expired"
        : result.skipped
          ? "skipped"
          : "failed";
    await writeDeliveryResult({
      hotelId: input.communication.hotel_id,
      id: evidence.id,
      status,
      statusCode: result.statusCode,
      error: result.error,
    });

    return { status, subscriptionId: status === "expired" ? subscription.id : null };
  };

  const concurrency = Math.max(1, Math.min(50, Math.trunc(mode.concurrency || 20)));
  for (let offset = 0; offset < subscriptions.length; offset += concurrency) {
    const batch = await Promise.all(subscriptions.slice(offset, offset + concurrency).map(deliverOne));
    for (const result of batch) {
      if (result.status === "sent") sent += 1;
      else if (result.status === "expired") {
        expired += 1;
        if (result.subscriptionId) expiredSubscriptionIds.push(result.subscriptionId);
      } else if (result.status === "skipped") skipped += 1;
      else failed += 1;
    }
  }

  await disableGuestPushSubscriptions(expiredSubscriptionIds);
  const final = await finalizeCommunication({
    communication: input.communication,
    total: subscriptions.length,
    sent,
    failed,
    expired,
    skipped,
  });
  return {
    delivered: true,
    skipped: false,
    status: final.status,
    total: subscriptions.length,
    sent,
    failed,
    expired,
    transportSkipped: skipped,
  };
}

export async function deliverSyntheticSandboxGuestCommunication(input: {
  communication: CommunicationRow;
  hotel: HotelRow;
  concurrency?: number;
}) {
  const syntheticTransport: DeliveryTransport = async ({ subscription }) => {
    if (!subscription.is_test) {
      return { sent: false, expired: false, skipped: true, statusCode: 0, error: "non_test_subscription_blocked" };
    }
    return { sent: true, expired: false, skipped: false, statusCode: 299, error: null };
  };
  return deliverGuestCommunication(input, {
    allowSandbox: true,
    includeTest: true,
    transport: syntheticTransport,
    concurrency: input.concurrency || 25,
  });
}

export async function dispatchDueGuestCommunications(limit = 20) {
  if (!guestCommunicationsDeliveryEnabled()) {
    return { enabled: false, checked: 0, delivered: 0, results: [] as unknown[] };
  }

  const now = new Date().toISOString();
  const { data: queued, error: queuedError } = await supabaseAdmin
    .from("guest_communications")
    .select("id,hotel_id,category,source_language,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at")
    .eq("status", "queued")
    .eq("translation_status", "ready")
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (queuedError) throw queuedError;

  const remaining = Math.max(0, limit - (queued || []).length);
  const { data: scheduled, error: scheduledError } = remaining > 0
    ? await supabaseAdmin
        .from("guest_communications")
        .select("id,hotel_id,category,source_language,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at")
        .eq("status", "scheduled")
        .eq("translation_status", "ready")
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(remaining)
    : { data: [], error: null };
  if (scheduledError) throw scheduledError;

  const communications = [...(queued || []), ...(scheduled || [])] as CommunicationRow[];
  const hotelIds = Array.from(new Set(communications.map((message) => message.hotel_id)));
  const { data: hotels, error: hotelsError } = hotelIds.length
    ? await supabaseAdmin
        .from("hotels")
        .select("id,slug,public_slug,active,is_sandbox")
        .in("id", hotelIds)
    : { data: [], error: null };
  if (hotelsError) throw hotelsError;
  const hotelMap = new Map((hotels || []).map((hotel) => [String(hotel.id), hotel as HotelRow]));

  const results: unknown[] = [];
  for (const communication of communications) {
    const hotel = hotelMap.get(communication.hotel_id);
    if (!hotel) {
      results.push({ id: communication.id, delivered: false, reason: "hotel_missing" });
      continue;
    }
    results.push({ id: communication.id, ...(await deliverGuestCommunication({ communication, hotel })) });
  }

  return {
    enabled: true,
    checked: communications.length,
    delivered: results.filter((result) => Boolean((result as { delivered?: boolean }).delivered)).length,
    results,
  };
}
