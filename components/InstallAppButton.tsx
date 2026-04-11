"use client";

import { useEffect, useState } from "react";

type UiLang = "bg" | "en" | "de";

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
    lang === "de" ? "de" : lang === "en" ? "en" : "bg";

  const iosInstallTitle =
    resolvedLang === "de"
      ? "Als App installieren"
      : resolvedLang === "en"
        ? "Install as App"
        : "Инсталирай като App";

  const iosInstallHint =
    resolvedLang === "de"
      ? "Teilen → Zum Home-Bildschirm"
      : resolvedLang === "en"
        ? "Share → Add to Home Screen"
        : "Споделяне → Добавяне към началния екран";

  const androidLabel =
    label ??
    (resolvedLang === "de"
      ? "Als App installieren"
      : resolvedLang === "en"
        ? "Install App"
        : "Инсталирай като App");

  if (isIOS) {
    return (
      <div className="w-full rounded-2xl bg-neutral-900/80 ring-1 ring-white/10 px-4 py-4 text-center text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
        <div className="text-lg font-semibold">{iosInstallTitle}</div>
        <div className="mt-1 text-sm leading-5 text-neutral-300">
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
        className="w-full rounded-2xl bg-neutral-900/80 ring-1 ring-white/10 px-4 py-4 text-center text-lg font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:bg-neutral-900/90 active:scale-[0.99] transition"
      >
        {androidLabel}
      </button>
    );
  }

  return null;
}