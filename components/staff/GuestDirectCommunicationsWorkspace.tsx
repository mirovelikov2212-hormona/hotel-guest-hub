"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StaffCollapsiblePanel from "@/components/staff/StaffCollapsiblePanel";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type StayRow = { id: string; room_number: string; effective_check_out_at: string; last_seen_at: string };
type MessageRow = { id: string; stayId: string; stayDeviceId: string | null; senderType: string; title: string; body: string; createdAt: string; sentAt: string | null };
type Payload = { ok?: boolean; deliveryEnabled?: boolean; stays?: StayRow[]; messages?: MessageRow[] };

const COPY = {
  bg: {
    title: "Директна комуникация по стаи",
    summary: "Рецепция ↔ конкретен активен гост. Съобщенията са изолирани по хотел и престой.",
    room: "Стая",
    choose: "Изберете активна стая",
    message: "Съобщение",
    placeholder: "Напишете съобщение до госта…",
    send: "Изпрати до госта",
    sending: "Изпращане…",
    history: "Разговор",
    noHistory: "Все още няма директни съобщения за тази стая.",
    hotel: "Рецепция",
    guest: "Гост",
    disabled: "Директното изпращане още не е активирано за този хотел.",
    error: "Директната комуникация временно не е достъпна.",
    new: "НОВО",
    newReplies: "Нови",
    read: "Прочетено",
  },
  en: {
    title: "Direct room communication",
    summary: "Reception ↔ one active guest. Messages are isolated by hotel and stay.",
    room: "Room",
    choose: "Choose an active room",
    message: "Message",
    placeholder: "Write a message to the guest…",
    send: "Send to guest",
    sending: "Sending…",
    history: "Conversation",
    noHistory: "No direct messages for this room yet.",
    hotel: "Reception",
    guest: "Guest",
    disabled: "Direct delivery is not enabled for this hotel yet.",
    error: "Direct communication is temporarily unavailable.",
    new: "NEW",
    newReplies: "New",
    read: "Mark read",
  },
  de: {
    title: "Direkte Zimmerkommunikation",
    summary: "Rezeption ↔ ein aktiver Gast. Nachrichten sind nach Hotel und Aufenthalt isoliert.",
    room: "Zimmer",
    choose: "Aktives Zimmer auswählen",
    message: "Nachricht",
    placeholder: "Nachricht an den Gast schreiben…",
    send: "An Gast senden",
    sending: "Wird gesendet…",
    history: "Unterhaltung",
    noHistory: "Noch keine direkten Nachrichten für dieses Zimmer.",
    hotel: "Rezeption",
    guest: "Gast",
    disabled: "Die direkte Zustellung ist für dieses Hotel noch nicht aktiviert.",
    error: "Die direkte Kommunikation ist vorübergehend nicht verfügbar.",
    new: "NEU",
    newReplies: "Neu",
    read: "Gelesen",
  },
} as const;

function formatTime(value: string | null | undefined, lang: "bg" | "en" | "de") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function unreadStorageKey(hotelSlug: string, role: string) {
  return `stayhub:staff-direct-seen:v1:${String(hotelSlug || "default").trim().toLowerCase()}:${String(role || "reception").trim().toLowerCase()}`;
}

function readSeenGuestMessages(hotelSlug: string, role: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(unreadStorageKey(hotelSlug, role));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(-500) : []);
  } catch {
    return new Set<string>();
  }
}

function writeSeenGuestMessages(hotelSlug: string, role: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(unreadStorageKey(hotelSlug, role), JSON.stringify(Array.from(ids).slice(-500)));
  } catch {
    // Unread indicators are best-effort local UI state and must never block staff operations.
  }
}

