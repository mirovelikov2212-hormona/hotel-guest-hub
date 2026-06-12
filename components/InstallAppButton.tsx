"use client";

import { useEffect, useState } from "react";

type UiLang = "bg" | "en" | "de" | "ro" | "cs" | "ru";

export default function InstallAppButton({
  label,
  lang = "bg",
}: {
  label?: string;
  lang?: string;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    setIsIOS(ios);
    setIsStandalone(standalone);

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
  };

  if (isStandalone) return null;

  const resolvedLang: UiLang =
    lang === "de" || lang === "en" || lang === "ro" || lang === "cs" || lang === "ru"
      ? lang
      : "bg";

  const installCopy: Record<UiLang, { title: string; hint: string; button: string }> = {
    bg: {
      title: "Инсталирай като App",
      hint: "Споделяне → Добавяне към началния екран",
      button: "Инсталирай като App",
    },
    en: {
      title: "Install as App",
      hint: "Share → Add to Home Screen",
      button: "Install App",
    },
    de: {
      title: "Als App installieren",
      hint: "Teilen → Zum Home-Bildschirm",
      button: "Als App installieren",
    },
    ro: {
      title: "Instalează ca aplicație",
      hint: "Partajare → Adăugați pe ecranul principal",
      button: "Instalează aplicația",
    },
    cs: {
      title: "Nainstalovat jako aplikaci",
      hint: "Sdílet → Přidat na plochu",
      button: "Nainstalovat aplikaci",
    },
    ru: {
      title: "Установить как приложение",
      hint: "Поделиться → На экран «Домой»",
      button: "Установить приложение",
    },
  };

  const iosInstallTitle = installCopy[resolvedLang].title;
  const iosInstallHint = installCopy[resolvedLang].hint;
  const androidLabel = label ?? installCopy[resolvedLang].button;

  if (isIOS) {
    return (
      <div className="w-full rounded-2xl px-4 py-4 text-center shadow-[0_8px_30px_rgba(0,0,0,0.25)] stayhub-card">
        <div className="text-lg font-semibold">{iosInstallTitle}</div>
        <div className="mt-1 text-sm leading-5 stayhub-muted-text">
          {iosInstallHint}
        </div>
      </div>
    );
  }

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className="w-full rounded-2xl px-4 py-4 text-center text-lg font-semibold shadow-[0_8px_30px_rgba(0,0,0,0.25)] stayhub-card hover:opacity-95 active:scale-[0.99] transition"
      >
        {androidLabel}
      </button>
    );
  }

  return null;
}