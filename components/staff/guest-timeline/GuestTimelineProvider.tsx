"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useStaffHotelTimeZone } from "@/components/staff/StaffHotelTimeZoneProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type TimelineItem = {
  id: string;
  occurredAt: string;
  category: string;
  eventType: string;
  status: string | null;
  label: string | null;
  actorRole: string | null;
  metadata: Record<string, unknown>;
};

type TimelineResponse = {
  ok: boolean;
  stay?: {
    id: string;
    roomNumber: string;
    lifecycleState: string;
    checkInDate: string | null;
    checkOutDate: string | null;
    isTest: boolean;
  };
  timeline?: {
    items: TimelineItem[];
  };
  sourceCounts?: {
    requests: number;
    communications: number;
    surveys: number;
    massageBookings: number;
    hubEvents: number;
  };
  error?: string;
};

type TimelineControls = {
  openForRequest: (requestId: string) => void;
};

const TimelineContext = createContext<TimelineControls | null>(null);

function text(lang: string) {
  if (lang === "bg") {
    return {
      title: "История на престоя",
      loading: "Зареждане на историята…",
      empty: "Няма записани събития за този престой.",
      unavailable: "Историята на престоя не е налична в момента.",
      close: "Затвори",
      room: "Стая",
      currentStay: "Текущ престой",
      test: "ТЕСТ",
      requests: "Заявки",
      messages: "Съобщения",
      surveys: "Анкети",
      massages: "Масажи",
    };
  }
  if (lang === "de") {
    return {
      title: "Aufenthaltsverlauf",
      loading: "Aufenthaltsverlauf wird geladen…",
      empty: "Für diesen Aufenthalt sind keine Ereignisse vorhanden.",
      unavailable: "Der Aufenthaltsverlauf ist derzeit nicht verfügbar.",
      close: "Schließen",
      room: "Zimmer",
      currentStay: "Aktueller Aufenthalt",
      test: "TEST",
      requests: "Anfragen",
      messages: "Nachrichten",
      surveys: "Umfragen",
      massages: "Massagen",
    };
  }
  return {
    title: "Stay timeline",
    loading: "Loading stay timeline…",
    empty: "No recorded events for this stay.",
    unavailable: "The stay timeline is currently unavailable.",
    close: "Close",
    room: "Room",
    currentStay: "Current stay",
    test: "TEST",
    requests: "Requests",
    messages: "Messages",
    surveys: "Surveys",
    massages: "Massages",
  };
}

function eventLabel(eventType: string, lang: string) {
  const labels: Record<string, [string, string, string]> = {
    stay_started: ["Начало на престоя", "Stay started", "Aufenthalt begonnen"],
    room_confirmed: ["Потвърдена стая", "Room confirmed", "Zimmer bestätigt"],
    room_changed: ["Сменена стая", "Room changed", "Zimmer geändert"],
    request_created: ["Създадена заявка", "Request created", "Anfrage erstellt"],
    request_seen_by_staff: ["Заявката е видяна", "Request seen by staff", "Anfrage vom Personal gesehen"],
    request_in_progress: ["Започната обработка", "Request in progress", "Bearbeitung begonnen"],
    request_returned: ["Върната за внимание", "Returned for attention", "Zur Bearbeitung zurückgegeben"],
    request_completed: ["Заявката е завършена", "Request completed", "Anfrage abgeschlossen"],
    request_billing_charged: ["Начислена услуга", "Service charged", "Leistung berechnet"],
    request_billing_waived: ["Без начисляване", "Charge waived", "Ohne Berechnung"],
    request_billing_cancelled: ["Начисляването е отменено", "Billing cancelled", "Berechnung storniert"],
    direct_communication: ["Директно съобщение", "Direct message", "Direkte Nachricht"],
    survey_submitted: ["Подадена анкета", "Survey submitted", "Umfrage gesendet"],
    massage_booking_created: ["Запазен масаж", "Massage booked", "Massage gebucht"],
    massage_booking_cancelled: ["Отменен масаж", "Massage cancelled", "Massage storniert"],
    ai_question_sent: ["Въпрос към AI", "AI question", "AI-Frage"],
    ai_action_clicked: ["Избрано AI действие", "AI action selected", "AI-Aktion ausgewählt"],
  };
  const item = labels[eventType];
  if (!item) return eventType.replaceAll("_", " ");
  return lang === "bg" ? item[0] : lang === "de" ? item[2] : item[1];
}

