import "server-only";

import webPush from "web-push";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

export type GuestPushLanguage = "bg" | "en" | "de" | "ro" | "cs" | "ru";

export type GuestPushSubscriptionRow = {
  id: string;
  hotel_id: string;
  room_number: string;
  stay_id: string | null;
  stay_device_id: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
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
  surveyDayNumber?: number;
  isFinalReminder?: boolean;
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

export function getDay3SurveyPushCopy(language: unknown, surveyDayNumber = 3) {
  const lang = normalizeGuestPushLanguage(language);
  const isFinalReminder = surveyDayNumber >= 5;
  const isReminder = surveyDayNumber >= 4;

  if (lang === "bg") {
    return isFinalReminder
      ? { title: "StayHub — Последно напомняне", body: "Днес е последният ден за кратката анкета за престоя. Отнема около минута." }
      : isReminder
        ? { title: "StayHub — Напомняне за анкетата", body: "Вашата кратка анкета все още Ви очаква. Отнема около минута." }
        : { title: "StayHub — Кратък въпрос към Вас", body: "Вашата анкета за престоя е готова. Отнема около минута и помага на хотела да реагира навреме." };
  }

  if (lang === "de") {
    return isFinalReminder
      ? { title: "StayHub — Letzte Erinnerung", body: "Heute ist der letzte Tag für die kurze Umfrage zu Ihrem Aufenthalt. Sie dauert etwa eine Minute." }
      : isReminder
        ? { title: "StayHub — Erinnerung an Ihre Umfrage", body: "Ihre kurze Umfrage wartet noch auf Sie. Sie dauert etwa eine Minute." }
        : { title: "StayHub — Eine kurze Frage", body: "Ihre Umfrage zum Aufenthalt ist bereit. Sie dauert etwa eine Minute und hilft dem Hotel, rechtzeitig zu reagieren." };
  }

  if (lang === "ro") {
    return isFinalReminder
      ? { title: "StayHub — Ultima reamintire", body: "Astăzi este ultima zi pentru scurtul chestionar despre sejur. Durează aproximativ un minut." }
      : isReminder
        ? { title: "StayHub — Reamintire pentru chestionar", body: "Scurtul chestionar încă vă așteaptă. Durează aproximativ un minut." }
        : { title: "StayHub — O întrebare scurtă", body: "Chestionarul despre sejur este gata. Durează aproximativ un minut și ajută hotelul să reacționeze la timp." };
  }

  if (lang === "cs") {
    return isFinalReminder
      ? { title: "StayHub — Poslední připomenutí", body: "Dnes je poslední den pro krátký dotazník k pobytu. Zabere přibližně jednu minutu." }
      : isReminder
        ? { title: "StayHub — Připomenutí dotazníku", body: "Krátký dotazník na vás stále čeká. Zabere přibližně jednu minutu." }
        : { title: "StayHub — Krátká otázka", body: "Váš dotazník k pobytu je připraven. Zabere přibližně jednu minutu a pomůže hotelu včas reagovat." };
  }

  if (lang === "ru") {
    return isFinalReminder
      ? { title: "StayHub — Последнее напоминание", body: "Сегодня последний день для короткой анкеты о пребывании. Это займет около минуты." }
      : isReminder
        ? { title: "StayHub — Напоминание об анкете", body: "Короткая анкета всё ещё ждёт вас. Это займет около минуты." }
        : { title: "StayHub — Короткий вопрос", body: "Ваша анкета о пребывании готова. Это займет около минуты и поможет отелю вовремя отреагировать." };
  }

  return isFinalReminder
    ? {
        title: "StayHub — Final reminder",
        body: "Today is the last day for the short stay survey. It takes about one minute.",
      }
    : isReminder
      ? {
          title: "StayHub — Survey reminder",
          body: "Your short survey is still waiting. It takes about one minute.",
        }
      : {
          title: "StayHub — A quick question",
          body: "Your stay survey is ready. It takes about one minute and helps the hotel react in time.",
        };
}


export function getMassageReminderPushCopy(language: unknown, serviceName?: string | null, startTime?: string | null) {
  const lang = normalizeGuestPushLanguage(language);
  const service = String(serviceName || "").trim();
  const time = String(startTime || "").trim();

  if (lang === "bg") {
    return {
      title: "StayHub — Напомняне за масаж",
      body: `${service || "Вашият масаж"}${time ? ` започва в ${time}` : " започва скоро"}.`,
    };
  }

  if (lang === "de") {
    return {
      title: "StayHub — Massage-Erinnerung",
      body: `${service || "Ihre Massage"}${time ? ` beginnt um ${time}` : " beginnt bald"}.`,
    };
  }

  if (lang === "ro") {
    return {
      title: "StayHub — Memento pentru masaj",
      body: `${service || "Masajul dvs."}${time ? ` începe la ${time}` : " începe în curând"}.`,
    };
  }

  if (lang === "cs") {
    return {
      title: "StayHub — Připomenutí masáže",
      body: `${service || "Vaše masáž"}${time ? ` začíná v ${time}` : " brzy začíná"}.`,
    };
  }

  if (lang === "ru") {
    return {
      title: "StayHub — Напоминание о массаже",
      body: `${service || "Ваш массаж"}${time ? ` начинается в ${time}` : " скоро начнётся"}.`,
    };
  }

  return {
    title: "StayHub — Massage reminder",
    body: `${service || "Your massage"}${time ? ` starts at ${time}` : " starts soon"}.`,
  };
}

export async function sendMassageReminderGuestPush(input: {
  subscription: GuestPushSubscriptionRow;
  hotelSlug: string;
  requestId: string;
  serviceName?: string | null;
  startTime?: string | null;
}) {
  if (!configureWebPush()) {
    console.warn("Massage reminder push skipped: VAPID keys are not configured");
    await logSystemEvent({
      hotelId: input.subscription.hotel_id,
      severity: "warning",
      source: "push",
      eventType: "massage_reminder_push_vapid_not_configured",
      message: "Massage reminder push was skipped because VAPID keys are not configured.",
      roomNumber: input.subscription.room_number,
      requestId: input.requestId,
      metadata: { hotelSlug: input.hotelSlug },
    });
    return { sent: false, expired: false, skipped: true, statusCode: 0 };
  }

  const copy = getMassageReminderPushCopy(
    input.subscription.language || "en",
    input.serviceName,
    input.startTime,
  );
  const targetUrl = `/h/${input.hotelSlug}?source=massage_reminder&request=${encodeURIComponent(input.requestId)}`;
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `stayhub-massage-reminder-${input.requestId}`,
    renotify: false,
    requireInteraction: false,
    data: {
      url: targetUrl,
      hotelSlug: input.hotelSlug,
      room: input.subscription.room_number,
      requestId: input.requestId,
      source: "guest_massage_reminder_push",
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
    if (expired) {
      await logSystemEvent({
        hotelId: input.subscription.hotel_id,
        severity: "info",
        source: "push",
        eventType: "guest_push_subscription_expired",
        message: "Expired guest push subscription was detected during massage reminder delivery.",
        roomNumber: input.subscription.room_number,
        requestId: input.requestId,
        metadata: { hotelSlug: input.hotelSlug, statusCode },
      });
    } else {
      console.error("Massage reminder push delivery failed", {
        subscriptionId: input.subscription.id,
        room: input.subscription.room_number,
        statusCode,
        error,
      });
      await logSystemError({
        hotelId: input.subscription.hotel_id,
        source: "push",
        eventType: "massage_reminder_push_delivery_failed",
        message: "Massage reminder push delivery failed for an active subscription.",
        roomNumber: input.subscription.room_number,
        requestId: input.requestId,
        error,
        metadata: { hotelSlug: input.hotelSlug, statusCode },
      });
    }
    return { sent: false, expired, skipped: false, statusCode };
  }
}

export async function disableGuestPushSubscriptions(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString(), last_push_status: "expired" })
    .in("id", ids);

  if (error) {
    console.error("Failed to disable expired guest push subscriptions", error);
    await logSystemError({
      source: "push",
      eventType: "guest_push_expired_subscription_disable_failed",
      message: "Expired guest push subscriptions could not be disabled.",
      error,
      metadata: { expiredCount: ids.length },
    });
  }
}

