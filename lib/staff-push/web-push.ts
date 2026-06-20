import "server-only";
import webPush from "web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
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
};

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
  await supabaseAdmin
    .from("staff_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .in("id", ids);
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

export async function sendStaffPushNotification(input: StaffPushInput) {
  if (!configureWebPush()) {
    console.warn("Staff push skipped: VAPID keys are not configured");
    return { sent: 0, failed: 0, skipped: true };
  }

  const targetRoles = uniqueRoles(input.targetRoles);
  if (!targetRoles.length) return { sent: 0, failed: 0, skipped: false };

  const { data, error } = await supabaseAdmin
    .from("staff_push_subscriptions")
    .select("id, role, endpoint, p256dh, auth")
    .eq("hotel_id", input.hotelId)
    .in("role", targetRoles)
    .eq("enabled", true);

  if (error) {
    console.error("Failed to load staff push subscriptions", error);
    return { sent: 0, failed: 0, skipped: true };
  }

  const rows = (data || []) as PushSubscriptionRow[];
  if (!rows.length) return { sent: 0, failed: 0, skipped: false };

  const subscriptions = Array.from(
    new Map(rows.map((row) => [`${row.endpoint}:${row.role}`, row])).values(),
  );

  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const role = subscription.role;
      const payload = JSON.stringify({
        title: input.notificationTitle || getRoleNotificationTitle(role),
        body: `Стая ${input.room} · ${input.requestTitle}`,
        icon: "/icons/manager-192.png",
        badge: "/icons/manager-192.png",
        tag: `stayhub-${role}-${input.requestId}`,
        renotify: true,
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
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
        } else {
          console.error("Staff push delivery failed", {
            subscriptionId: subscription.id,
            role,
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
