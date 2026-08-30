import "server-only";

import { sendGuestCommunicationPush } from "@/lib/guest-push/guest-communications-web-push";
import { disableGuestPushSubscriptions, type GuestPushSubscriptionRow } from "@/lib/guest-push/web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type CommunicationRow = {
  id: string;
  hotel_id: string;
  category: string;
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

async function activeStaysForHotel(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("guest_stays")
    .select("id, room_number")
    .eq("hotel_id", hotelId)
    .eq("status", "active")
    .eq("lifecycle_state", "active")
    .or("is_test.is.null,is_test.eq.false")
    .limit(1000);
  if (error) throw error;
  return (data || []) as ActiveStayRow[];
}

async function subscriptionsForActiveStays(hotelId: string, stayIds: string[]) {
  if (!stayIds.length) return [] as GuestPushSubscriptionRow[];
  const { data, error } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .select("id, hotel_id, room_number, stay_id, stay_device_id, check_in_date, check_out_date, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test")
    .eq("hotel_id", hotelId)
    .eq("enabled", true)
    .or("is_test.is.null,is_test.eq.false")
    .in("stay_id", stayIds)
    .limit(2000);
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
    language: subscription.language || "en",
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
}) {
  if (!guestCommunicationsDeliveryEnabled()) {
    return { delivered: false, skipped: true, reason: "delivery_disabled" };
  }
  if (!input.hotel.active) return { delivered: false, skipped: true, reason: "hotel_inactive" };
  if (input.hotel.is_sandbox) return { delivered: false, skipped: true, reason: "sandbox_delivery_disabled" };
  if (input.communication.translation_status !== "ready") {
    return { delivered: false, skipped: true, reason: "translation_not_ready" };
  }
  if (input.communication.hotel_id !== input.hotel.id) {
    return { delivered: false, skipped: true, reason: "hotel_scope_mismatch" };
  }

  const claimed = await claimCommunication(input.communication);
  if (!claimed) return { delivered: false, skipped: true, reason: "not_claimed" };

  const stays = await activeStaysForHotel(input.communication.hotel_id);
  const stayIds = stays.map((stay) => stay.id);
  const subscriptions = await subscriptionsForActiveStays(input.communication.hotel_id, stayIds);
  await ensureDeliveryEvidence({ communication: input.communication, subscriptions });

  let sent = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;
  const expiredSubscriptionIds: string[] = [];

  for (const subscription of subscriptions) {
    if (String(subscription.hotel_id) !== input.communication.hotel_id) {
      skipped += 1;
      continue;
    }

    const evidence = await deliveryStatus(
      input.communication.hotel_id,
      input.communication.id,
      subscription.id,
    );
    if (!evidence || evidence.status === "sent") {
      if (evidence?.status === "sent") sent += 1;
      continue;
    }

    const result = await sendGuestCommunicationPush({
      subscription,
      hotelSlug: input.hotel.public_slug || input.hotel.slug,
      communicationId: input.communication.id,
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

    if (status === "sent") sent += 1;
    else if (status === "expired") {
      expired += 1;
      expiredSubscriptionIds.push(subscription.id);
    } else if (status === "skipped") skipped += 1;
    else failed += 1;
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

export async function dispatchDueGuestCommunications(limit = 20) {
  if (!guestCommunicationsDeliveryEnabled()) {
    return { enabled: false, checked: 0, delivered: 0, results: [] as unknown[] };
  }

  const now = new Date().toISOString();
  const { data: queued, error: queuedError } = await supabaseAdmin
    .from("guest_communications")
    .select("id,hotel_id,category,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at")
    .eq("status", "queued")
    .eq("translation_status", "ready")
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (queuedError) throw queuedError;

  const remaining = Math.max(0, limit - (queued || []).length);
  const { data: scheduled, error: scheduledError } = remaining > 0
    ? await supabaseAdmin
        .from("guest_communications")
        .select("id,hotel_id,category,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at")
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