export default function GuestDirectCommunicationsWorkspace({ hotelSlug, role }: { hotelSlug: string; role: string }) {
  const { lang } = useStaffUi();
  const uiLang: "bg" | "en" | "de" = lang === "de" ? "de" : lang === "en" ? "en" : "bg";
  const copy = COPY[uiLang];
  const [payload, setPayload] = useState<Payload | null>(null);
  const [stayId, setStayId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seenGuestMessageIds, setSeenGuestMessageIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSeenGuestMessageIds(readSeenGuestMessages(hotelSlug, role));
  }, [hotelSlug, role]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ hotelSlug, role, language: uiLang, _: String(Date.now()) });
      const response = await fetch(`/api/staff/guest-direct-communications?${params.toString()}`, { credentials: "include", cache: "no-store" });
      if (response.status === 401 || response.status === 403) { setPayload(null); return; }
      if (!response.ok) throw new Error(`direct communications ${response.status}`);
      const next = await response.json() as Payload;
      setPayload(next);
      setError("");
      if (!stayId && next.stays?.length) setStayId(next.stays[0].id);
      if (stayId && next.stays && !next.stays.some((stay) => stay.id === stayId)) setStayId(next.stays[0]?.id || "");
    } catch (loadError) {
      console.error("Guest direct communications workspace load failed", loadError);
      setError(copy.error);
    }
  }, [copy.error, hotelSlug, role, stayId, uiLang]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const stays = payload?.stays || [];
  const messages = payload?.messages || [];
  const selectedStay = stays.find((stay) => stay.id === stayId) || null;
  const conversation = useMemo(() => messages.filter((message) => message.stayId === stayId).slice().reverse(), [messages, stayId]);
  const unreadGuestMessages = useMemo(
    () => messages.filter((message) => message.senderType === "guest" && !seenGuestMessageIds.has(message.id)),
    [messages, seenGuestMessageIds],
  );
  const unreadByStay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of unreadGuestMessages) counts.set(message.stayId, (counts.get(message.stayId) || 0) + 1);
    return counts;
  }, [unreadGuestMessages]);

  const markGuestMessageRead = useCallback((messageId: string) => {
    setSeenGuestMessageIds((current) => {
      if (current.has(messageId)) return current;
      const next = new Set(current);
      next.add(messageId);
      writeSeenGuestMessages(hotelSlug, role, next);
      return next;
    });
  }, [hotelSlug, role]);

  async function send() {
    if (!stayId || !body.trim() || busy || !payload?.deliveryEnabled) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/guest-direct-communications", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, role, stayId, body: body.trim() }),
      });
      if (!response.ok) throw new Error(`direct send ${response.status}`);
      setBody("");
      await load();
    } catch (sendError) {
      console.error("Guest direct communications send failed", sendError);
      setError(copy.error);
    } finally { setBusy(false); }
  }

  const headerBadge = (
    <span className="flex flex-wrap items-center gap-2">
      {selectedStay ? <span className="rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1 text-xs font-semibold">{copy.room} {selectedStay.room_number}</span> : null}
      {unreadGuestMessages.length ? <span className="rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-700">{copy.newReplies}: {unreadGuestMessages.length}</span> : null}
    </span>
  );

  return (
    <div className="mb-5">
      <StaffCollapsiblePanel title={copy.title} summary={copy.summary} badge={headerBadge}>
        {error ? <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-700">{error}</div> : null}
        {payload && !payload.deliveryEnabled ? <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-800">{copy.disabled}</div> : null}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3 rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface)] p-4">
            <label className="text-sm"><span className="mb-1 block text-[var(--staff-muted)]">{copy.room}</span>
              <select value={stayId} onChange={(event) => setStayId(event.target.value)} className="w-full rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5">
                <option value="">{copy.choose}</option>
                {stays.map((stay) => {
                  const unread = unreadByStay.get(stay.id) || 0;
                  return <option key={stay.id} value={stay.id}>{copy.room} {stay.room_number}{unread ? ` • ${copy.newReplies}: ${unread}` : ""}</option>;
                })}
              </select>
            </label>
            <label className="text-sm"><span className="mb-1 block text-[var(--staff-muted)]">{copy.message}</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={5} placeholder={copy.placeholder} className="w-full resize-y rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5 outline-none" />
            </label>
            <button type="button" onClick={() => void send()} disabled={!stayId || !body.trim() || busy || !payload?.deliveryEnabled} className="w-full rounded-xl bg-[var(--staff-brand-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--staff-on-brand)] disabled:opacity-45">{busy ? copy.sending : copy.send}</button>
          </div>
          <div className="rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-4">
            <h3 className="font-semibold">{copy.history}</h3>
            <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {conversation.length ? conversation.map((message) => {
                const unreadGuestReply = message.senderType === "guest" && !seenGuestMessageIds.has(message.id);
                return (
                  <article key={message.id} className={`rounded-2xl border p-3 ${unreadGuestReply ? "ml-5 border-rose-400/50 bg-rose-50" : message.senderType === "guest" ? "ml-5 border-[var(--staff-border)] bg-[var(--staff-surface)]" : "mr-5 border-[var(--staff-border)] bg-[var(--staff-surface)]"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--staff-muted)]">
                      <span className="font-semibold">{message.senderType === "guest" ? copy.guest : copy.hotel}</span>
                      {unreadGuestReply ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">{copy.new}</span> : null}
                      <span className="ml-auto">{formatTime(message.sentAt || message.createdAt, uiLang)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                    {unreadGuestReply ? <button type="button" onClick={() => markGuestMessageRead(message.id)} className="mt-3 rounded-lg border border-rose-400/30 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700">{copy.read}</button> : null}
                  </article>
                );
              }) : <p className="text-sm text-[var(--staff-muted)]">{copy.noHistory}</p>}
            </div>
          </div>
        </div>
      </StaffCollapsiblePanel>
    </div>
  );
}
