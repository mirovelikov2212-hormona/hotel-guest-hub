"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type StaffPushRole = "reception" | "housekeeping" | "maintenance" | "manager";

type Status =
  | "checking"
  | "unsupported"
  | "install_required"
  | "not_configured"
  | "ready"
  | "enabled"
  | "denied"
  | "error";

type PushConfig = {
  ok?: boolean;
  configured?: boolean;
  publicKey?: string;
  error?: string;
};

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

function isStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone,
  );
}

function getRoleTitle(role: StaffPushRole, lang: "bg" | "en" | "de") {
  if (lang === "en") {
    if (role === "reception") return "Reception app";
    if (role === "housekeeping") return "Housekeeping app";
    if (role === "maintenance") return "Maintenance app";
    return "Manager app";
  }

  if (lang === "de") {
    if (role === "reception") return "Rezeptions-App";
    if (role === "housekeeping") return "Housekeeping-App";
    if (role === "maintenance") return "Technik-App";
    return "Manager-App";
  }

  if (role === "reception") return "Рецепция приложение";
  if (role === "housekeeping") return "Камериерки приложение";
  if (role === "maintenance") return "Технически отдел приложение";
  return "Manager приложение";
}

function getCopy(lang: "bg" | "en" | "de", role: StaffPushRole) {
  if (lang === "en") {
    return {
      title: getRoleTitle(role, lang),
      install: "On iPhone: open this page in Safari, tap Share, then Add to Home Screen.",
      installRequired: "On iPhone, install this staff app on the Home Screen before enabling push notifications.",
      enable: "Enable push notifications",
      disable: "Disable notifications",
      test: "Send test notification",
      enabled: "Push notifications are active on this device.",
      ready: "Enable notifications to receive new requests for this department on this device.",
      denied: "Notifications are blocked. Enable them in the phone settings for this app.",
      unsupported: "Push notifications are not supported by this browser or device.",
      notConfigured: "Push notifications are not configured on the server yet.",
      checking: "Checking notification status…",
      error: "Notification setup failed. Please try again.",
      testSent: "Test notification sent.",
    };
  }

  if (lang === "de") {
    return {
      title: getRoleTitle(role, lang),
      install: "Auf dem iPhone: Diese Seite in Safari öffnen, Teilen und dann Zum Home-Bildschirm wählen.",
      installRequired: "Auf dem iPhone muss diese Mitarbeiter-App zuerst auf dem Home-Bildschirm installiert werden.",
      enable: "Push-Mitteilungen aktivieren",
      disable: "Mitteilungen deaktivieren",
      test: "Testmitteilung senden",
      enabled: "Push-Mitteilungen sind auf diesem Gerät aktiv.",
      ready: "Aktivieren Sie Mitteilungen, um neue Anfragen für diese Abteilung zu erhalten.",
      denied: "Mitteilungen sind blockiert. Aktivieren Sie sie in den Telefoneinstellungen für diese App.",
      unsupported: "Push-Mitteilungen werden von diesem Browser oder Gerät nicht unterstützt.",
      notConfigured: "Push-Mitteilungen sind auf dem Server noch nicht eingerichtet.",
      checking: "Mitteilungsstatus wird geprüft…",
      error: "Die Einrichtung ist fehlgeschlagen. Bitte erneut versuchen.",
      testSent: "Testmitteilung wurde gesendet.",
    };
  }

  return {
    title: getRoleTitle(role, lang),
    install: "На iPhone: отворете тази страница в Safari → Споделяне → Добавяне към началния екран.",
    installRequired: "На iPhone първо инсталирайте това Staff приложение на началния екран.",
    enable: "Разреши push известията",
    disable: "Изключи известията",
    test: "Изпрати тестово известие",
    enabled: "Push известията са активни на това устройство.",
    ready: "Разрешете известията, за да получавате новите заявки за този отдел на телефона.",
    denied: "Известията са блокирани. Разрешете ги от настройките на телефона за това приложение.",
    unsupported: "Това устройство или браузър не поддържа push известия.",
    notConfigured: "Push известията още не са настроени на сървъра.",
    checking: "Проверка на известията…",
    error: "Настройването не успя. Опитайте отново.",
    testSent: "Тестовото известие е изпратено.",
  };
}

