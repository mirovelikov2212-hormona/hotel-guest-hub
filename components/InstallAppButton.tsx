"use client";

import { useEffect, useState } from "react";

type UiLang = "bg" | "en" | "de" | "ro" | "cs" | "ru";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function InstallDeviceIcon() {
  return (
    <span className="stayhub-install-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="7" y="2.8" width="10" height="18.4" rx="2.1" />
        <path d="M10.7 5.4h2.6" />
        <path d="M12 8.2v7.1" />
        <path d="m9.6 12.9 2.4 2.4 2.4-2.4" />
        <path d="M10.2 18.2h3.6" />
      </svg>
    </span>
  );
}

export default function InstallAppButton({
  label,
  lang = "bg",
}: {
  label?: string;
  lang?: string;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS] = useState(() =>
    typeof window !== "undefined" && /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
  );
  const [isStandalone] = useState(() =>
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };


  const resolvedLang: UiLang =
    lang === "de" || lang === "en" || lang === "ro" || lang === "cs" || lang === "ru"
      ? lang
      : "bg";

  const installCopy: Record<UiLang, { title: string; iosHint: string }> = {
    bg: {
      title: "Изтегли приложението",
      iosHint: "Споделяне → Добавяне към началния екран",
    },
    en: {
      title: "Download the app",
      iosHint: "Share → Add to Home Screen",
    },
    de: {
      title: "App herunterladen",
      iosHint: "Teilen → Zum Home-Bildschirm",
    },
    ro: {
      title: "Descarcă aplicația",
      iosHint: "Partajare → Adăugați pe ecranul principal",
    },
    cs: {
      title: "Stáhnout aplikaci",
      iosHint: "Sdílet → Přidat na plochu",
    },
    ru: {
      title: "Скачать приложение",
      iosHint: "Поделиться → На экран «Домой»",
    },
  };

  const copy = installCopy[resolvedLang];
  const title = label || copy.title;
  const content = (
    <>
      <InstallDeviceIcon />
      <span className="stayhub-install-copy">
        <span className="stayhub-install-title">{title}</span>
        {isIOS && !isStandalone ? <span className="stayhub-install-hint">{copy.iosHint}</span> : null}
      </span>
    </>
  );

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className="stayhub-install-card stayhub-install-card-button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="stayhub-install-card" role="note">
      {content}
    </div>
  );
}
