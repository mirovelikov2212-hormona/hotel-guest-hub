"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LangKey } from "@/lib/types";
import { addDaysToStayDateKey } from "@/lib/guest-stays/shared";

const SURVEY_VERSION = "day3-v1";
type Status =
  | "checking"
  | "unsupported"
  | "not_configured"
  | "ready"
  | "enabled"
  | "denied"
  | "error";

type Copy = {
  title: string;
  text: string;
  enable: string;
  disable: string;
  enabled: string;
  denied: string;
  unsupported: string;
  notConfigured: string;
  checking: string;
  error: string;
  installHint: string;
};

const COPY: Record<string, Copy> = {
  bg: {
    title: "Включи известията",
    text: "Получавайте важни съобщения от хотела и кратката анкета за престоя.",
    enable: "Включи",
    disable: "Изключи известията",
    enabled: "Известията са активни на това устройство.",
    denied: "Известията са блокирани. Разрешете ги от настройките на телефона за това приложение.",
    unsupported: "Това устройство или браузър не поддържа push известия.",
    notConfigured: "Известията още не са настроени на сървъра.",
    checking: "Проверка на известията…",
    error: "Настройването не успя. Моля, опитайте отново.",
    installHint: "На iPhone: първо добавете хъба към началния екран, после разрешете известията.",
  },
  en: {
    title: "Hotel notifications",
    text: "Receive important hotel messages and the short stay survey.",
    enable: "Enable notifications",
    disable: "Disable notifications",
    enabled: "Notifications are active on this device.",
    denied: "Notifications are blocked. Enable them in your phone settings for this app.",
    unsupported: "Push notifications are not supported by this browser or device.",
    notConfigured: "Notifications are not configured on the server yet.",
    checking: "Checking notification status…",
    error: "Notification setup failed. Please try again.",
    installHint: "On iPhone: first add the hub to your Home Screen, then enable notifications.",
  },
  de: {
    title: "Hotel-Mitteilungen",
    text: "Erhalten Sie wichtige Hotelmitteilungen und die kurze Umfrage zu Ihrem Aufenthalt.",
    enable: "Mitteilungen aktivieren",
    disable: "Mitteilungen deaktivieren",
    enabled: "Mitteilungen sind auf diesem Gerät aktiv.",
    denied: "Mitteilungen sind blockiert. Aktivieren Sie sie in den Telefoneinstellungen für diese App.",
    unsupported: "Push-Mitteilungen werden von diesem Browser oder Gerät nicht unterstützt.",
    notConfigured: "Mitteilungen sind auf dem Server noch nicht eingerichtet.",
    checking: "Mitteilungsstatus wird geprüft…",
    error: "Die Einrichtung ist fehlgeschlagen. Bitte erneut versuchen.",
    installHint: "Auf dem iPhone: zuerst den Hub zum Home-Bildschirm hinzufügen, dann Mitteilungen aktivieren.",
  },
  ro: {
    title: "Notificări de la hotel",
    text: "Primiți mesaje importante de la hotel și scurtul chestionar despre sejur.",
    enable: "Activează notificările",
    disable: "Dezactivează notificările",
    enabled: "Notificările sunt active pe acest dispozitiv.",
    denied: "Notificările sunt blocate. Activați-le din setările telefonului pentru această aplicație.",
    unsupported: "Acest dispozitiv sau browser nu acceptă notificări push.",
    notConfigured: "Notificările nu sunt încă configurate pe server.",
    checking: "Se verifică notificările…",
    error: "Configurarea notificărilor a eșuat. Încercați din nou.",
    installHint: "Pe iPhone: adăugați mai întâi hub-ul pe ecranul principal, apoi activați notificările.",
  },
  cs: {
    title: "Hotelová oznámení",
    text: "Dostávejte důležité zprávy z hotelu a krátký dotazník k pobytu.",
    enable: "Povolit oznámení",
    disable: "Vypnout oznámení",
    enabled: "Oznámení jsou na tomto zařízení aktivní.",
    denied: "Oznámení jsou blokována. Povolte je v nastavení telefonu pro tuto aplikaci.",
    unsupported: "Toto zařízení nebo prohlížeč nepodporuje push oznámení.",
    notConfigured: "Oznámení zatím nejsou nakonfigurována na serveru.",
    checking: "Kontrola oznámení…",
    error: "Nastavení oznámení se nezdařilo. Zkuste to prosím znovu.",
    installHint: "Na iPhonu: nejprve přidejte hub na plochu, potom povolte oznámení.",
  },
  ru: {
    title: "Уведомления от отеля",
    text: "Получайте важные сообщения от отеля и короткую анкету о пребывании.",
    enable: "Разрешить уведомления",
    disable: "Отключить уведомления",
    enabled: "Уведомления активны на этом устройстве.",
    denied: "Уведомления заблокированы. Разрешите их в настройках телефона для этого приложения.",
    unsupported: "Это устройство или браузер не поддерживает push-уведомления.",
    notConfigured: "Уведомления ещё не настроены на сервере.",
    checking: "Проверка уведомлений…",
    error: "Не удалось настроить уведомления. Попробуйте ещё раз.",
    installHint: "На iPhone: сначала добавьте хаб на экран «Домой», затем разрешите уведомления.",
  },
};