function categoryClasses(category: string) {
  switch (category) {
    case "service":
      return "border-sky-300/30 bg-sky-400/10";
    case "billing":
      return "border-amber-300/30 bg-amber-400/10";
    case "feedback":
      return "border-fuchsia-300/30 bg-fuchsia-400/10";
    case "booking":
      return "border-emerald-300/30 bg-emerald-400/10";
    case "communication":
      return "border-indigo-300/30 bg-indigo-400/10";
    case "ai":
      return "border-violet-300/30 bg-violet-400/10";
    default:
      return "border-white/10 bg-white/5";
  }
}

function formatDateTime(iso: string, lang: string, timeZone?: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(lang, {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useGuestTimelineControls() {
  return useContext(TimelineContext);
}

export default function GuestTimelineProvider({
  hotelSlug,
  role = "manager",
  children,
}: {
  hotelSlug: string;
  role?: "manager" | "reception";
  children: ReactNode;
}) {
  const { lang } = useStaffUi();
  const hotelTimeZone = useStaffHotelTimeZone();
  const copy = text(lang);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => {
    setRequestId(null);
    setData(null);
    setLoading(false);
  }, []);

  const openForRequest = useCallback((nextRequestId: string) => {
    const cleanRequestId = String(nextRequestId || "").trim();
    if (!cleanRequestId) return;
    setRequestId(cleanRequestId);
  }, []);

  useEffect(() => {
    if (!requestId) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);

    const params = new URLSearchParams({ hotelSlug, role, requestId });
    fetch(`/api/staff/guest-timeline?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as TimelineResponse | null;
        if (!response.ok || !body?.ok) throw new Error(body?.error || "timeline_unavailable");
        setData(body);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Guest timeline load failed", error);
        setData({ ok: false, error: "unavailable" });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [hotelSlug, requestId, role]);

  const controls = useMemo(() => ({ openForRequest }), [openForRequest]);
  const items = data?.timeline?.items ?? [];
  const counts = data?.sourceCounts;

  return (
    <TimelineContext.Provider value={controls}>
      {children}

      {requestId ? (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/55 backdrop-blur-sm" role="presentation" onMouseDown={close}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={copy.title}
            className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-5 shadow-2xl sm:p-7"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">StayHub · OA4</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{copy.title}</h2>
                {data?.stay ? (
                  <p className="mt-2 text-sm text-white/55">
                    {copy.room} {data.stay.roomNumber} · {copy.currentStay}
                    {data.stay.isTest ? ` · ${copy.test}` : ""}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
              >
                {copy.close}
              </button>
            </div>

            {counts ? (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [copy.requests, counts.requests],
                  [copy.messages, counts.communications],
                  [copy.surveys, counts.surveys],
                  [copy.massages, counts.massageBookings],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-xs text-white/45">{label}</div>
                    <div className="mt-1 text-xl font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-6 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">{copy.loading}</div>
              ) : data?.ok === false ? (
                <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4 text-sm text-rose-100">{copy.unavailable}</div>
              ) : items.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">{copy.empty}</div>
              ) : (
                items.map((item) => (
                  <article key={item.id} className={`rounded-2xl border p-4 ${categoryClasses(item.category)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{eventLabel(item.eventType, lang)}</div>
                        {item.label ? <div className="mt-1 text-xs text-white/50">{item.label}</div> : null}
                      </div>
                      <time className="shrink-0 text-right text-xs text-white/45">
                        {formatDateTime(item.occurredAt, lang, hotelTimeZone)}
                      </time>
                    </div>
                    {(item.status || item.actorRole) ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/55">
                        {item.status ? <span className="rounded-lg bg-black/20 px-2 py-1">{item.status}</span> : null}
                        {item.actorRole ? <span className="rounded-lg bg-black/20 px-2 py-1">{item.actorRole}</span> : null}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </TimelineContext.Provider>
  );
}
