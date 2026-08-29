"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import StaffCollapsiblePanel from "@/components/staff/StaffCollapsiblePanel";
import GenericDepartmentPushControls from "@/components/staff/GenericDepartmentPushControls";
import { useStaffAlertSound } from "@/components/staff/useStaffAlertSound";
import { useStaffTabTitleAlert } from "@/components/staff/useStaffTabTitleAlert";

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

export default function GenericDepartmentPageContent({
  hotelSlug,
  departmentCode,
  departmentName,
}: {
  hotelSlug: string;
  departmentCode: string;
  departmentName: string;
}) {
  const [requests, setRequests] = useState<GenericDepartmentRequest[]>([]);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [requestOpenState, setRequestOpenState] = useState<Record<string, boolean>>({});
  const versionRef = useRef<number | null>(null);

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
          setError("Staff feed is temporarily unavailable.");
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
  }, [poll]);

  const counts = useMemo(() => ({
    active: requests.filter((request) => ACTIVE_STATUSES.has(request.status)).length,
    completed: requests.filter((request) => request.status === "completed").length,
    all: requests.length,
  }), [requests]);

  const visibleRequests = useMemo(() => {
    if (filter === "completed") return requests.filter((request) => request.status === "completed");
    if (filter === "active") return requests.filter((request) => ACTIVE_STATUSES.has(request.status));
    return requests;
  }, [filter, requests]);

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
      setError("Request update failed. Please try again.");
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
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Department workspace</p>
            <h2 className="mt-1 text-2xl font-semibold">{departmentName}</h2>
            <p className="mt-1 text-sm text-white/55">{departmentCode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {soundReady ? (
              <button
                type="button"
                onClick={() => void toggleSound()}
                className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/80"
              >
                Sound: {soundEnabled ? "On" : "Off"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/70"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {([
          ["active", "Active", counts.active],
          ["completed", "Completed", counts.completed],
          ["all", "All", counts.all],
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
        title="Notifications"
        summary="Push and alert controls for this department."
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
          Loading department requests…
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
          No requests in this view.
        </div>
      ) : (
        <section className="space-y-3">
          {visibleRequests.map((request) => {
            const open = isRequestOpen(request);
            return (
              <article key={request.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 p-4 text-left"
                  aria-expanded={open}
                  onClick={() => toggleRequest(request)}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70">Room {request.room}</span>
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70">{request.status}</span>
                      {request.isTest ? <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-xs text-amber-100">TEST</span> : null}
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
                            Start
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() => void updateStatus(request.id, "completed")}
                          className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100 disabled:opacity-50"
                        >
                          Done
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
