"use client";

import { useEffect, useState } from "react";

export default function InstallAppButton({
  label = "Install App",
}: {
  label?: string;
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

  // iPhone / iPad
  if (isIOS) {
    return (
      <div className="w-full rounded-2xl bg-neutral-900/80 ring-1 ring-white/10 px-4 py-4 text-center text-sm leading-6 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
        <span className="font-semibold">iPhone:</span> натисни{" "}
        <span className="font-semibold">Share</span> →{" "}
        <span className="font-semibold">Add to Home Screen</span>, за да го
        ползваш като app.
      </div>
    );
  }

  // Android / Chrome etc.
  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className="w-full rounded-2xl bg-neutral-900/80 ring-1 ring-white/10 px-4 py-4 text-center text-lg font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:bg-neutral-900/90 active:scale-[0.99] transition"
      >
        {label}
      </button>
    );
  }

  return null;
}