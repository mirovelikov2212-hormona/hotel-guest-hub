import "server-only";
import webPush from "web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import type { PushStaffRole } from "@/lib/staff-push/manager-auth";

type StaffPushInput = {
  hotelId: string;
  hotelSlug: string;
  requestId: string;
  room: string;
  requestTitle: string;
  targetRoles: PushStaffRole[];
  notificationTitle?: string;
  notificationUrl?: string;
  notificationRole?: PushStaffRole;
};

type ManagerPushInput = Omit<StaffPushInput, "targetRoles" | "notificationRole"> & {
  notificationRole?: PushStaffRole;
};

type PushSubscriptionRow = {
  id: string;
  role: PushStaffRole;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_seen_at?: string | null;
};

const RECENT_DELIVERY_TTL_MS = 5 * 60 * 1000;
const recentSuccessfulDeliveries = new Map<string, number>();

function uniqueRoles(roles: PushStaffRole[]) {
  return Array.from(new Set(roles.filter(Boolean)));
}

function getVapidConfig() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:info@stayhub.app").trim();

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getStaffPushPublicConfig() {
  const config = getVapidConfig();
  return {
    configured: Boolean(config),
    publicKey: config?.publicKey || "",
  };
}

export function getManagerPushPublicConfig() {
  return getStaffPushPublicConfig();
}

