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
  },
} as const;

function formatTime(value: string | null | undefined, lang: "bg" | "en" | "de") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
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
  const selectedStay = stays.find((stay) => stay.id === stayId) || null;
  const conversation = useMemo(() => (payload?.messages || []).filter((message) => message.stayId === stayId).slice().reverse(), [payload?.messages, stayId]);

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

  return (
    <div className="mb-5">
      <StaffCollapsiblePanel title={copy.title} summary={copy.summary} badge={selectedStay ? <span className="rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1 text-xs font-semibold">{copy.room} {selectedStay.room_number}</span> : null}>
        {error ? <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-700">{error}</div> : null}
        {payload && !payload.deliveryEnabled ? <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-800">{copy.disabled}</div> : null}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3 rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface)] p-4">
            <label className="text-sm"><span className="mb-1 block text-[var(--staff-muted)]">{copy.room}</span>
              <select value={stayId} onChange={(event) => setStayId(event.target.value)} className="w-full rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5">
                <option value="">{copy.choose}</option>
                {stays.map((stay) => <option key={stay.id} value={stay.id}>{copy.room} {stay.room_number}</option>)}
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
              {conversation.length ? conversation.map((message) => (
                <article key={message.id} className={`rounded-2xl border border-[var(--staff-border)] p-3 ${message.senderType === "guest" ? "ml-5 bg-[var(--staff-surface)]" : "mr-5 bg-[var(--staff-surface)]"}`}>
                  <div className="flex items-center gap-2 text-xs text-[var(--staff-muted)]"><span className="font-semibold">{message.senderType === "guest" ? copy.guest : copy.hotel}</span><span className="ml-auto">{formatTime(message.sentAt || message.createdAt, uiLang)}</span></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                </article>
              )) : <p className="text-sm text-[var(--staff-muted)]">{copy.noHistory}</p>}
            </div>
          </div>
        </div>
      </StaffCollapsiblePanel>
    </div>
  );
}
