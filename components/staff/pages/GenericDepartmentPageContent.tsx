"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import StaffCollapsiblePanel from "@/components/staff/StaffCollapsiblePanel";
import StaffDevelopmentAccessCard from "@/components/staff/StaffDevelopmentAccessCard";
import StaffMassageReservationsPanel from "@/components/staff/StaffMassageReservationsPanel";
import GenericDepartmentPushControls from "@/components/staff/GenericDepartmentPushControls";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { useStaffAlertSound } from "@/components/staff/useStaffAlertSound";
import { useStaffTabTitleAlert } from "@/components/staff/useStaffTabTitleAlert";
import { evaluateOperationalRequestSla } from "@/lib/server/operational-request-sla.mjs";
import type { OperationalRequestSlaPolicy } from "@/lib/server/operational-request-sla.mjs";

type GenericDepartmentRequest = {
  id: string;
  room: string;
  requestType: string;
  title: string;
  titleOriginal?: string | null;
  note?: string | null;
  noteOriginal?: string | null;
  status: string;
  createdAtIso: string;
  startedAtIso?: string | null;
  resolvedAtIso?: string | null;
  operationalSla?: OperationalRequestSlaPolicy | null;
  department: string;
  serviceTime: string;
  requiresBilling?: boolean;
  price?: unknown;
  currency?: unknown;
  isTest?: boolean;
};

type FeedPayload = {
  ok?: boolean;
  department?: { id: string; code: string; name: string };
  requests?: GenericDepartmentRequest[];
};

const ACTIVE_STATUSES = new Set(["new", "in_progress", "returned"]);

const COPY = {
  bg: {
    eyebrow: "РАБОТЕН ПАНЕЛ НА ОТДЕЛА",
    subtitle: "Оперативни заявки и действия",
    sound: "Звук",
    on: "Включен",
    off: "Изключен",
    signOut: "Изход",
    active: "Активни",
    completed: "Приключени",
    all: "Всички",
    notifications: "Известия",
    notificationsSummary: "Известия и звукови сигнали за този отдел.",
    loading: "Зареждане на заявките…",
    empty: "Няма заявки в този изглед.",
    feedError: "Временно няма достъп до заявките.",
    updateError: "Промяната на заявката не успя. Опитайте отново.",
    room: "Стая",
    test: "ТЕСТ",
    overdue: "ПРОСРОЧЕНО",
    minutes: "мин.",
    start: "СТАРТ",
    done: "ГОТОВО",
  },
  en: {
    eyebrow: "DEPARTMENT WORKSPACE",
    subtitle: "Operational requests and actions",
    sound: "Sound",
    on: "On",
    off: "Off",
    signOut: "Sign out",
    active: "Active",
    completed: "Completed",
    all: "All",
    notifications: "Notifications",
    notificationsSummary: "Push and alert controls for this department.",
    loading: "Loading department requests…",
    empty: "No requests in this view.",
    feedError: "Staff feed is temporarily unavailable.",
    updateError: "Request update failed. Please try again.",
    room: "Room",
    test: "TEST",
    overdue: "OVERDUE",
    minutes: "min",
    start: "Start",
    done: "Done",
  },
  de: {
    eyebrow: "ABTEILUNGSBEREICH",
    subtitle: "Operative Anfragen und Aktionen",
    sound: "Ton",
    on: "Ein",
    off: "Aus",
    signOut: "Abmelden",
    active: "Aktiv",
    completed: "Abgeschlossen",
    all: "Alle",
    notifications: "Mitteilungen",
    notificationsSummary: "Mitteilungen und Tonsignale für diese Abteilung.",
    loading: "Abteilungsanfragen werden geladen…",
    empty: "Keine Anfragen in dieser Ansicht.",
    feedError: "Die Anfragen sind vorübergehend nicht verfügbar.",
    updateError: "Die Anfrage konnte nicht aktualisiert werden.",
    room: "Zimmer",
    test: "TEST",
    overdue: "ÜBERFÄLLIG",
    minutes: "Min.",
    start: "START",
    done: "FERTIG",
  },
} as const;

