import "server-only";
import webPush from "web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type ManagerPushInput = {
  hotelId: string;
  hotelSlug: string;
  requestId: string;
  room: string;
  requestTitle: string;
  notificationTitle?: string;
  notificationUrl?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getVapidConfig() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:info@stayhub.app").trim();

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getManagerPushPublicConfig() {
  const config = getVapidConfig();
  return {
    configured: Boolean(config),
    publicKey: config?.publicKey || "",
  };
}

function configureWebPush() {
  const config = getVapidConfig();
  if (!config) return false;
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

async function disableExpiredSubscriptions(ids: string[]) {
  if (!ids.length) return;
  await supabaseAdmin
    .from("staff_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .in("id", ids);
}

export async function sendManagerPushNotification(input: ManagerPushInput) {
  if (!configureWebPush()) {
    console.warn("Manager push skipped: VAPID keys are not configured");
    return { sent: 0, failed: 0, skipped: true };
  }

  const { data, error } = await supabaseAdmin
    .from("staff_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("hotel_id", input.hotelId)
    .eq("role", "manager")
    .eq("enabled", true);

  if (error) {
    console.error("Failed to load manager push subscriptions", error);
    return { sent: 0, failed: 0, skipped: true };
  }

  const subscriptions = (data || []) as PushSubscriptionRow[];
  if (!subscriptions.length) return { sent: 0, failed: 0, skipped: false };

  const payload = JSON.stringify({
    title: input.notificationTitle || "StayHub — Нова заявка",
    body: `Стая ${input.room} · ${input.requestTitle}`,
    icon: "/icons/manager-192.png",
    badge: "/icons/manager-192.png",
    tag: `stayhub-manager-${input.requestId}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: input.notificationUrl || `/staff/${input.hotelSlug}/manager?source=push&request=${encodeURIComponent(input.requestId)}`,
      requestId: input.requestId,
      hotelSlug: input.hotelSlug,
    },
  });

  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 300,
            urgency: "high",
          },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
        } else {
          console.error("Manager push delivery failed", {
            subscriptionId: subscription.id,
            statusCode,
            error,
          });
        }
      }
    }),
  );

  await disableExpiredSubscriptions(expiredIds);
  return { sent, failed, skipped: false };
}

export async function sendManagerTestPush(input: {
  hotelId: string;
  hotelSlug: string;
}) {
  return sendManagerPushNotification({
    hotelId: input.hotelId,
    hotelSlug: input.hotelSlug,
    requestId: `test-${Date.now()}`,
    room: "TEST",
    requestTitle: "Тестово известие за мениджъра",
  });
}
