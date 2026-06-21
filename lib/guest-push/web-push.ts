import "server-only";

import webPush from "web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type GuestPushLanguage = "bg" | "en" | "de" | "ro" | "cs" | "ru";

export type GuestPushSubscriptionRow = {
  id: string;
  hotel_id: string;
  room_number: string;
  language: string | null;
  hotel_timezone: string | null;
  survey_version: string | null;
  first_confirmed_date_key: string | null;
  target_date_key: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean | null;
  survey_push_sent_at: string | null;
  last_push_attempt_at: string | null;
  last_push_status: string | null;
  push_attempts: number | null;
  is_test?: boolean | null;
};

type GuestSurveyPushInput = {
  subscription: GuestPushSubscriptionRow;
  hotelSlug: string;
};

function getVapidConfig() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:info@stayhub.app").trim();

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getGuestPushPublicConfig() {
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

export function normalizeGuestPushLanguage(value: unknown): GuestPushLanguage {
  const key = String(value || "").trim().toLowerCase();
  if (key === "bg" || key === "en" || key === "de" || key === "ro" || key === "cs" || key === "ru") return key;
  return "en";
}

export function getDay3SurveyPushCopy(language: unknown) {
  const lang = normalizeGuestPushLanguage(language);

  if (lang === "bg") {
    return {
      title: "StayHub — Кратък въпрос към Вас",
      body: "Вашата анкета за престоя е готова. Отнема около минута и помага на хотела да реагира навреме.",
    };
  }

  if (lang === "de") {
    return {
      title: "StayHub — Eine kurze Frage",
      body: "Ihre Umfrage zum Aufenthalt ist bereit. Sie dauert etwa eine Minute und hilft dem Hotel, rechtzeitig zu reagieren.",
    };
  }

  if (lang === "ro") {
    return {
      title: "StayHub — O întrebare scurtă",
      body: "Chestionarul despre sejur este gata. Durează aproximativ un minut și ajută hotelul să reacționeze la timp.",
    };
  }

  if (lang === "cs") {
    return {
      title: "StayHub — Krátká otázka",
      body: "Váš dotazník k pobytu je připraven. Zabere přibližně jednu minutu a pomůže hotelu včas reagovat.",
    };
  }

  if (lang === "ru") {
    return {
      title: "StayHub — Короткий вопрос",
      body: "Ваша анкета о пребывании готова. Это займет около минуты и поможет отелю вовремя отреагировать.",
    };
  }

  return {
    title: "StayHub — A quick question",
    body: "Your stay survey is ready. It takes about one minute and helps the hotel react in time.",
  };
}

export async function disableGuestPushSubscriptions(ids: string[]) {
  if (!ids.length) return;
  await supabaseAdmin
    .from("guest_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString(), last_push_status: "expired" })
    .in("id", ids);
}

export async function sendDay3SurveyGuestPush(input: GuestSurveyPushInput) {
  if (!configureWebPush()) {
    console.warn("Guest survey push skipped: VAPID keys are not configured");
    return { sent: false, expired: false, skipped: true, statusCode: 0 };
  }

  const copy = getDay3SurveyPushCopy(input.subscription.language || "en");
  const targetUrl = `/h/${input.hotelSlug}?source=guest_survey_push&survey=1`;
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `stayhub-day3-survey-${input.subscription.hotel_id}-${input.subscription.room_number}`,
    renotify: false,
    requireInteraction: false,
    data: {
      url: targetUrl,
      hotelSlug: input.hotelSlug,
      room: input.subscription.room_number,
      surveyVersion: input.subscription.survey_version || "day3-v1",
      targetDateKey: input.subscription.target_date_key || null,
      source: "guest_day3_survey_push",
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
        TTL: 3600,
        urgency: "normal",
      },
    );

    return { sent: true, expired: false, skipped: false, statusCode: 0 };
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
    const expired = statusCode === 404 || statusCode === 410;
    if (!expired) {
      console.error("Guest survey push delivery failed", {
        subscriptionId: input.subscription.id,
        room: input.subscription.room_number,
        statusCode,
        error,
      });
    }
    return { sent: false, expired, skipped: false, statusCode };
  }
}
