"use client";

import { useEffect } from "react";

import {
  isStandaloneDisplayMode,
  markGuestAppInstalled,
  storeGuestInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-prompt";
import { trackHubEvent } from "@/lib/trackHubEvent";

const PWA_SESSION_EVENT_PREFIX = "gostaya_pwa_event";

function isGuestHubPath() {
  if (typeof window === "undefined") return false;
  return /^\/h\/[^/?#]+/i.test(window.location.pathname);
}

function trackGuestPwaEventOnce(eventName: string, metadata?: Record<string, unknown>) {
  if (!isGuestHubPath()) return;

  const storageKey = `${PWA_SESSION_EVENT_PREFIX}:${eventName}`;
  try {
    if (window.sessionStorage.getItem(storageKey) === "1") return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {}

  void trackHubEvent({
    eventName,
    eventCategory: "pwa_install",
    section: "install_app",
    metadata,
  });
}

export default function PWARegister() {
  useEffect(() => {
    const STAYHUB_BROWSER_THEME_COLOR = "#F5F5F5";

    try {
      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.content = STAYHUB_BROWSER_THEME_COLOR;
      document.documentElement.style.backgroundColor = STAYHUB_BROWSER_THEME_COLOR;
      document.body.style.backgroundColor = STAYHUB_BROWSER_THEME_COLOR;
    } catch {}

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      storeGuestInstallPrompt(event as BeforeInstallPromptEvent);
      trackGuestPwaEventOnce("pwa_install_available");
    };

    const handleAppInstalled = () => {
      markGuestAppInstalled();
      trackGuestPwaEventOnce("pwa_app_installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (isStandaloneDisplayMode()) {
      trackGuestPwaEventOnce("pwa_standalone_opened");
    }

    // Never register the service worker in development / localhost.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update().catch(() => undefined);
      } catch {}
    };

    // Hydration can finish after window.load on fast/cached mobile visits.
    // Register immediately in that case instead of waiting for an event that already fired.
    const shouldRegisterNow = document.readyState === "complete";
    if (shouldRegisterNow) {
      void registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
