"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import type { StaffRequest } from "@/lib/staff/types";

type ThreadMessage = {
  id: string;
  requestId: string;
  senderType: "staff" | "guest" | "system" | "ai";
  actorRole: string;
  title: string;
  body: string;
  translationStatus: string;
  sentAt: string;
  createdAt: string;
};

type ThreadPayload = {
  ok?: boolean;
  canReply?: boolean;
  request?: {
    conversationState?: "none" | "waiting_for_guest" | "waiting_for_staff";
    conversationUpdatedAt?: string | null;
  };
  messages?: ThreadMessage[];
  error?: string;
};

type StaffConversationCopy = {
  open: string;
  waitingGuest: string;
  guestReplied: string;
  title: string;
  empty: string;
  placeholder: string;
  send: string;
  sending: string;
  close: string;
  retry: string;
  hotel: string;
  guest: string;
  readOnly: string;
};

const COPY: Record<"bg" | "en" | "de", StaffConversationCopy> = {
  bg: {
    open: "Пиши на госта",
    waitingGuest: "Чака отговор от госта",
    guestReplied: "Нов отговор от госта",
    title: "Разговор по заявката",
    empty: "Все още няма съобщения по тази заявка.",
    placeholder: "Напиши уточнение към госта…",
    send: "Изпрати",
    sending: "Изпращане…",
    close: "Затвори",
    retry: "Опитай отново",
    hotel: "Хотел",
    guest: "Гост",
    readOnly: "Разговорът е само за преглед, защото заявката вече не приема нови съобщения.",
  },
  en: {
    open: "Message guest",
    waitingGuest: "Waiting for guest",
    guestReplied: "New guest reply",
    title: "Request conversation",
    empty: "There are no messages for this request yet.",
    placeholder: "Write a clarification for the guest…",
    send: "Send",
    sending: "Sending…",
    close: "Close",
    retry: "Try again",
    hotel: "Hotel",
    guest: "Guest",
    readOnly: "This conversation is read-only because the request no longer accepts new messages.",
  },
  de: {
    open: "Gast anschreiben",
    waitingGuest: "Wartet auf Gast",
    guestReplied: "Neue Gastantwort",
    title: "Anfrage-Unterhaltung",
    empty: "Zu dieser Anfrage gibt es noch keine Nachrichten.",
    placeholder: "Rückfrage an den Gast schreiben…",
    send: "Senden",
    sending: "Wird gesendet…",
    close: "Schließen",
    retry: "Erneut versuchen",
    hotel: "Hotel",
    guest: "Gast",
    readOnly: "Diese Unterhaltung ist schreibgeschützt, da die Anfrage keine neuen Nachrichten mehr annimmt.",
  },
};

function roleFromPath(pathname: string | null) {
  const role = String(pathname?.split("/").filter(Boolean)[2] || "").trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,62}$/.test(role) && role !== "pin" ? role : "";
}

function formatTime(value: string, language: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : language === "bg" ? "bg-BG" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function StaffRequestConversationPanel({ request }: { request: StaffRequest }) {
  const { lang } = useStaffUi();
  const { hotelSlug } = useStaffStore();
  const pathname = usePathname();
  const role = useMemo(() => roleFromPath(pathname), [pathname]);
  const copy = COPY[lang] || COPY.en;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [canReply, setCanReply] = useState(request.status !== "completed");
  const [draft, setDraft] = useState("");
  const [localState, setLocalState] = useState(request.conversationState || "none");

  useEffect(() => {
    setLocalState(request.conversationState || "none");
  }, [request.conversationState, request.conversationUpdatedAt]);

  const loadThread = useCallback(async () => {
    if (!hotelSlug || !role) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        hotelSlug,
        role,
        requestId: request.id,
        language: lang,
        _: String(Date.now()),
      });
      const response = await fetch(`/api/staff/request-conversations?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const payload = await response.json().catch(() => ({})) as ThreadPayload;
      if (!response.ok) throw new Error(payload.error || `request_conversation_${response.status}`);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setCanReply(Boolean(payload.canReply));
      if (payload.request?.conversationState) setLocalState(payload.request.conversationState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "request_conversation_unavailable");
    } finally {
      setLoading(false);
    }
  }, [hotelSlug, lang, request.id, role]);

  useEffect(() => {
    if (!open) return;
    void loadThread();
  }, [loadThread, open, request.conversationUpdatedAt]);

  async function sendMessage() {
    const message = draft.trim();
    if (!hotelSlug || !role || !message || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/staff/request-conversations", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          role,
          requestId: request.id,
          message,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; conversationState?: string };
      if (!response.ok) throw new Error(payload.error || `request_conversation_${response.status}`);
      setDraft("");
      setLocalState("waiting_for_guest");
      await loadThread();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "request_conversation_unavailable");
    } finally {
      setSending(false);
    }
  }

  if (!hotelSlug || !role) return null;

  const buttonLabel = localState === "waiting_for_staff"
    ? copy.guestReplied
    : localState === "waiting_for_guest"
      ? copy.waitingGuest
      : copy.open;
  const buttonClass = localState === "waiting_for_staff"
    ? "border-rose-300/50 bg-rose-500/20 text-rose-50 ring-2 ring-rose-400/20"
    : localState === "waiting_for_guest"
      ? "border-amber-300/35 bg-amber-400/15 text-amber-100"
      : "border-white/15 bg-white/10 text-white/85";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`min-h-12 w-full rounded-2xl border px-4 text-sm font-semibold transition hover:bg-white/15 ${buttonClass}`}
        aria-expanded={open}
      >
        {buttonLabel}
      </button>

      {open ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/40">{copy.title}</p>
              <p className="mt-1 text-sm font-semibold text-white/85">{request.typeLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65"
            >
              {copy.close}
            </button>
          </div>

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {loading && !messages.length ? (
              <div className="rounded-xl bg-white/5 px-3 py-4 text-sm text-white/50">…</div>
            ) : messages.length ? messages.map((message) => {
              const guest = message.senderType === "guest";
              return (
                <article
                  key={message.id}
                  className={`rounded-xl border px-3 py-2 ${guest ? "border-sky-300/20 bg-sky-400/10" : "border-white/10 bg-white/5"}`}
                >
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    <span className="font-semibold text-white/65">{guest ? copy.guest : copy.hotel}</span>
                    <span className="ml-auto">{formatTime(message.sentAt || message.createdAt, lang)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-white/80">{message.body}</p>
                </article>
              );
            }) : (
              <div className="rounded-xl bg-white/5 px-3 py-4 text-sm text-white/50">{copy.empty}</div>
            )}
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {error}
              <button type="button" onClick={() => void loadThread()} className="ml-2 underline">{copy.retry}</button>
            </div>
          ) : null}

          {canReply ? (
            <div className="mt-3 space-y-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                placeholder={copy.placeholder}
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
              />
              <button
                type="button"
                disabled={!draft.trim() || sending}
                onClick={() => void sendMessage()}
                className="min-h-11 w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? copy.sending : copy.send}
              </button>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-white/50">{copy.readOnly}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
