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
  delivery_attempts?: number | null;
  sending_started_at?: string | null;
  next_delivery_attempt_at?: string | null;
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
    .update({
      status: "sending",
      delivery_attempts: Math.min(10, Number(row.delivery_attempts || 0) + 1),
      sending_started_at: now,
      next_delivery_attempt_at: null,
      updated_at: now,
    })
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
    language: subscription.language || input.communication.source_language || "en",
    status: "queued",
  }));
  const { error } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .upsert(rows, { onConflict: "communication_id,subscription_id", ignoreDuplicates: true });
  if (error) throw error;
}

async function deliveryStatuses(hotelId: string, communicationId: string, subscriptionIds: string[]) {
  if (!subscriptionIds.length) return new Map<string, { id: string; status: string }>();
  const { data, error } = await supabaseAdmin
    .from("guest_communication_deliveries")
    .select("id,status,subscription_id")
    .eq("hotel_id", hotelId)
    .eq("communication_id", communicationId)
    .in("subscription_id", subscriptionIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.subscription_id), { id: String(row.id), status: String(row.status) }]));
}

async function writeDeliveryResults(inputs: Array<{
  hotelId: string;
  id: string;
  status: "sent" | "failed" | "expired" | "skipped";
  statusCode: number;
  error: string | null;
}>) {
  if (!inputs.length) return;
  const now = new Date().toISOString();
  const groups = new Map<string, typeof inputs>();
  for (const input of inputs) {
    const key = JSON.stringify([input.hotelId, input.status, input.statusCode || null, input.error]);
    groups.set(key, [...(groups.get(key) || []), input]);
  }
  for (const group of groups.values()) {
    const sample = group[0];
    const { error } = await supabaseAdmin
      .from("guest_communication_deliveries")
      .update({
        status: sample.status,
        attempted_at: now,
        sent_at: sample.status === "sent" ? now : null,
        status_code: sample.statusCode || null,
        error_message: sample.error,
        updated_at: now,
      })
      .eq("hotel_id", sample.hotelId)
      .in("id", group.map((item) => item.id));
    if (error) throw error;
  }
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
      sending_started_at: null,
      next_delivery_attempt_at: null,
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
  const evidenceBySubscription = await deliveryStatuses(
    input.communication.hotel_id,
    input.communication.id,
    subscriptions.map((subscription) => subscription.id),
  );

  let sent = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;
  const expiredSubscriptionIds: string[] = [];

  const deliverOne = async (subscription: GuestPushSubscriptionRow) => {
    if (String(subscription.hotel_id) !== input.communication.hotel_id) {
      return { status: "skipped" as const, subscriptionId: null };
    }

    const evidence = evidenceBySubscription.get(subscription.id);
    if (!evidence || evidence.status === "sent") {
      return { status: evidence?.status === "sent" ? "sent" as const : "skipped" as const, subscriptionId: null };
    }

    const result = await sendGuestCommunicationPush({
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

    const status: "sent" | "failed" | "expired" | "skipped" = result.sent
      ? "sent"
      : result.expired
        ? "expired"
        : result.skipped
          ? "skipped"
          : "failed";
    return {
      status,
      subscriptionId: status === "expired" ? subscription.id : null,
      evidenceId: evidence.id,
      statusCode: result.statusCode,
      error: result.error,
    };
  };

  const concurrency = 20;
  for (let offset = 0; offset < subscriptions.length; offset += concurrency) {
    const batch = await Promise.all(subscriptions.slice(offset, offset + concurrency).map(deliverOne));
    await writeDeliveryResults(batch.flatMap((result) => result.evidenceId ? [{
      hotelId: input.communication.hotel_id,
      id: result.evidenceId,
      status: result.status,
      statusCode: result.statusCode || 0,
      error: result.error || null,
    }] : []));
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

export async function dispatchDueGuestCommunications(limit = 20) {
  if (!guestCommunicationsDeliveryEnabled()) {
    return { enabled: false, checked: 0, delivered: 0, results: [] as unknown[] };
  }

  const now = new Date().toISOString();
  const { data: queued, error: queuedError } = await supabaseAdmin
    .from("guest_communications")
    .select("id,hotel_id,category,source_language,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at,delivery_attempts,sending_started_at,next_delivery_attempt_at")
    .eq("status", "queued")
    .eq("translation_status", "ready")
    .or(`next_delivery_attempt_at.is.null,next_delivery_attempt_at.lte.${now}`)
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (queuedError) throw queuedError;

  const remaining = Math.max(0, limit - (queued || []).length);
  const { data: scheduled, error: scheduledError } = remaining > 0
    ? await supabaseAdmin
        .from("guest_communications")
        .select("id,hotel_id,category,source_language,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at,delivery_attempts,sending_started_at,next_delivery_attempt_at")
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

export async function recoverStuckGuestCommunications(input: {
  staleMinutes?: number;
  maxAttempts?: number;
  limit?: number;
} = {}) {
  const staleMinutes = Math.max(2, Math.min(30, Math.trunc(input.staleMinutes || 5)));
  const maxAttempts = Math.max(1, Math.min(10, Math.trunc(input.maxAttempts || 3)));
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit || 20)));
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from("guest_communications")
    .select("id,hotel_id,delivery_attempts,sending_started_at")
    .eq("status", "sending")
    .lt("sending_started_at", cutoff)
    .order("sending_started_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let requeued = 0;
  let deadLettered = 0;
  for (const row of data || []) {
    const attempts = Number(row.delivery_attempts || 0);
    const exhausted = attempts >= maxAttempts;
    const backoffMinutes = Math.min(30, 2 ** Math.max(0, attempts - 1));
    const update = exhausted ? {
      status: "failed",
      dead_lettered_at: now.toISOString(),
      sending_started_at: null,
      next_delivery_attempt_at: null,
      last_error: `Automatic delivery recovery exhausted after ${attempts} attempts`,
      updated_at: now.toISOString(),
    } : {
      status: "queued",
      sending_started_at: null,
      next_delivery_attempt_at: new Date(now.getTime() + backoffMinutes * 60_000).toISOString(),
      last_error: `Recovered stale delivery claim after attempt ${attempts}`,
      queued_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const { data: changed, error: updateError } = await supabaseAdmin
      .from("guest_communications")
      .update(update)
      .eq("id", row.id)
      .eq("hotel_id", row.hotel_id)
      .eq("status", "sending")
      .eq("delivery_attempts", attempts)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!changed) continue;
    if (exhausted) deadLettered += 1;
    else requeued += 1;
  }
  return { checked: (data || []).length, requeued, deadLettered, staleMinutes, maxAttempts };
}
