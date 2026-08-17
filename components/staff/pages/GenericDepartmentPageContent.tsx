"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const visibleRequests = useMemo(() => {
    if (filter === "completed") return requests.filter((request) => request.status === "completed");
    if (filter === "active") return requests.filter((request) => ACTIVE_STATUSES.has(request.status));
    return requests;
  }, [filter, requests]);

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
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">StayHub Staff</p>
            <h1 className="mt-1 text-2xl font-semibold">{departmentName}</h1>
            <p className="mt-1 text-sm text-white/55">{hotelSlug} · {departmentCode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {soundReady ? (
              <button
                type="button"
                onClick={() => void toggleSound()}
                className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80"
              >
                Sound: {soundEnabled ? "On" : "Off"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70"
            >
              Sign out
            </button>
          </div>
        </header>

        <GenericDepartmentPushControls hotelSlug={hotelSlug} role={departmentCode} />

        <section className="flex flex-wrap gap-2">
          {(["active", "completed", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-xl px-4 py-2 text-sm ${
                filter === value ? "bg-white text-black" : "border border-white/15 text-white/70"
              }`}
            >
              {value === "active" ? "Active" : value === "completed" ? "Completed" : "All"}
            </button>
          ))}
        </section>

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
            {visibleRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70">Room {request.room}</span>
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70">{request.status}</span>
                      {request.isTest ? <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-xs text-amber-100">TEST</span> : null}
                    </div>
                    <h2 className="mt-3 text-lg font-medium">{request.title}</h2>
                    {request.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-white/65">{request.note}</p> : null}
                    <p className="mt-2 text-xs text-white/40">{new Date(request.createdAtIso).toLocaleString()}</p>
                  </div>

                  {request.status !== "completed" ? (
                    <div className="flex shrink-0 gap-2">
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
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
