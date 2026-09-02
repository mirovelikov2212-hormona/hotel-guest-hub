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

type RequestThreadSummary = {
  id: string;
  room_number_snapshot?: string | null;
  title?: string | null;
  status?: string | null;
  conversation_state?: "none" | "waiting_for_guest" | "waiting_for_staff" | null;
  conversation_updated_at?: string | null;
  conversation_last_sender_type?: "staff" | "guest" | "system" | "ai" | null;
};

type RequestThreadMessage = {
  id: string;
  requestId: string;
  senderType: "staff" | "guest" | "system" | "ai";
  actorRole: string;
  title: string;
  body: string;
  sourceLanguage: string;
  language: string;
  translationStatus: string;
  sentAt: string;
  createdAt: string;
};

type RequestThreadPayload = {
  requests?: RequestThreadSummary[];
  messages?: RequestThreadMessage[];
  readOnly?: boolean;
};

type GuestInboxCopy = {
  label: string;
  title: string;
  empty: string;
  close: string;
  from: string;
  important: string;
  hotelMessages: string;
  requestConversations: string;
  requestFallback: string;
  hotel: string;
  you: string;
  reply: string;
  replyPlaceholder: string;
  sending: string;
  waitingForYou: string;
  waitingForHotel: string;
  closed: string;
  sendFailed: string;
};

const COPY: Record<LangKey, GuestInboxCopy> = {
  bg: {
    label: "Съобщения", title: "Съобщения от хотела", empty: "Няма нови съобщения.", close: "Затвори", from: "От", important: "Важно",
    hotelMessages: "От хотела", requestConversations: "По Вашите заявки", requestFallback: "Заявка", hotel: "Хотел", you: "Вие",
    reply: "Отговори", replyPlaceholder: "Напишете отговор…", sending: "Изпращане…", waitingForYou: "Хотелът очаква Вашия отговор", waitingForHotel: "Очаква отговор от хотела", closed: "Разговорът е приключен", sendFailed: "Отговорът не беше изпратен. Опитайте отново.",
  },
  en: {
    label: "Messages", title: "Hotel messages", empty: "There are no new messages.", close: "Close", from: "From", important: "Important",
    hotelMessages: "From the hotel", requestConversations: "Your request conversations", requestFallback: "Request", hotel: "Hotel", you: "You",
    reply: "Reply", replyPlaceholder: "Write a reply…", sending: "Sending…", waitingForYou: "The hotel is waiting for your reply", waitingForHotel: "Waiting for the hotel", closed: "This conversation is closed", sendFailed: "Your reply could not be sent. Please try again.",
  },
  de: {
    label: "Mitteilungen", title: "Hotel-Mitteilungen", empty: "Keine neuen Mitteilungen.", close: "Schließen", from: "Von", important: "Wichtig",
    hotelMessages: "Vom Hotel", requestConversations: "Ihre Anfragen", requestFallback: "Anfrage", hotel: "Hotel", you: "Sie",
    reply: "Antworten", replyPlaceholder: "Antwort schreiben…", sending: "Wird gesendet…", waitingForYou: "Das Hotel wartet auf Ihre Antwort", waitingForHotel: "Wartet auf das Hotel", closed: "Diese Unterhaltung ist beendet", sendFailed: "Ihre Antwort konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
  },
  ro: {
    label: "Mesaje", title: "Mesaje de la hotel", empty: "Nu există mesaje noi.", close: "Închide", from: "De la", important: "Important",
    hotelMessages: "De la hotel", requestConversations: "Conversațiile solicitărilor dvs.", requestFallback: "Solicitare", hotel: "Hotel", you: "Dvs.",
    reply: "Răspunde", replyPlaceholder: "Scrieți un răspuns…", sending: "Se trimite…", waitingForYou: "Hotelul așteaptă răspunsul dvs.", waitingForHotel: "Se așteaptă răspunsul hotelului", closed: "Conversația este închisă", sendFailed: "Răspunsul nu a putut fi trimis. Încercați din nou.",
  },
  cs: {
    label: "Zprávy", title: "Zprávy z hotelu", empty: "Žádné nové zprávy.", close: "Zavřít", from: "Od", important: "Důležité",
    hotelMessages: "Z hotelu", requestConversations: "Konverzace k vašim požadavkům", requestFallback: "Požadavek", hotel: "Hotel", you: "Vy",
    reply: "Odpovědět", replyPlaceholder: "Napište odpověď…", sending: "Odesílání…", waitingForYou: "Hotel čeká na vaši odpověď", waitingForHotel: "Čeká se na hotel", closed: "Konverzace je uzavřena", sendFailed: "Odpověď se nepodařilo odeslat. Zkuste to znovu.",
  },
  ru: {
    label: "Сообщения", title: "Сообщения от отеля", empty: "Новых сообщений нет.", close: "Закрыть", from: "От", important: "Важно",
    hotelMessages: "От отеля", requestConversations: "По вашим запросам", requestFallback: "Запрос", hotel: "Отель", you: "Вы",
    reply: "Ответить", replyPlaceholder: "Напишите ответ…", sending: "Отправка…", waitingForYou: "Отель ждёт вашего ответа", waitingForHotel: "Ожидается ответ отеля", closed: "Диалог завершён", sendFailed: "Не удалось отправить ответ. Попробуйте ещё раз.",
  },
};