async function getPushConfig(hotelSlug: string, role: StaffPushRole): Promise<PushConfig> {
  const params = new URLSearchParams({ hotelSlug, role });
  const response = await fetch(
    `/api/staff/push/config?${params.toString()}`,
    { credentials: "include", cache: "no-store" },
  );
  return response.json();
}

async function saveSubscription(
  hotelSlug: string,
  role: StaffPushRole,
  subscription: PushSubscription,
) {
  const response = await fetch("/api/staff/push/subscription", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelSlug, role, subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error("Failed to save subscription");
}

export default function ManagerPwaControls({
  hotelSlug,
  role = "manager",
}: {
  hotelSlug: string;
  role?: StaffPushRole;
}) {
  const { lang } = useStaffUi();
  const copy = useMemo(() => getCopy(lang, role), [lang, role]);
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);

  const inspect = useCallback(async () => {
    if (typeof window === "undefined") return;

    const nextIos = isIosDevice();
    const nextStandalone = isStandaloneMode();
    setIos(nextIos);
    setStandalone(nextStandalone);

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }

    if (nextIos && !nextStandalone) {
      setStatus("install_required");
      return;
    }

    const config = await getPushConfig(hotelSlug, role).catch(() => null);
    if (!config?.ok || !config.configured || !config.publicKey) {
      setStatus("not_configured");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await saveSubscription(hotelSlug, role, subscription).catch(() => undefined);
      setStatus("enabled");
    } else {
      setStatus("ready");
    }
  }, [hotelSlug, role]);

  useEffect(() => {
    void inspect().catch(() => setStatus("error"));
  }, [inspect]);

  const enable = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      if (isIosDevice() && !isStandaloneMode()) {
        setStatus("install_required");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "ready");
        return;
      }

      const config = await getPushConfig(hotelSlug, role);
      if (!config.ok || !config.configured || !config.publicKey) {
        setStatus("not_configured");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });

      await saveSubscription(hotelSlug, role, subscription);
      setStatus("enabled");
    } catch (error) {
      console.error("Staff push enable failed", error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [hotelSlug, role]);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/staff/push/subscription", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelSlug, role, endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("ready");
    } catch (error) {
      console.error("Staff push disable failed", error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [hotelSlug, role]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/push/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, role }),
      });
      if (!response.ok) throw new Error("Test push failed");
      setMessage(copy.testSent);
    } catch (error) {
      console.error("Staff test push failed", error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [copy.testSent, hotelSlug, role]);

  const statusText = status === "checking"
    ? copy.checking
    : status === "unsupported"
      ? copy.unsupported
      : status === "install_required"
        ? copy.installRequired
        : status === "not_configured"
          ? copy.notConfigured
          : status === "enabled"
            ? copy.enabled
            : status === "denied"
              ? copy.denied
              : status === "error"
                ? copy.error
                : copy.ready;

  return (
    <section className="rounded-2xl border border-violet-300/20 bg-violet-300/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/60">
            {copy.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/75" aria-live="polite">
            {statusText}
          </p>
          {ios && !standalone ? (
            <p className="mt-2 text-sm leading-6 text-amber-100/90">{copy.install}</p>
          ) : null}
          {message ? <p className="mt-2 text-sm font-semibold text-emerald-200">{message}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {status === "ready" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void enable()}
              className="rounded-xl border border-emerald-300/30 bg-emerald-300/15 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
            >
              {copy.enable}
            </button>
          ) : null}

          {status === "enabled" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendTest()}
                className="rounded-xl border border-violet-300/30 bg-violet-300/15 px-4 py-2 text-sm font-semibold text-violet-100 disabled:opacity-50"
              >
                {copy.test}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disable()}
                className="rounded-xl border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-50"
              >
                {copy.disable}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
