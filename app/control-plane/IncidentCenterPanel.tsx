"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type Incident = {
  incidentId: string;
  fingerprint: string;
  hotelId: string | null;
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  kind: string;
  module: string;
  environment: string;
  releaseSha: string | null;
  deploymentId: string | null;
  status:
    | "detected"
    | "investigating"
    | "cause_identified"
    | "fixed"
    | "verified"
    | "closed";
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  hotelsWithSameFingerprint: number;
  hotel: { name: string; slug: string } | null;
};

type IncidentResult = {
  incidents: Incident[];
  summary: {
    total: number;
    open: number;
    criticalOpen: number;
    recurringAcrossHotels: number;
  };
};

const NEXT: Record<Incident["status"], Incident["status"][]> = {
  detected: ["investigating", "closed"],
  investigating: ["cause_identified", "fixed", "closed"],
  cause_identified: ["fixed", "investigating"],
  fixed: ["verified", "investigating"],
  verified: ["closed", "investigating"],
  closed: ["investigating"],
};

const COPY = {
  bg: {
    title: "GOSTAYA Incident Center",
    subtitle:
      "Автоматично засечени и човешки докладвани проблеми по хотел, модул, release и fingerprint.",
    total: "Общо",
    open: "Отворени",
    critical: "Critical open",
    recurring: "В повече от един хотел",
    all: "Всички",
    openOnly: "Само отворени",
    refresh: "Обнови",
    occurrences: "появи",
    hotels: "хотела със същия fingerprint",
    release: "Release",
    change: "Промени статус",
    note: "Бележка",
    save: "Запази",
    loading: "Зареждане…",
    empty: "Няма incidents в избрания изглед.",
    unavailable: "Incident Center не е достъпен.",
  },
  en: {
    title: "GOSTAYA Incident Center",
    subtitle:
      "Automatically detected and human-reported issues grouped by hotel, module, release and fingerprint.",
    total: "Total",
    open: "Open",
    critical: "Critical open",
    recurring: "Across multiple hotels",
    all: "All",
    openOnly: "Open only",
    refresh: "Refresh",
    occurrences: "occurrences",
    hotels: "hotels with same fingerprint",
    release: "Release",
    change: "Change status",
    note: "Note",
    save: "Save",
    loading: "Loading…",
    empty: "No incidents in this view.",
    unavailable: "Incident Center is unavailable.",
  },
} as const;

export default function IncidentCenterPanel({
  lang,
}: {
  lang: ControlPlaneLang;
}) {
  const copy = COPY[lang] || COPY.en;
  const [result, setResult] = useState<IncidentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const [draftStatus, setDraftStatus] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/control-plane/incidents", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; result?: IncidentResult }
        | null;

      if (!response.ok || !body?.ok || !body.result) {
        throw new Error("unavailable");
      }
      setResult(body.result);
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setLoading(false);
    }
  }, [copy.unavailable]);

  useEffect(() => {
    void load();
  }, [load]);

  const incidents = useMemo(() => {
    const rows = result?.incidents || [];
    return openOnly
      ? rows.filter((incident) => incident.status !== "closed")
      : rows;
  }, [openOnly, result]);

  async function transition(incident: Incident) {
    const nextStatus =
      (draftStatus[incident.incidentId] as Incident["status"] | undefined)
      || NEXT[incident.status][0];
    if (!nextStatus || !incident.hotelId) return;

    setSaving(incident.incidentId);
    setFeedback(null);
    try {
      const response = await fetch("/api/control-plane/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: incident.hotelId,
          incidentId: incident.incidentId,
          status: nextStatus,
          note: notes[incident.incidentId] || "",
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean }
        | null;
      if (!response.ok || !body?.ok) {
        throw new Error("transition_failed");
      }

      setNotes((current) => ({ ...current, [incident.incidentId]: "" }));
      setDraftStatus((current) => {
        const next = { ...current };
        delete next[incident.incidentId];
        return next;
      });
      await load();
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-2xl border border-rose-900/50 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-300/70">
            {copy.title}
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-neutral-500">
            {copy.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300"
        >
          {copy.refresh}
        </button>
      </div>

      {result ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[
            [copy.total, result.summary.total],
            [copy.open, result.summary.open],
            [copy.critical, result.summary.criticalOpen],
            [copy.recurring, result.summary.recurringAcrossHotels],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
            >
              <p className="text-[11px] text-neutral-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-neutral-100">
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setOpenOnly(true)}
          className={`rounded-lg border px-3 py-1.5 text-xs ${
            openOnly
              ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
              : "border-neutral-800 text-neutral-500"
          }`}
        >
          {copy.openOnly}
        </button>
        <button
          type="button"
          onClick={() => setOpenOnly(false)}
          className={`rounded-lg border px-3 py-1.5 text-xs ${
            !openOnly
              ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
              : "border-neutral-800 text-neutral-500"
          }`}
        >
          {copy.all}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-500">{copy.loading}</p>
        ) : incidents.length ? (
          incidents.map((incident) => (
            <article
              key={incident.incidentId}
              className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-100">
                    {incident.summary}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {incident.hotel?.name || incident.hotelId || "Platform"} ·{" "}
                    {incident.module} · {incident.kind} · {incident.environment}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] uppercase text-neutral-400">
                    {incident.severity}
                  </span>
                  <span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] uppercase text-neutral-400">
                    {incident.status}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-600">
                <span>{incident.occurrenceCount} {copy.occurrences}</span>
                <span>·</span>
                <span>{incident.hotelsWithSameFingerprint} {copy.hotels}</span>
                <span>·</span>
                <span>{new Date(incident.lastSeenAt).toLocaleString()}</span>
                {incident.releaseSha ? (
                  <>
                    <span>·</span>
                    <span>{copy.release}: {incident.releaseSha.slice(0, 10)}</span>
                  </>
                ) : null}
              </div>

              {incident.hotelId ? (
                <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
                  <select
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                    value={
                      draftStatus[incident.incidentId]
                      || NEXT[incident.status][0]
                      || incident.status
                    }
                    onChange={(e) =>
                      setDraftStatus((current) => ({
                        ...current,
                        [incident.incidentId]: e.target.value,
                      }))
                    }
                  >
                    {NEXT[incident.status].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <input
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                    placeholder={copy.note}
                    value={notes[incident.incidentId] || ""}
                    onChange={(e) =>
                      setNotes((current) => ({
                        ...current,
                        [incident.incidentId]: e.target.value,
                      }))
                    }
                  />

                  <button
                    type="button"
                    onClick={() => void transition(incident)}
                    disabled={
                      saving === incident.incidentId
                      || !NEXT[incident.status].length
                    }
                    className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-35"
                  >
                    {copy.save}
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-neutral-500">{copy.empty}</p>
        )}
      </div>

      {feedback ? (
        <p className="mt-3 text-xs text-rose-300">{feedback}</p>
      ) : null}
    </section>
  );
}
