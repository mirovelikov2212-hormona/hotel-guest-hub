"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LangKey } from "@/lib/types";

const SURVEY_VERSION = "day3-v1";
const SURVEY_STORAGE_PREFIX = "stayhub_day3_guest_survey";

type Status =
  | "checking"
  | "unsupported"
  | "not_configured"
  | "ready"
  | "enabled"
  | "denied"
  | "error";

type StoredSurveyState = {
  firstConfirmedAt?: string;
  firstConfirmedDateKey?: string;
  submittedAt?: string;
  dismissedAt?: string;
  lastShownAt?: string;
};

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
    title: "Включете известията",
    text: "Получавайте важна информация по време на престоя си.",
    enable: "Включете известията",
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
    title: "Enable notifications",
    text: "Receive important information during your stay.",
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
    title: "Mitteilungen aktivieren",
    text: "Erhalten Sie wichtige Informationen während Ihres Aufenthalts.",
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
    title: "Activează notificările",
    text: "Primiți informații importante în timpul sejurului.",
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
    title: "Povolit oznámení",
    text: "Dostávejte důležité informace během pobytu.",
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
    title: "Разрешить уведомления",
    text: "Получайте важную информацию во время проживания.",
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


function NotificationBellIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 9.5a6 6 0 1 0-12 0c0 7-2.5 7.5-2.5 7.5h17S18 16.5 18 9.5Z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function getSurveyStorageKey(hotelSlug: string, room: string) {
  const hotel = String(hotelSlug || "default").trim().toLowerCase() || "default";
  const safeRoom = normalizeRoomNumber(room) || "unknown";
  return `${SURVEY_STORAGE_PREFIX}:${SURVEY_VERSION}:${hotel}:${safeRoom}`;
}

function readStoredSurveyState(key: string): StoredSurveyState {
  if (typeof window === "undefined" || !key) return {};

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSurveyState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredSurveyState(key: string, state: StoredSurveyState) {
  if (typeof window === "undefined" || !key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error("write guest survey push state failed", error);
  }
}

function getHotelDateKey(timezone: string) {
  const safeTimezone = String(timezone || "Europe/Sofia").trim() || "Europe/Sofia";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function isIosDevice() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
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
}: {
  hotelSlug: string;
  room: string;
  roomConfirmed: boolean;
  lang: LangKey;
  timezone: string;
}) {
  const copy = COPY[normalizeLang(lang)] || COPY.en;
  const [status, setStatus] = useState<Status>("ready");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);
  const storageKey = useMemo(() => getSurveyStorageKey(hotelSlug, room), [hotelSlug, room]);

  const surveyDates = useMemo(() => {
    if (typeof window === "undefined" || !storageKey) {
      return { firstConfirmedDateKey: null as string | null, targetDateKey: null as string | null };
    }

    const existing = readStoredSurveyState(storageKey);
    const firstConfirmedDateKey = existing.firstConfirmedDateKey || getHotelDateKey(timezone);
    if (!existing.firstConfirmedDateKey) {
      writeStoredSurveyState(storageKey, {
        ...existing,
        firstConfirmedAt: existing.firstConfirmedAt || new Date().toISOString(),
        firstConfirmedDateKey,
      });
    }

    return {
      firstConfirmedDateKey,
      targetDateKey: addDaysToDateKey(firstConfirmedDateKey, 2) || null,
    };
  }, [storageKey, timezone]);

  const refreshStatus = useCallback(async () => {
    if (!roomConfirmed || !normalizeRoomNumber(room)) {
      setStatus("unsupported");
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    setIos(isIosDevice());

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
    setStatus(subscription ? "enabled" : "ready");
  }, [room, roomConfirmed]);

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
  }, [busy, copy.enabled, copy.error, hotelSlug, lang, room, surveyDates.firstConfirmedDateKey, surveyDates.targetDateKey, timezone]);

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

  if (!roomConfirmed || !normalizeRoomNumber(room)) return null;

  return (
    <div className="mt-3 px-4">
      <div className="stayhub-modern-card rounded-2xl border border-[#43baad]/35 bg-white px-4 py-3 text-[#202627] shadow-sm">
        <div className="flex items-center gap-3">
          <span className="stayhub-notification-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#43baad]/15 text-[#168176]">
            <NotificationBellIcon className="h-6 w-6" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[#0f3f3d]">{copy.title}</div>
            {copy.text ? <div className="mt-1 text-xs leading-5 text-[#4b5b5c]">{copy.text}</div> : null}
            {message && status !== "enabled" ? <div className="mt-1 text-xs font-semibold text-rose-700">{message}</div> : null}
          </div>

          {status === "ready" || status === "checking" || status === "error" ? (
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy}
              className="shrink-0 rounded-xl bg-[#43baad] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? copy.checking : copy.enable}
            </button>
          ) : null}

          {status === "enabled" ? (
            <button
              type="button"
              onClick={() => void disable()}
              disabled={busy}
              className="shrink-0 rounded-xl border border-[#d7dcde] bg-white px-3 py-2 text-xs font-bold text-[#202627] disabled:opacity-60"
              title={message || copy.enabled}
            >
              {copy.disable}
            </button>
          ) : null}
        </div>

        {status === "enabled" ? <p className="mt-2 text-xs font-semibold text-[#277b73]">{message || copy.enabled}</p> : null}
        {status === "denied" ? <p className="mt-2 text-xs font-semibold text-rose-700">{copy.denied}</p> : null}
        {status === "unsupported" ? <p className="mt-2 text-xs font-semibold text-amber-700">{copy.unsupported}</p> : null}
        {status === "not_configured" ? <p className="mt-2 text-xs font-semibold text-amber-700">{copy.notConfigured}</p> : null}
      </div>
    </div>
  );
}