function configureWebPush() {
  const config = getVapidConfig();
  if (!config) return false;
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

async function disableExpiredSubscriptions(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabaseAdmin
    .from("staff_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    console.error("Failed to disable expired staff push subscriptions", error);
    await logSystemError({
      source: "push",
      eventType: "staff_push_expired_subscription_disable_failed",
      message: "Expired staff push subscriptions could not be disabled.",
      error,
      metadata: { expiredCount: ids.length },
    });
  }
}

function getRoleNotificationTitle(role: PushStaffRole) {
  if (role === "reception") return "StayHub — Нова заявка за рецепция";
  if (role === "housekeeping") return "StayHub — Нова заявка за камериерки";
  if (role === "maintenance") return "StayHub — Нова техническа заявка";
  return "StayHub — Нова заявка";
}

function getDefaultNotificationUrl(input: {
  hotelSlug: string;
  role: PushStaffRole;
  requestId: string;
}) {
  return `/staff/${input.hotelSlug}/${input.role}?source=push&request=${encodeURIComponent(input.requestId)}`;
}

function getLastSeenMs(row: PushSubscriptionRow) {
  const parsed = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeSubscriptionsByEndpoint(rows: PushSubscriptionRow[]) {
  const byEndpoint = new Map<string, PushSubscriptionRow>();

  for (const row of rows) {
    const existing = byEndpoint.get(row.endpoint);
    if (!existing || getLastSeenMs(row) > getLastSeenMs(existing)) {
      byEndpoint.set(row.endpoint, row);
    }
  }

  return Array.from(byEndpoint.values());
}

function buildRecentDeliveryKey(input: {
  hotelId: string;
  requestId: string;
  endpoint: string;
}) {
  return `${input.hotelId}:${input.requestId}:${input.endpoint}`;
}

function pruneRecentDeliveries(nowMs: number) {
  for (const [key, deliveredAt] of recentSuccessfulDeliveries) {
    if (nowMs - deliveredAt > RECENT_DELIVERY_TTL_MS) {
      recentSuccessfulDeliveries.delete(key);
    }
  }
}

function wasDeliveredRecently(key: string, nowMs: number) {
  const deliveredAt = recentSuccessfulDeliveries.get(key);
  return Boolean(
    deliveredAt && nowMs - deliveredAt <= RECENT_DELIVERY_TTL_MS,
  );
}

export async function sendStaffPushNotification(input: StaffPushInput) {
  if (!configureWebPush()) {
    console.warn("Staff push skipped: VAPID keys are not configured");
    await logSystemEvent({
      hotelId: input.hotelId,
      severity: "warning",
      source: "push",
      eventType: "staff_push_vapid_not_configured",
      message: "Staff push notification was skipped because VAPID keys are not configured.",
      roomNumber: input.room,
      requestId: input.requestId,
      metadata: { hotelSlug: input.hotelSlug, targetRoles: input.targetRoles },
    });
    return { sent: 0, failed: 0, deduped: 0, skipped: true };
  }

  const targetRoles = uniqueRoles(input.targetRoles);
  if (!targetRoles.length) {
    return { sent: 0, failed: 0, deduped: 0, skipped: false };
  }

  const { data, error } = await supabaseAdmin
    .from("staff_push_subscriptions")
    .select("id, role, endpoint, p256dh, auth, last_seen_at")
    .eq("hotel_id", input.hotelId)
    .in("role", targetRoles)
    .eq("enabled", true);

  if (error) {
    console.error("Failed to load staff push subscriptions", error);
    await logSystemError({
      hotelId: input.hotelId,
      source: "push",
      eventType: "staff_push_subscriptions_load_failed",
      message: "Staff push subscriptions could not be loaded before notification delivery.",
      roomNumber: input.room,
      requestId: input.requestId,
      error,
      metadata: { hotelSlug: input.hotelSlug, targetRoles },
    });
    return { sent: 0, failed: 0, deduped: 0, skipped: true };
  }

  const rows = (data || []) as PushSubscriptionRow[];
  if (!rows.length) {
    return { sent: 0, failed: 0, deduped: 0, skipped: false };
  }

  const subscriptions = dedupeSubscriptionsByEndpoint(rows);
  const expiredIds: string[] = [];
  const nowMs = Date.now();
  let sent = 0;
  let failed = 0;
  let deduped = 0;

  pruneRecentDeliveries(nowMs);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const role = subscription.role;
      const deliveryKey = buildRecentDeliveryKey({
        hotelId: input.hotelId,
        requestId: input.requestId,
        endpoint: subscription.endpoint,
      });

      if (wasDeliveredRecently(deliveryKey, nowMs)) {
        deduped += 1;
        return;
      }

      const payload = JSON.stringify({
        title: input.notificationTitle || getRoleNotificationTitle(role),
        body: `Стая ${input.room} · ${input.requestTitle}`,
        icon: "/icons/manager-192.png",
        badge: "/icons/manager-192.png",
        tag: `stayhub-request-${input.requestId}`,
        renotify: false,
        requireInteraction: false,
        data: {
          url: input.notificationUrl || getDefaultNotificationUrl({
            hotelSlug: input.hotelSlug,
            role: input.notificationRole || role,
            requestId: input.requestId,
          }),
          requestId: input.requestId,
          hotelSlug: input.hotelSlug,
          role,
        },
      });

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
        recentSuccessfulDeliveries.set(deliveryKey, Date.now());
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
          await logSystemEvent({
            hotelId: input.hotelId,
            severity: "info",
            source: "push",
            eventType: "staff_push_subscription_expired",
            message: "Expired staff push subscription was detected during delivery.",
            roomNumber: input.room,
            departmentId: role,
            requestId: input.requestId,
            metadata: { hotelSlug: input.hotelSlug, statusCode },
          });
        } else {
          console.error("Staff push delivery failed", {
            subscriptionId: subscription.id,
            role,
            statusCode,
            error,
          });
          await logSystemError({
            hotelId: input.hotelId,
            source: "push",
            eventType: "staff_push_delivery_failed",
            message: "Staff push delivery failed for an active subscription.",
            roomNumber: input.room,
            departmentId: role,
            requestId: input.requestId,
            error,
            metadata: { hotelSlug: input.hotelSlug, statusCode },
          });
        }
      }
    }),
  );

  await disableExpiredSubscriptions(expiredIds);
  return { sent, failed, deduped, skipped: false };
}

export async function sendManagerPushNotification(input: ManagerPushInput) {
  return sendStaffPushNotification({
    ...input,
    targetRoles: ["manager"],
    notificationRole: input.notificationRole || "manager",
    notificationUrl:
      input.notificationUrl ||
      `/staff/${input.hotelSlug}/manager?source=push&request=${encodeURIComponent(input.requestId)}`,
  });
}

export async function sendStaffTestPush(input: {
  hotelId: string;
  hotelSlug: string;
  role: PushStaffRole;
}) {
  return sendStaffPushNotification({
    hotelId: input.hotelId,
    hotelSlug: input.hotelSlug,
    requestId: `test-${Date.now()}`,
    room: "TEST",
    requestTitle:
      input.role === "manager"
        ? "Тестово известие за мениджъра"
        : "Тестово известие за отдела",
    targetRoles: [input.role],
    notificationRole: input.role,
  });
}

export async function sendManagerTestPush(input: {
  hotelId: string;
  hotelSlug: string;
}) {
  return sendStaffTestPush({ ...input, role: "manager" });
}
