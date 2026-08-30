import "server-only";

import webPush from "web-push";

import type { GuestPushSubscriptionRow } from "@/lib/guest-push/web-push";
import { normalizeGuestPushLanguage } from "@/lib/guest-push/web-push";

let configured = false;

function configure() {
  if (configured) return true;
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:info@stayhub.app").trim();
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

function localized(map: Record<string, unknown> | null | undefined, language: string, fallback: string) {
  const candidates = [language, "en", "bg", "de", "ro", "cs", "ru"];
  for (const key of candidates) {
    const value = String(map?.[key] || "").trim();
    if (value) return value;
  }
  return fallback;
}

export async function sendGuestCommunicationPush(input: {
  subscription: GuestPushSubscriptionRow;
  hotelSlug: string;
  communicationId: string;
  sourceTitle: string;
  sourceBody: string;
  titleI18n: Record<string, unknown>;
  bodyI18n: Record<string, unknown>;
  category: string;
}) {
  if (!configure()) return { sent: false, expired: false, skipped: true, statusCode: 0, error: "vapid_not_configured" };

  const language = normalizeGuestPushLanguage(input.subscription.language || "en");
  const title = localized(input.titleI18n, language, input.sourceTitle);
  const body = localized(input.bodyI18n, language, input.sourceBody);
  const targetUrl = `/h/${input.hotelSlug}?source=guest_communication&message=${encodeURIComponent(input.communicationId)}`;
  const payload = JSON.stringify({
    title,
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `stayhub-guest-communication-${input.communicationId}`,
    renotify: input.category === "emergency",
    requireInteraction: input.category === "emergency",
    data: {
      url: targetUrl,
      hotelSlug: input.hotelSlug,
      room: input.subscription.room_number,
      stayId: input.subscription.stay_id || null,
      communicationId: input.communicationId,
      category: input.category,
      source: "guest_communication_push",
    },
  });

  try {
    await webPush.sendNotification(
      {
        endpoint: input.subscription.endpoint,
        keys: {
          p256dh: input.subscription.p256dh,
          auth: input.subscription.auth,
        },
      },
      payload,
      {
        TTL: input.category === "emergency" ? 900 : 6 * 60 * 60,
        urgency: input.category === "emergency" ? "high" : "normal",
      },
    );
    return { sent: true, expired: false, skipped: false, statusCode: 0, error: null };
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
    return {
      sent: false,
      expired: statusCode === 404 || statusCode === 410,
      skipped: false,
      statusCode,
      error: error instanceof Error ? error.message.slice(0, 500) : "push_delivery_failed",
    };
  }
}
