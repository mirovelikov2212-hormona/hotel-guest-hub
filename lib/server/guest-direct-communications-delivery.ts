import "server-only";

import { sendGuestCommunicationPush } from "@/lib/guest-push/guest-communications-web-push";
import { disableGuestPushSubscriptions, type GuestPushSubscriptionRow } from "@/lib/guest-push/web-push";
import { guestCommunicationsDeliveryEnabledForHotel } from "@/lib/server/guest-communications-delivery-policy";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type DirectCommunicationRow = {
  id: string;
  hotel_id: string;
  stay_id: string;
  category: string;
  source_language: string;
  title: string;
  body: string;
  title_i18n: Record<string, unknown>;
  body_i18n: Record<string, unknown>;
};

const SUBSCRIPTION_SELECT = "id, hotel_id, room_number, stay_id, stay_device_id, check_in_date, check_out_date, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test";

export async function deliverDirectGuestCommunication(input: {
  communication: DirectCommunicationRow;
  hotel: { id: string; slug: string; publicSlug: string; isSandbox: boolean };
}) {
  if (!(await guestCommunicationsDeliveryEnabledForHotel(input.hotel.id))) {
    return { attempted: false, reason: "delivery_disabled", total: 0, sent: 0, failed: 0, expired: 0 };
  }
  if (input.hotel.isSandbox) {
    return { attempted: false, reason: "sandbox_delivery_disabled", total: 0, sent: 0, failed: 0, expired: 0 };
  }
  if (input.communication.hotel_id !== input.hotel.id || !input.communication.stay_id) {
    return { attempted: false, reason: "target_scope_invalid", total: 0, sent: 0, failed: 0, expired: 0 };
  }

  const { data: subscriptionRows, error: subscriptionError } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("hotel_id", input.hotel.id)
    .eq("stay_id", input.communication.stay_id)
    .eq("enabled", true)
    .or("is_test.is.null,is_test.eq.false")
    .limit(50);
  if (subscriptionError) throw subscriptionError;
  const subscriptions = (subscriptionRows || []) as GuestPushSubscriptionRow[];

  if (!subscriptions.length) {
    const { error: summaryError } = await supabaseAdmin.from("guest_communications").update({
      delivery_total: 0, delivery_sent: 0, delivery_failed: 0, delivery_expired: 0, last_error: null,
    }).eq("hotel_id", input.hotel.id).eq("id", input.communication.id).eq("audience_type", "direct_guest");
    if (summaryError) throw summaryError;
    return { attempted: false, reason: "no_subscription", total: 0, sent: 0, failed: 0, expired: 0 };
  }

  const evidenceRows = subscriptions.map((subscription) => ({
    communication_id: input.communication.id,
    hotel_id: input.hotel.id,
    subscription_id: subscription.id,
    stay_id: input.communication.stay_id,
    room_number: subscription.room_number,
    language: subscription.language || input.communication.source_language,
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
    .eq("communication_id", input.communication.id)
    .in("subscription_id", subscriptions.map((subscription) => subscription.id));
  if (evidenceLoadError) throw evidenceLoadError;
  const evidenceMap = new Map<string, { id: string; status: string }>((evidence || []).map((row) => [String(row.subscription_id), { id: String(row.id), status: String(row.status) }]));

  let sent = 0;
  let failed = 0;
  let expired = 0;
  const expiredIds: string[] = [];
  const now = new Date().toISOString();

  for (const subscription of subscriptions) {
    const row = evidenceMap.get(subscription.id);
    if (!row) continue;
    if (row.status === "sent") {
      sent += 1;
      continue;
    }
    const result = await sendGuestCommunicationPush({
      subscription,
      hotelSlug: input.hotel.publicSlug || input.hotel.slug,
      communicationId: input.communication.id,
      sourceLanguage: input.communication.source_language,
      sourceTitle: input.communication.title,
      sourceBody: input.communication.body,
      titleI18n: input.communication.title_i18n || {},
      bodyI18n: input.communication.body_i18n || {},
      category: input.communication.category,
    });
    const status = result.sent ? "sent" : result.expired ? "expired" : "failed";
    if (result.sent) sent += 1;
    else if (result.expired) { expired += 1; expiredIds.push(subscription.id); }
    else failed += 1;
    const { error } = await supabaseAdmin.from("guest_communication_deliveries").update({
      status,
      attempted_at: now,
      sent_at: result.sent ? now : null,
      status_code: result.statusCode || null,
      error_message: result.error || null,
      updated_at: now,
    }).eq("hotel_id", input.hotel.id).eq("id", row.id);
    if (error) throw error;
  }

  await disableGuestPushSubscriptions(expiredIds);
  const lastError = failed ? `${failed} push deliveries failed` : expired ? `${expired} push subscriptions expired` : null;
  const { error: summaryError } = await supabaseAdmin.from("guest_communications").update({
    delivery_total: subscriptions.length,
    delivery_sent: sent,
    delivery_failed: failed,
    delivery_expired: expired,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq("hotel_id", input.hotel.id).eq("id", input.communication.id).eq("audience_type", "direct_guest");
  if (summaryError) throw summaryError;

  return { attempted: true, reason: null, total: subscriptions.length, sent, failed, expired };
}
