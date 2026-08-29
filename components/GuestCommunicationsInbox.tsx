"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { LangKey } from "@/lib/types";

type StoredGuestRoomState = {
  room?: string;
  roomConfirmed?: boolean;
  stayId?: string;
  stayDeviceId?: string;
  deviceToken?: string;
};

type GuestCommunication = {
  id: string;
  category: string;
  title: string;
  body: string;
  displayFrom: string | null;
  displayUntil: string | null;
  sentAt: string | null;
  department?: { name?: string | null; code?: string | null } | null;
};

const COPY: Record<LangKey, {
  label: string;
  title: string;
  empty: string;
  close: string;
  from: string;
  important: string;
}> = {
  bg: { label: "Съобщения", title: "Съобщения от хотела", empty: "Няма нови съобщения.", close: "Затвори", from: "От", important: "Важно" },
  en: { label: "Messages", title: "Hotel messages", empty: "There are no new messages.", close: "Close", from: "From", important: "Important" },
  de: { label: "Mitteilungen", title: "Hotel-Mitteilungen", empty: "Keine neuen Mitteilungen.", close: "Schließen", from: "Von", important: "Wichtig" },
  ro: { label: "Mesaje", title: "Mesaje de la hotel", empty: "Nu există mesaje noi.", close: "Închide", from: "De la", important: "Important" },
  cs: { label: "Zprávy", title: "Zprávy z hotelu", empty: "Žádné nové zprávy.", close: "Zavřít", from: "Od", important: "Důležité" },
  ru: { label: "Сообщения", title: "Сообщения от отеля", empty: "Новых сообщений нет.", close: "Закрыть", from: "От", important: "Важно" },
};

function normalizeLanguage(value: unknown): LangKey {
  const key = String(value || "").trim().toLowerCase();
  return key === "bg" || key === "en" || key === "de" || key === "ro" || key === "cs" || key === "ru"
    ? key
    : "en";
}

function readStay(hotelSlug: string): StoredGuestRoomState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`guesthub_room_state:${String(hotelSlug || "default").trim().toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGuestRoomState;
    if (!parsed?.roomConfirmed || !parsed.stayId || !parsed.stayDeviceId || !parsed.deviceToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readLanguage(defaultLanguage: LangKey): LangKey {
  if (typeof window === "undefined") return defaultLanguage;
  try {
    return normalizeLanguage(window.localStorage.getItem("stayhub_guest_language") || defaultLanguage);
  } catch {
    return defaultLanguage;
  }
}

function readSeen(hotelSlug: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(`stayhub:guest-communications-seen:v1:${hotelSlug}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 100) : []);
  } catch {
    return new Set<string>();
  }
}

function writeSeen(hotelSlug: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `stayhub:guest-communications-seen:v1:${hotelSlug}`,
      JSON.stringify(Array.from(new Set(ids)).slice(0, 100)),
    );
  } catch { }
}

function formatTimestamp(value: string | null, language: LangKey) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locales: Record<LangKey, string> = {
    bg: "bg-BG", en: "en-GB", de: "de-DE", ro: "ro-RO", cs: "cs-CZ", ru: "ru-RU",
  };
  return new Intl.DateTimeFormat(locales[language], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function GuestCommunicationsInbox({
  hotelSlug,
  defaultLanguage,
  brandColor,
}: {
  hotelSlug: string;
  defaultLanguage: LangKey;
  brandColor: string;
}) {
  const [stay, setStay] = useState<StoredGuestRoomState | null>(null);
  const [language, setLanguage] = useState<LangKey>(defaultLanguage);
  const [messages, setMessages] = useState<GuestCommunication[]>([]);
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const copy = COPY[language] || COPY.en;

  const refreshIdentity = useCallback(() => {
    setStay(readStay(hotelSlug));
    setLanguage(readLanguage(defaultLanguage));
    setSeenIds(readSeen(hotelSlug));
  }, [defaultLanguage, hotelSlug]);

  const loadMessages = useCallback(async (identity: StoredGuestRoomState | null, lang: LangKey) => {
    if (!identity?.stayId || !identity.stayDeviceId || !identity.deviceToken) {
      setMessages([]);
      return;
    }
    try {
      const response = await fetch("/api/guest/communications", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          stayId: identity.stayId,
          stayDeviceId: identity.stayDeviceId,
          deviceToken: identity.deviceToken,
          language: lang,
        }),
      });
      if (!response.ok) return;
      const payload = await response.json() as { messages?: GuestCommunication[] };
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (error) {
      console.warn("Guest communications inbox refresh failed", error);
    }
  }, [hotelSlug]);

  useEffect(() => {
    refreshIdentity();
    const identityTimer = window.setInterval(refreshIdentity, 5_000);
    const onFocus = () => refreshIdentity();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(identityTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshIdentity]);

  useEffect(() => {
    void loadMessages(stay, language);
    if (!stay) return;
    const timer = window.setInterval(() => void loadMessages(readStay(hotelSlug), readLanguage(defaultLanguage)), 60_000);
    return () => window.clearInterval(timer);
  }, [defaultLanguage, hotelSlug, language, loadMessages, stay]);

  const unreadCount = useMemo(
    () => messages.filter((message) => !seenIds.has(message.id)).length,
    [messages, seenIds],
  );

  function openInbox() {
    setOpen(true);
    const nextSeen = new Set(seenIds);
    for (const message of messages) nextSeen.add(message.id);
    setSeenIds(nextSeen);
    writeSeen(hotelSlug, Array.from(nextSeen));
  }

  if (!stay) return null;

  return (
    <div className="fixed bottom-5 right-4 z-[80] sm:bottom-6 sm:right-6" style={{ "--guest-message-brand": brandColor } as React.CSSProperties}>
      {open ? (
        <section className="mb-3 flex max-h-[min(70vh,36rem)] w-[min(calc(100vw-2rem),24rem)] flex-col overflow-hidden rounded-3xl border border-black/10 bg-white text-[#163033] shadow-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] opacity-55">StayHub</p>
              <h2 className="mt-1 text-lg font-medium">{copy.title}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-black/5 text-xl" aria-label={copy.close}>×</button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4">
            {messages.length ? messages.map((message) => (
              <article key={message.id} className={`rounded-2xl border p-4 ${message.category === "emergency" ? "border-red-300 bg-red-50" : "border-black/10 bg-[#f7faf9]"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {message.category === "emergency" ? <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-700">{copy.important}</span> : null}
                  {message.department?.name ? <span className="opacity-55">{copy.from}: {message.department.name}</span> : null}
                  <span className="ml-auto opacity-45">{formatTimestamp(message.sentAt || message.displayFrom, language)}</span>
                </div>
                <h3 className="mt-3 font-medium">{message.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-75">{message.body}</p>
              </article>
            )) : <div className="rounded-2xl bg-black/5 p-5 text-sm opacity-65">{copy.empty}</div>}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={open ? () => setOpen(false) : openInbox}
        className="relative ml-auto flex min-h-12 items-center gap-2 rounded-2xl border border-white/70 px-4 py-3 text-sm font-medium shadow-xl"
        style={{ background: "var(--guest-message-brand)", color: "#102027" }}
        aria-expanded={open}
      >
        <span aria-hidden="true">✉</span>
        <span>{copy.label}</span>
        {unreadCount > 0 ? (
          <span className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
        ) : null}
      </button>
    </div>
  );
}