function normalizeLang(value: LangKey | string): keyof typeof COPY {
  const key = String(value || "").trim().toLowerCase();
  return key in COPY ? key : "en";
}

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}


async function waitForGuestServiceWorker(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
  } catch (error) {
    console.warn("guest push get service worker registration failed", error);
  }

  try {
    // The file already exists for staff push. Registering it here is safe and avoids
    // a mobile PWA state where serviceWorker.ready can wait too long after reinstall.
    const registered = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (registered) return registered;
  } catch (error) {
    console.warn("guest push service worker registration failed", error);
  }

  const timeout = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), timeoutMs);
  });

  return Promise.race([navigator.serviceWorker.ready, timeout]).catch(() => null);
}

async function getGuestPushConfig(): Promise<{ ok?: boolean; configured?: boolean; publicKey?: string; error?: string }> {
  const response = await fetch("/api/guest/push/config", { credentials: "include", cache: "no-store" });
  return response.json();
}

async function saveGuestSubscription(input: {
  hotelSlug: string;
  room: string;
  language: string;
  hotelTimezone: string;
  firstConfirmedDateKey: string | null;
  targetDateKey: string | null;
  checkInDate: string;
  checkOutDate: string;
  stayId: string;
  stayDeviceId: string;
  deviceToken: string;
  subscription: PushSubscription;
}) {
  const response = await fetch("/api/guest/push/subscription", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hotelSlug: input.hotelSlug,
      room: input.room,
      language: input.language,
      hotelTimezone: input.hotelTimezone,
      surveyVersion: SURVEY_VERSION,
      firstConfirmedDateKey: input.firstConfirmedDateKey,
      targetDateKey: input.targetDateKey,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      stayId: input.stayId,
      stayDeviceId: input.stayDeviceId,
      deviceToken: input.deviceToken,
      subscription: input.subscription.toJSON(),
    }),
  });

  if (!response.ok) throw new Error("Failed to save guest push subscription");
  return response.json();
}

async function deleteGuestSubscription(input: {
  hotelSlug: string;
  room: string;
  subscription: PushSubscription;
}) {
  const response = await fetch("/api/guest/push/subscription", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hotelSlug: input.hotelSlug,
      room: input.room,
      endpoint: input.subscription.endpoint,
    }),
  });

  if (!response.ok) throw new Error("Failed to delete guest push subscription");
  return response.json();
}