export async function sendDay3SurveyGuestPush(input: GuestSurveyPushInput) {
  if (!configureWebPush()) {
    console.warn("Guest survey push skipped: VAPID keys are not configured");
    await logSystemEvent({
      hotelId: input.subscription.hotel_id,
      severity: "warning",
      source: "push",
      eventType: "guest_push_vapid_not_configured",
      message: "Guest survey push was skipped because VAPID keys are not configured.",
      roomNumber: input.subscription.room_number,
      metadata: { hotelSlug: input.hotelSlug, surveyVersion: input.subscription.survey_version },
    });
    return { sent: false, expired: false, skipped: true, statusCode: 0 };
  }

  const surveyDayNumber = Math.min(5, Math.max(3, Number(input.surveyDayNumber || 3)));
  const reminderNumber = Math.max(1, surveyDayNumber - 2);
  const copyDayNumber = input.isFinalReminder ? 5 : surveyDayNumber;
  const copy = getDay3SurveyPushCopy(input.subscription.language || "en", copyDayNumber);
  const targetParams = new URLSearchParams({
    source: "guest_survey_push",
    survey: "1",
    room: input.subscription.room_number,
    surveyTarget: input.subscription.target_date_key || "",
    surveyReminder: String(reminderNumber),
  });
  if (input.subscription.stay_id) targetParams.set("surveyStay", input.subscription.stay_id);
  if (input.subscription.stay_device_id) targetParams.set("surveyDevice", input.subscription.stay_device_id);
  const targetUrl = `/h/${input.hotelSlug}?${targetParams.toString()}`;
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `stayhub-day3-survey-${input.subscription.stay_id || `${input.subscription.hotel_id}-${input.subscription.room_number}`}-${input.subscription.stay_device_id || "device"}-r${reminderNumber}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: targetUrl,
      hotelSlug: input.hotelSlug,
      room: input.subscription.room_number,
      stayId: input.subscription.stay_id || null,
      stayDeviceId: input.subscription.stay_device_id || null,
      checkInDate: input.subscription.check_in_date || null,
      checkOutDate: input.subscription.check_out_date || null,
      surveyVersion: input.subscription.survey_version || "day3-v1",
      targetDateKey: input.subscription.target_date_key || null,
      surveyDayNumber,
      reminderNumber,
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
        TTL: 18 * 60 * 60,
        urgency: "high",
      },
    );

    return { sent: true, expired: false, skipped: false, statusCode: 0 };
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
    const expired = statusCode === 404 || statusCode === 410;
    if (expired) {
      await logSystemEvent({
        hotelId: input.subscription.hotel_id,
        severity: "info",
        source: "push",
        eventType: "guest_push_subscription_expired",
        message: "Expired guest push subscription was detected during delivery.",
        roomNumber: input.subscription.room_number,
        metadata: { hotelSlug: input.hotelSlug, statusCode },
      });
    } else {
      console.error("Guest survey push delivery failed", {
        subscriptionId: input.subscription.id,
        room: input.subscription.room_number,
        statusCode,
        error,
      });
      await logSystemError({
        hotelId: input.subscription.hotel_id,
        source: "push",
        eventType: "guest_push_delivery_failed",
        message: "Guest survey push delivery failed for an active subscription.",
        roomNumber: input.subscription.room_number,
        error,
        metadata: { hotelSlug: input.hotelSlug, statusCode },
      });
    }
    return { sent: false, expired, skipped: false, statusCode };
  }
}
