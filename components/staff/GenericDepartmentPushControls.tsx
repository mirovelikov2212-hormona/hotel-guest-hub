"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

type PushStatus = "checking" | "ready" | "enabled" | "unsupported" | "denied" | "not_configured" | "error";

export default function GenericDepartmentPushControls({
  hotelSlug,
  role,
}: {
  hotelSlug: string;
  role: string;
}) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function inspect() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const params = new URLSearchParams({ hotelSlug, role });
      const config = await fetch(`/api/staff/push/config?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      }).then((res) => res.json()).catch(() => null);
      if (!config?.ok || !config?.configured || !config?.publicKey) {
        if (!cancelled) setStatus("not_configured");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(subscription ? "enabled" : "ready");
    }
    void inspect().catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; };
  }, [hotelSlug, role]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "ready");
        return;
      }
      const params = new URLSearchParams({ hotelSlug, role });
      const config = await fetch(`/api/staff/push/config?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      }).then((res) => res.json());
      if (!config?.ok || !config?.configured || !config?.publicKey) {
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
      const response = await fetch("/api/staff/push/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, role, subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error("subscription save failed");
      setStatus("enabled");
    } catch (error) {
      console.error("generic department push enable failed", error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  const label = status === "checking"
    ? "Checking push notifications…"
    : status === "enabled"
      ? "Push notifications are active on this device."
      : status === "ready"
        ? "Push notifications are available for this department."
        : status === "denied"
          ? "Push notifications are blocked in the browser settings."
          : status === "not_configured"
            ? "Push notifications are not configured on the server."
            : status === "unsupported"
              ? "Push notifications are not supported on this device."
              : "Push notification setup failed.";

  return (
    <section className="rounded-2xl border border-violet-300/20 bg-violet-300/10 p-4">
      <p className="text-sm text-white/75">{label}</p>
      {status === "ready" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
        >
          {busy ? "Enabling…" : "Enable push notifications"}
        </button>
      ) : null}
    </section>
  );
}