function statusLabel(status: string, lang: "bg" | "en" | "de") {
  const labels = {
    bg: { new: "Нова", in_progress: "В процес", returned: "Върната", completed: "Приключена" },
    en: { new: "New", in_progress: "In progress", returned: "Returned", completed: "Completed" },
    de: { new: "Neu", in_progress: "In Arbeit", returned: "Zurückgegeben", completed: "Abgeschlossen" },
  } as const;
  return labels[lang][status as keyof (typeof labels)["bg"]] || status;
}

export default function GenericDepartmentPageContent({
  hotelSlug,
  departmentCode,
  departmentName,
}: {
  hotelSlug: string;
  departmentCode: string;
  departmentName: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [requests, setRequests] = useState<GenericDepartmentRequest[]>([]);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [requestOpenState, setRequestOpenState] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const versionRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { ready: soundReady, soundEnabled, toggleSound } = useStaffAlertSound({
    hotelSlug,
    department: departmentCode,
    requests,
  });
  useStaffTabTitleAlert(requests);

  const loadRequests = useCallback(async () => {
    const params = new URLSearchParams({ hotelSlug, role: departmentCode, _: String(Date.now()) });
    const response = await fetch(`/api/staff/department-runtime/requests?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (response.status === 401 || response.status === 403) {
      const nextPath = `/staff/${hotelSlug}/${departmentCode}`;
      window.location.replace(
        `/staff/${hotelSlug}/pin?role=${departmentCode}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }
    if (!response.ok) throw new Error(`request feed ${response.status}`);
    const payload = (await response.json()) as FeedPayload;
    setRequests(Array.isArray(payload.requests) ? payload.requests : []);
    setError("");
    setReady(true);
  }, [departmentCode, hotelSlug]);

  const poll = useCallback(async (force = false) => {
    const params = new URLSearchParams({ hotelSlug, role: departmentCode, _: String(Date.now()) });
    const response = await fetch(`/api/staff/feed-state?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      const nextPath = `/staff/${hotelSlug}/${departmentCode}`;
      window.location.replace(
        `/staff/${hotelSlug}/pin?role=${departmentCode}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }
    if (!response.ok) {
      await loadRequests();
      return;
    }
    const state = await response.json();
    const version = Number(state?.requestsVersion ?? 0);
    if (force || versionRef.current === null || versionRef.current !== version) {
      await loadRequests();
    }
    versionRef.current = version;
  }, [departmentCode, hotelSlug, loadRequests]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const run = async (force = false) => {
      if (cancelled) return;
      try {
        await poll(force);
      } catch (pollError) {
        console.error("generic department poll failed", pollError);
        if (!cancelled) {
          setError(copy.feedError);
          setReady(true);
        }
      }
    };

    void run(true);
    timer = window.setInterval(() => void run(false), 10_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [copy.feedError, poll]);

  const operationalRequests = useMemo(
    () => departmentCode === "spa"
      ? requests.filter((request) => request.requestType !== "massage_booking")
      : requests,
    [departmentCode, requests],
  );

  const counts = useMemo(() => ({
    active: operationalRequests.filter((request) => ACTIVE_STATUSES.has(request.status)).length,
    completed: operationalRequests.filter((request) => request.status === "completed").length,
    all: operationalRequests.length,
  }), [operationalRequests]);

  const visibleRequests = useMemo(() => {
    if (filter === "completed") return operationalRequests.filter((request) => request.status === "completed");
    if (filter === "active") return operationalRequests.filter((request) => ACTIVE_STATUSES.has(request.status));
    return operationalRequests;
  }, [filter, operationalRequests]);

  function isRequestOpen(request: GenericDepartmentRequest) {
    const explicit = requestOpenState[request.id];
    if (typeof explicit === "boolean") return explicit;
    return request.status !== "completed";
  }

  function toggleRequest(request: GenericDepartmentRequest) {
    setRequestOpenState((current) => ({
      ...current,
      [request.id]: !isRequestOpen(request),
    }));
  }

  async function updateStatus(requestId: string, status: string) {
    setBusyId(requestId);
    try {
      const response = await fetch("/api/staff/department-runtime/request-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, role: departmentCode, requestId, status }),
      });
      if (!response.ok) throw new Error(`status update ${response.status}`);
      await loadRequests();
    } catch (statusError) {
      console.error("generic department status update failed", statusError);
      setError(copy.updateError);
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await fetch("/api/staff/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelSlug, role: departmentCode }),
    }).catch(() => undefined);
    window.location.replace(`/staff/${hotelSlug}/pin?role=${departmentCode}`);
  }

  return (
    <main className="space-y-5 pb-safe">
      <header className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">{copy.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-semibold">{departmentName}</h2>
            <p className="mt-1 text-sm text-white/55">{copy.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {soundReady ? (
              <button
                type="button"
                onClick={() => void toggleSound()}
                className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/80"
              >
                {copy.sound}: {soundEnabled ? copy.on : copy.off}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/70"
            >
              {copy.signOut}
            </button>
          </div>
        </div>
      </header>

      <StaffDevelopmentAccessCard
        hotelSlug={hotelSlug}
        role={departmentCode}
      />

      {departmentCode === "spa" ? (
        <StaffMassageReservationsPanel hotelSlug={hotelSlug} role={departmentCode} />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {([
          ["active", copy.active, counts.active],
          ["completed", copy.completed, counts.completed],
          ["all", copy.all, counts.all],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              filter === value
                ? "border-[var(--staff-brand-primary)] bg-[color-mix(in_srgb,var(--staff-brand-primary)_10%,var(--staff-surface)_90%)]"
                : "border-white/10 bg-white/5"
            }`}
          >
            <p className="text-sm text-white/55">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{count}</p>
          </button>
        ))}
      </section>

      <StaffCollapsiblePanel
        title={copy.notifications}
        summary={copy.notificationsSummary}
      >
        <GenericDepartmentPushControls hotelSlug={hotelSlug} role={departmentCode} />
      </StaffCollapsiblePanel>

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!ready ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
          {copy.loading}
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
          {copy.empty}
        </div>
      ) : (
        <section className="space-y-3">
          {visibleRequests.map((request) => {
            const open = isRequestOpen(request);
            const slaEvidence = evaluateOperationalRequestSla({
              status: request.status,
              createdAtIso: request.createdAtIso,
              startedAtIso: request.startedAtIso,
              resolvedAtIso: request.resolvedAtIso,
              now: new Date(nowMs),
              policy: request.operationalSla ?? undefined,
            });
            const isOverdue = slaEvidence.escalationRequired;
            return (
              <article
                key={request.id}
                className={`overflow-hidden rounded-2xl border shadow-sm ${
                  isOverdue
                    ? "border-rose-500/90 bg-rose-950/35 ring-2 ring-rose-500/30 animate-pulse"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 p-4 text-left"
                  aria-expanded={open}
                  onClick={() => toggleRequest(request)}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70">{copy.room} {request.room}</span>
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70">{statusLabel(request.status, lang)}</span>
                      {request.isTest ? <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-xs text-amber-100">{copy.test}</span> : null}
                      {isOverdue ? (
                        <span className="rounded-lg border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-50">
                          {copy.overdue} · {slaEvidence.ageMinutes ?? 0} {copy.minutes}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-3 block truncate text-lg font-medium text-white">{request.title}</span>
                    <span className="mt-1 block text-xs text-white/40">{new Date(request.createdAtIso).toLocaleString()}</span>
                  </span>
                  <span className="stayhub-staff-collapsible-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg" aria-hidden="true">
                    {open ? "−" : "+"}
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-white/10 px-4 pb-4 pt-4">
                    {request.note ? <p className="whitespace-pre-wrap text-sm text-white/65">{request.note}</p> : null}
                    {request.status !== "completed" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {request.status !== "in_progress" ? (
                          <button
                            type="button"
                            disabled={busyId === request.id}
                            onClick={() => void updateStatus(request.id, "in_progress")}
                            className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-sm text-sky-100 disabled:opacity-50"
                          >
                            {copy.start}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() => void updateStatus(request.id, "completed")}
                          className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100 disabled:opacity-50"
                        >
                          {copy.done}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
