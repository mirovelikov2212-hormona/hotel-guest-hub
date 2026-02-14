"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // iOS
  // @ts-ignore
  const iosStandalone = window.navigator.standalone === true;
  // others
  const mql = window.matchMedia?.("(display-mode: standalone)").matches;
  return Boolean(iosStandalone || mql);
}

export default function InstallAppButton({ label = "Инсталирай като App" }: { label?: string }) {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // iOS няма beforeinstallprompt → показваме hint
    if (isIOS()) setShowIOSHint(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onInstall = async () => {
    if (!bip) return;
    await bip.prompt();
    await bip.userChoice.catch(() => null);
    setBip(null);
  };

  if (isStandalone()) return null;

  return (
    <div className="mt-3 space-y-2">
      {bip ? (
        <button
          type="button"
          onClick={onInstall}
          className="w-full rounded-xl px-3 py-3 text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 transition"
        >
          {label}
        </button>
      ) : null}

      {showIOSHint ? (
        <div className="rounded-xl bg-[#9B86BD]/10 ring-1 ring-[#9B86BD]/20 p-3 text-xs text-white/90">
          iPhone: натисни <b>Share</b> → <b>Add to Home Screen</b>, за да го ползваш като app.
        </div>
      ) : null}
    </div>
  );
}