export default function GuestSurveyPushControls({
  hotelSlug,
  room,
  roomConfirmed,
  lang,
  timezone,
  stayId,
  stayDeviceId,
  deviceToken,
  checkInDate,
  checkOutDate,
}: {
  hotelSlug: string;
  room: string;
  roomConfirmed: boolean;
  lang: LangKey;
  timezone: string;
  stayId: string;
  stayDeviceId: string;
  deviceToken: string;
  checkInDate: string;
  checkOutDate: string;
}) {
  const copy = COPY[normalizeLang(lang)] || COPY.en;
  const [status, setStatus] = useState<Status>("ready");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const surveyDates = useMemo(() => ({
    firstConfirmedDateKey: checkInDate || null,
    targetDateKey: checkInDate ? addDaysToStayDateKey(checkInDate, 2) || null : null,
  }), [checkInDate]);

  const refreshStatus = useCallback(async () => {
    if (!roomConfirmed || !normalizeRoomNumber(room) || !stayId || !stayDeviceId || !deviceToken || !checkInDate || !checkOutDate) {
      setStatus("unsupported");
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    // Show the compact enable button while the async checks run. On some mobile PWAs,
    // navigator.serviceWorker.ready can be slow or temporarily stuck after reinstall;
    // hiding the whole control during that state makes the prompt disappear.
    setStatus("ready");

    const config = await getGuestPushConfig().catch(() => null);
    if (!config?.configured || !config.publicKey) {
      setStatus("not_configured");
      return;
    }

    const registration = await waitForGuestServiceWorker(2500);
    const subscription = await registration?.pushManager.getSubscription().catch(() => null);
    if (subscription) {
      await saveGuestSubscription({
        hotelSlug,
        room,
        language: String(lang),
        hotelTimezone: timezone,
        firstConfirmedDateKey: surveyDates.firstConfirmedDateKey,
        targetDateKey: surveyDates.targetDateKey,
        checkInDate,
        checkOutDate,
        stayId,
        stayDeviceId,
        deviceToken,
        subscription,
      }).catch((error) => {
        console.error("guest survey push stay sync failed", error);
      });
    }
    setStatus(subscription ? "enabled" : "ready");
  }, [
    checkInDate,
    checkOutDate,
    deviceToken,
    hotelSlug,
    lang,
    room,
    roomConfirmed,
    stayDeviceId,
    stayId,
    surveyDates.firstConfirmedDateKey,
    surveyDates.targetDateKey,
    timezone,
  ]);

  useEffect(() => {
    void refreshStatus().catch((error) => {
      console.error("guest survey push status check failed", error);
      setStatus("error");
    });
  }, [refreshStatus]);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const config = await getGuestPushConfig();
      if (!config.configured || !config.publicKey) {
        setStatus("not_configured");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "ready");
        return;
      }

      const registration = await waitForGuestServiceWorker(5000);
      if (!registration) {
        setStatus("error");
        setMessage(copy.error);
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });

      await saveGuestSubscription({
        hotelSlug,
        room,
        language: String(lang),
        hotelTimezone: timezone,
        firstConfirmedDateKey: surveyDates.firstConfirmedDateKey,
        targetDateKey: surveyDates.targetDateKey,
        checkInDate,
        checkOutDate,
        stayId,
        stayDeviceId,
        deviceToken,
        subscription,
      });

      setStatus("enabled");
      setMessage(copy.enabled);
    } catch (error) {
      console.error("guest survey push enable failed", error);
      setStatus("error");
      setMessage(copy.error);
    } finally {
      setBusy(false);
    }
  }, [busy, checkInDate, checkOutDate, copy.enabled, copy.error, deviceToken, hotelSlug, lang, room, stayDeviceId, stayId, surveyDates.firstConfirmedDateKey, surveyDates.targetDateKey, timezone]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const registration = await waitForGuestServiceWorker(5000);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deleteGuestSubscription({ hotelSlug, room, subscription }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setStatus("ready");
    } catch (error) {
      console.error("guest survey push disable failed", error);
      setStatus("error");
      setMessage(copy.error);
    } finally {
      setBusy(false);
    }
  }, [busy, copy.error, hotelSlug, room]);

  if (!roomConfirmed || !normalizeRoomNumber(room) || !stayId || !stayDeviceId || !deviceToken) return null;

  return (
    <div className="stayhub-premium-push-wrap">
      <div className="stayhub-premium-push-card">
        <div className="stayhub-premium-push-icon" aria-hidden="true">
          <img
            src="/icons/guesthub-premium/notifications.png?v=20260719-final-icons"
            alt=""
            draggable={false}
            decoding="async"
            className="stayhub-action-icon-image stayhub-action-icon-brand"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="stayhub-premium-push-title">{copy.title}</div>
          {copy.text ? <p className="stayhub-premium-push-text">{copy.text}</p> : null}

          {status === "enabled" ? (
            <p className="stayhub-premium-push-state">{message || copy.enabled}</p>
          ) : null}

          {status === "denied" ? <p className="stayhub-premium-push-warning">{copy.denied}</p> : null}
          {status === "unsupported" ? <p className="stayhub-premium-push-warning">{copy.unsupported}</p> : null}
          {status === "not_configured" ? <p className="stayhub-premium-push-warning">{copy.notConfigured}</p> : null}
        </div>

        {status === "ready" || status === "checking" || status === "error" ? (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="stayhub-premium-push-button disabled:opacity-60"
          >
            {busy ? copy.checking : copy.enable}
          </button>
        ) : null}

        {status === "enabled" ? (
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="stayhub-premium-push-secondary disabled:opacity-60"
          >
            {copy.disable}
          </button>
        ) : null}
      </div>
    </div>
  );
}