function normalizeLanguage(value: unknown): LangKey {
  const key = String(value || "").trim().toLowerCase();
  return key === "bg" || key === "en" || key === "de" || key === "ro" || key === "cs" || key === "ru" ? key : "en";
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
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 300) : []);
  } catch {
    return new Set<string>();
  }
}

function writeSeen(hotelSlug: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `stayhub:guest-communications-seen:v1:${hotelSlug}`,
      JSON.stringify(Array.from(new Set(ids)).slice(-300)),
    );
  } catch { }
}

function formatTimestamp(value: string | null, language: LangKey) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locales: Record<LangKey, string> = { bg: "bg-BG", en: "en-GB", de: "de-DE", ro: "ro-RO", cs: "cs-CZ", ru: "ru-RU" };
  return new Intl.DateTimeFormat(locales[language], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function requestIsClosed(status: string | null | undefined) {
  return status === "completed" || status === "cancelled";
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
  const [threadRequests, setThreadRequests] = useState<RequestThreadSummary[]>([]);
  const [threadMessages, setThreadMessages] = useState<RequestThreadMessage[]>([]);
  const [threadReadOnly, setThreadReadOnly] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingRequestId, setSendingRequestId] = useState<string | null>(null);
  const [replyErrorId, setReplyErrorId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const copy = COPY[language] || COPY.en;

  const refreshIdentity = useCallback(() => {
    setStay(readStay(hotelSlug));
    setLanguage(readLanguage(defaultLanguage));
    setSeenIds(readSeen(hotelSlug));
  }, [defaultLanguage, hotelSlug]);

  const loadInbox = useCallback(async (identity: StoredGuestRoomState | null, lang: LangKey) => {
    if (!identity?.stayId || !identity.stayDeviceId || !identity.deviceToken) {
      setMessages([]);
      setThreadRequests([]);
      setThreadMessages([]);
      return;
    }

    const identityPayload = {
      hotelSlug,
      stayId: identity.stayId,
      stayDeviceId: identity.stayDeviceId,
      deviceToken: identity.deviceToken,
      language: lang,
    };

    const [broadcastResult, threadResult] = await Promise.allSettled([
      fetch("/api/guest/communications", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identityPayload),
      }),
      fetch("/api/guest/request-conversations", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...identityPayload, action: "list" }),
      }),
    ]);

    if (broadcastResult.status === "fulfilled" && broadcastResult.value.ok) {
      const payload = await broadcastResult.value.json() as { messages?: GuestCommunication[] };
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    }

    if (threadResult.status === "fulfilled" && threadResult.value.ok) {
      const payload = await threadResult.value.json() as RequestThreadPayload;
      setThreadRequests(Array.isArray(payload.requests) ? payload.requests : []);
      setThreadMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setThreadReadOnly(Boolean(payload.readOnly));
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
    void loadInbox(stay, language);
    if (!stay) return;
    const timer = window.setInterval(() => {
      void loadInbox(readStay(hotelSlug), readLanguage(defaultLanguage));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [defaultLanguage, hotelSlug, language, loadInbox, stay]);

  const allVisibleMessageIds = useMemo(
    () => [...messages.map((message) => message.id), ...threadMessages.map((message) => message.id)],
    [messages, threadMessages],
  );

  const unreadCount = useMemo(
    () => allVisibleMessageIds.filter((id) => !seenIds.has(id)).length,
    [allVisibleMessageIds, seenIds],
  );

  const messagesByRequest = useMemo(() => {
    const map = new Map<string, RequestThreadMessage[]>();
    for (const message of threadMessages) {
      map.set(message.requestId, [...(map.get(message.requestId) || []), message]);
    }
    return map;
  }, [threadMessages]);

  const markCurrentSeen = useCallback(() => {
    const nextSeen = new Set(readSeen(hotelSlug));
    for (const id of allVisibleMessageIds) nextSeen.add(id);
    setSeenIds(nextSeen);
    writeSeen(hotelSlug, Array.from(nextSeen));
  }, [allVisibleMessageIds, hotelSlug]);

  function openInbox() {
    setOpen(true);
    markCurrentSeen();
  }

  useEffect(() => {
    if (open) markCurrentSeen();
  }, [markCurrentSeen, open]);

  async function sendReply(requestId: string) {
    const identity = readStay(hotelSlug);
    const message = String(replyDrafts[requestId] || "").trim();
    if (!identity?.stayId || !identity.stayDeviceId || !identity.deviceToken || !message || sendingRequestId) return;

    setSendingRequestId(requestId);
    setReplyErrorId(null);
    try {
      const response = await fetch("/api/guest/request-conversations", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          stayId: identity.stayId,
          stayDeviceId: identity.stayDeviceId,
          deviceToken: identity.deviceToken,
          language,
          action: "reply",
          requestId,
          message,
        }),
      });
      if (!response.ok) throw new Error(`request_reply_${response.status}`);
      setReplyDrafts((current) => ({ ...current, [requestId]: "" }));
      await loadInbox(identity, language);
    } catch {
      setReplyErrorId(requestId);
    } finally {
      setSendingRequestId(null);
    }
  }

  if (!stay) return null;

  const hasContent = messages.length > 0 || threadRequests.length > 0;

  return (
    <div className="fixed bottom-5 right-4 z-[80] sm:bottom-6 sm:right-6" style={{ "--guest-message-brand": brandColor } as React.CSSProperties}>
      {open ? (
        <section className="mb-3 flex max-h-[min(75vh,42rem)] w-[min(calc(100vw-2rem),26rem)] flex-col overflow-hidden rounded-3xl border border-black/10 bg-white text-[#163033] shadow-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] opacity-55">StayHub</p>
              <h2 className="mt-1 text-lg font-medium">{copy.title}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-black/5 text-xl" aria-label={copy.close}>×</button>
          </header>

          <div className="space-y-5 overflow-y-auto p-4">
            {!hasContent ? <div className="rounded-2xl bg-black/5 p-5 text-sm opacity-65">{copy.empty}</div> : null}

            {threadRequests.length ? (
              <section className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.15em] opacity-45">{copy.requestConversations}</p>
                {threadRequests.map((request) => {
                  const requestMessages = messagesByRequest.get(request.id) || [];
                  const closed = threadReadOnly || requestIsClosed(request.status);
                  const waitingForGuest = request.conversation_state === "waiting_for_guest";
                  const waitingForHotel = request.conversation_state === "waiting_for_staff";
                  return (
                    <article key={request.id} className="rounded-2xl border border-black/10 bg-[#f7faf9] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{request.title || copy.requestFallback}</p>
                          <p className="mt-1 text-xs opacity-50">
                            {waitingForGuest ? copy.waitingForYou : waitingForHotel ? copy.waitingForHotel : closed ? copy.closed : ""}
                          </p>
                        </div>
                        {request.conversation_updated_at ? <span className="shrink-0 text-xs opacity-40">{formatTimestamp(request.conversation_updated_at, language)}</span> : null}
                      </div>

                      <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
                        {requestMessages.map((message) => {
                          const fromGuest = message.senderType === "guest";
                          return (
                            <div key={message.id} className={`rounded-xl px-3 py-2 text-sm ${fromGuest ? "ml-7 bg-black/5" : "mr-7 border border-black/8 bg-white"}`}>
                              <div className="flex items-center gap-2 text-xs opacity-50">
                                <span className="font-medium">{fromGuest ? copy.you : copy.hotel}</span>
                                <span className="ml-auto">{formatTimestamp(message.sentAt || message.createdAt, language)}</span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap leading-5 opacity-80">{message.body}</p>
                            </div>
                          );
                        })}
                      </div>

                      {!closed ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={replyDrafts[request.id] || ""}
                            onChange={(event) => setReplyDrafts((current) => ({ ...current, [request.id]: event.target.value.slice(0, 1000) }))}
                            placeholder={copy.replyPlaceholder}
                            rows={2}
                            className="w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/25"
                          />
                          {replyErrorId === request.id ? <p className="text-xs text-red-700">{copy.sendFailed}</p> : null}
                          <button
                            type="button"
                            disabled={!String(replyDrafts[request.id] || "").trim() || sendingRequestId !== null}
                            onClick={() => void sendReply(request.id)}
                            className="min-h-10 w-full rounded-xl border border-black/10 bg-black/5 px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {sendingRequestId === request.id ? copy.sending : copy.reply}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl bg-black/5 px-3 py-2 text-xs opacity-55">{copy.closed}</p>
                      )}
                    </article>
                  );
                })}
              </section>
            ) : null}

            {messages.length ? (
              <section className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.15em] opacity-45">{copy.hotelMessages}</p>
                {messages.map((message) => (
                  <article key={message.id} className={`rounded-2xl border p-4 ${message.category === "emergency" ? "border-red-300 bg-red-50" : "border-black/10 bg-[#f7faf9]"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {message.category === "emergency" ? <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-700">{copy.important}</span> : null}
                      {message.department?.name ? <span className="opacity-55">{copy.from}: {message.department.name}</span> : null}
                      <span className="ml-auto opacity-45">{formatTimestamp(message.sentAt || message.displayFrom, language)}</span>
                    </div>
                    <h3 className="mt-3 font-medium">{message.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-75">{message.body}</p>
                  </article>
                ))}
              </section>
            ) : null}
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
        {unreadCount > 0 ? <span className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
    </div>
  );
}
