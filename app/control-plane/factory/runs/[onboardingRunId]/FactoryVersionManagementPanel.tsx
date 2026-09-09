"use client";

import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type {
  FactoryProductionVersionManagementSnapshot,
  FactoryVersionRevisionSummary,
  FactoryVersionWorkflow,
} from "@/lib/server/factory-production-version-management";

type ApiEnvelope = {
  ok?: boolean;
  error?: string;
  snapshot?: FactoryProductionVersionManagementSnapshot;
};

const COPY = {
  bg: {
    title: "9. LIVE версии и промени",
    subtitle: "Управление на post-LIVE версии през immutable revisions, доказан diff, runtime certification и atomic activation. UI не определя hotel, deployment или projection authority.",
    migrationRequired: "Change Management DB migration още не е приложена в тази среда. Историята е достъпна read-only; upgrade/restore actions са заключени.",
    readOnly: "Твоята Control Plane роля е read-only за version actions.",
    current: "Текущ LIVE",
    candidates: "Кандидати за нова версия",
    history: "Исторически LIVE версии",
    timeline: "Change audit timeline",
    noCandidates: "Няма готови immutable Factory кандидати за нова LIVE версия.",
    noHistory: "Все още няма предишни LIVE версии за restore.",
    noTimeline: "Няма Change Management audit събития в тази среда.",
    revision: "Версия",
    activated: "Последно LIVE",
    diff: "Промени спрямо текущия LIVE",
    unchanged: "Без семантична промяна",
    reason: "Причина за промяната",
    reasonPlaceholder: "Напр. актуализирани услуги и routing правила",
    readiness: "Провери readiness",
    publication: "Публикувай candidate intent",
    certification: "Сертифицирай runtime",
    activation: "Активирай новата LIVE версия",
    restoreReadiness: "Провери restore readiness",
    restorePublication: "Публикувай restore intent",
    restoreCertification: "Ресертифицирай restore",
    restoreActivation: "Активирай тази историческа версия",
    previouslyLive: "PREVIOUSLY LIVE",
    notRestorable: "Няма доказана предишна LIVE activation",
    busy: "Проверява се…",
    success: "Стъпката премина успешно. Snapshot-ът е презареден от server authority.",
    failed: "Стъпката беше блокирана server-side. LIVE състоянието не е променено.",
    stale: "LIVE версията се е променила междувременно. Snapshot-ът е презареден; повтори само ако новото състояние е очаквано.",
    migration: "DB migration е необходима преди тази операция.",
    confirm: "Потвърждаваш ли тази версияционна стъпка? Тя ще мине през server-side gates и няма да заобикаля certification/CAS.",
    typeLive: "За atomic LIVE activation напиши LIVE",
    typeRestore: "За historical restore activation напиши RESTORE",
    hash: "Diff hash",
  },
  en: {
    title: "9. LIVE versions and changes",
    subtitle: "Post-LIVE lifecycle through immutable revisions, deterministic diff, runtime certification and atomic activation. The UI never owns hotel, deployment or projection authority.",
    migrationRequired: "The Change Management DB migration is not applied in this environment yet. History is available read-only; upgrade/restore actions are locked.",
    readOnly: "Your Control Plane role is read-only for version actions.",
    current: "Current LIVE",
    candidates: "New version candidates",
    history: "Historical LIVE versions",
    timeline: "Change audit timeline",
    noCandidates: "No immutable Factory candidates are ready for a new LIVE version.",
    noHistory: "There are no previous LIVE versions available for restore yet.",
    noTimeline: "No Change Management audit events exist in this environment.",
    revision: "Version",
    activated: "Last LIVE",
    diff: "Changes vs current LIVE",
    unchanged: "No semantic change",
    reason: "Change reason",
    reasonPlaceholder: "e.g. updated services and routing rules",
    readiness: "Assess readiness",
    publication: "Publish candidate intent",
    certification: "Certify runtime",
    activation: "Activate new LIVE version",
    restoreReadiness: "Assess restore readiness",
    restorePublication: "Publish restore intent",
    restoreCertification: "Recertify restore",
    restoreActivation: "Activate this historical version",
    previouslyLive: "PREVIOUSLY LIVE",
    notRestorable: "No verified previous LIVE activation",
    busy: "Checking…",
    success: "The step passed. The snapshot was reloaded from server authority.",
    failed: "The step was blocked server-side. LIVE state was not changed.",
    stale: "The LIVE revision changed concurrently. The snapshot was reloaded; retry only if the new state is expected.",
    migration: "A DB migration is required before this operation.",
    confirm: "Confirm this version step? It will pass server-side gates and cannot bypass certification/CAS.",
    typeLive: "Type LIVE for atomic LIVE activation",
    typeRestore: "Type RESTORE for historical restore activation",
    hash: "Diff hash",
  },
} as const;

function formatDate(value: string | null, lang: ControlPlaneLang) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortId(value: string | null) {
  if (!value) return "—";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function workflowLabel(workflow: FactoryVersionWorkflow | null, restore: boolean, copy: typeof COPY.bg | typeof COPY.en) {
  const stage = workflow?.stage ?? "readiness";
  if (restore) {
    if (stage === "readiness") return copy.restoreReadiness;
    if (stage === "publication") return copy.restorePublication;
    if (stage === "certification") return copy.restoreCertification;
    if (stage === "activation") return copy.restoreActivation;
    return "RESTORED";
  }
  if (stage === "readiness") return copy.readiness;
  if (stage === "publication") return copy.publication;
  if (stage === "certification") return copy.certification;
  if (stage === "activation") return copy.activation;
  return "LIVE";
}

function diffBadges(revision: FactoryVersionRevisionSummary) {
  const diff = revision.diffFromCurrent;
  if (!diff?.changed) return [];
  return diff.changedCategories.map((category) => ({
    category,
    count: diff.categoryCounts[category],
  }));
}

export default function FactoryVersionManagementPanel({
  lang,
  initialSnapshot,
}: {
  lang: ControlPlaneLang;
  initialSnapshot: FactoryProductionVersionManagementSnapshot;
}) {
  const copy = COPY[lang];
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function refresh() {
    const response = await fetch(
      `/api/control-plane/onboarding/version-management?hotelId=${encodeURIComponent(snapshot.productionHotelId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({})) as ApiEnvelope;
    if (response.ok && payload.ok && payload.snapshot) setSnapshot(payload.snapshot);
  }

  async function runStep(revision: FactoryVersionRevisionSummary, restore: boolean) {
    if (!snapshot.canMutate || snapshot.capability !== "ready" || busyKey) return;
    const workflow = revision.workflow;
    const stage = workflow?.stage ?? "readiness";
    if (stage === "complete") return;

    const reasonKey = `${restore ? "restore" : "upgrade"}:${revision.id}`;
    const reason = workflow?.reason || reasons[reasonKey] || "";
    if ((stage === "readiness" || (!restore && stage === "publication")) && reason.trim().length < 3) {
      setFeedback(copy.reason);
      return;
    }

    if (stage === "activation") {
      const expected = restore ? "RESTORE" : "LIVE";
      const promptText = restore ? copy.typeRestore : copy.typeLive;
      if (window.prompt(promptText) !== expected) return;
    } else if (!window.confirm(copy.confirm)) {
      return;
    }

    let action: string;
    let locator: string | null;
    if (restore) {
      action = `restore_${stage}`;
      locator = stage === "readiness"
        ? revision.id
        : stage === "publication"
          ? workflow?.readinessRunId ?? null
          : stage === "certification"
            ? workflow?.publicationRunId ?? null
            : workflow?.certificationRunId ?? null;
    } else {
      action = `upgrade_${stage}`;
      locator = stage === "readiness" || stage === "publication"
        ? revision.id
        : stage === "certification"
          ? workflow?.publicationRunId ?? null
          : workflow?.certificationRunId ?? null;
    }
    if (!locator) return;

    setBusyKey(reasonKey);
    setFeedback(null);
    try {
      const response = await fetch("/api/control-plane/onboarding/version-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, locator, reason: reason || undefined, confirmed: true }),
      });
      const payload = await response.json().catch(() => ({})) as ApiEnvelope;
      if (!response.ok || !payload.ok) {
        if (payload.error === "stale_live_revision") setFeedback(copy.stale);
        else if (payload.error === "change_management_migration_required") setFeedback(copy.migration);
        else setFeedback(copy.failed);
        await refresh();
        return;
      }
      setFeedback(copy.success);
      await refresh();
    } catch {
      setFeedback(copy.failed);
    } finally {
      setBusyKey(null);
    }
  }

  function renderDiff(revision: FactoryVersionRevisionSummary) {
    const diff = revision.diffFromCurrent;
    if (!diff?.changed) return <p className="mt-3 text-xs text-neutral-500">{copy.unchanged}</p>;
    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {diffBadges(revision).map(({ category, count }) => (
            <span key={category} className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] text-neutral-300">
              {category.replaceAll("_", " ")} · {count}
            </span>
          ))}
        </div>
        <p className="break-all text-[11px] text-neutral-600">{copy.hash}: {diff.diffHash}</p>
      </div>
    );
  }

  function renderRevision(revision: FactoryVersionRevisionSummary, restore: boolean) {
    const workflow = revision.workflow;
    const reasonKey = `${restore ? "restore" : "upgrade"}:${revision.id}`;
    const stage = workflow?.stage ?? "readiness";
    const needsReason = stage === "readiness" || (!restore && stage === "publication");
    const actionable = !restore || revision.previouslyLive;
    return (
      <article key={revision.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-neutral-100">{copy.revision} v{revision.revisionNo}</h4>
              {restore && revision.previouslyLive && (
                <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-[10px] font-semibold text-emerald-300">{copy.previouslyLive}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">{shortId(revision.id)} · {formatDate(revision.createdAt, lang)}</p>
            {restore && <p className="mt-1 text-xs text-neutral-500">{copy.activated}: {formatDate(revision.latestLiveActivationAt, lang)}</p>}
          </div>
          <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-400">{stage}</span>
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">{copy.diff}</p>
        {renderDiff(revision)}

        {actionable ? (
          <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
            {needsReason && (
              <label className="block text-xs text-neutral-400">
                {copy.reason}
                <input
                  value={workflow?.reason || reasons[reasonKey] || ""}
                  disabled={Boolean(workflow?.reason) || !snapshot.canMutate || snapshot.capability !== "ready"}
                  onChange={(event) => setReasons((current) => ({ ...current, [reasonKey]: event.target.value }))}
                  placeholder={copy.reasonPlaceholder}
                  className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-600 disabled:opacity-60"
                />
              </label>
            )}
            <button
              type="button"
              disabled={!snapshot.canMutate || snapshot.capability !== "ready" || busyKey !== null || stage === "complete"}
              onClick={() => void runStep(revision, restore)}
              className="w-full rounded-xl border border-cyan-800 bg-cyan-950/30 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:border-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {busyKey === reasonKey ? copy.busy : workflowLabel(workflow, restore, copy)}
            </button>
          </div>
        ) : (
          <p className="mt-4 border-t border-neutral-800 pt-4 text-xs text-amber-300">{copy.notRestorable}</p>
        )}
      </article>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">CM4 · Control Plane</p>
        <h2 className="mt-2 text-xl font-semibold text-neutral-100">{copy.title}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
      </div>

      {snapshot.capability === "migration_required" && (
        <div className="mt-5 rounded-2xl border border-amber-800/70 bg-amber-950/30 p-4 text-sm text-amber-200">{copy.migrationRequired}</div>
      )}
      {snapshot.capability === "ready" && !snapshot.canMutate && (
        <div className="mt-5 rounded-2xl border border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-300">{copy.readOnly}</div>
      )}
      {feedback && <div className="mt-5 rounded-2xl border border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-200">{feedback}</div>}

      <div className="mt-6 rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">{copy.current}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-neutral-100">{copy.revision} v{snapshot.currentLive.revisionNo}</p>
            <p className="mt-1 text-xs text-neutral-500">{shortId(snapshot.currentLive.id)} · {snapshot.publicSlug}</p>
          </div>
          <p className="text-xs text-neutral-400">{copy.activated}: {formatDate(snapshot.currentLive.latestLiveActivationAt || snapshot.currentLive.publishedAt, lang)}</p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-neutral-200">{copy.candidates}</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {snapshot.candidates.length ? snapshot.candidates.map((revision) => renderRevision(revision, false)) : (
            <p className="rounded-2xl border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">{copy.noCandidates}</p>
          )}
        </div>
      </div>

      <div className="mt-7">
        <h3 className="text-sm font-semibold text-neutral-200">{copy.history}</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {snapshot.history.length ? snapshot.history.map((revision) => renderRevision(revision, true)) : (
            <p className="rounded-2xl border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">{copy.noHistory}</p>
          )}
        </div>
      </div>

      <div className="mt-7 border-t border-neutral-800 pt-5">
        <h3 className="text-sm font-semibold text-neutral-200">{copy.timeline}</h3>
        {snapshot.timeline.length ? (
          <div className="mt-3 space-y-2">
            {snapshot.timeline.slice(0, 20).map((entry) => (
              <div key={`${entry.kind}:${entry.id}`} className="flex flex-col gap-1 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-neutral-300">{entry.mode.replace("version_", "")} · {entry.kind} · {entry.status}</p>
                  <p className="mt-1 text-[11px] text-neutral-600">target {shortId(entry.targetRevisionId)} · run {shortId(entry.id)}</p>
                </div>
                <p className="text-[11px] text-neutral-500">{formatDate(entry.createdAt, lang)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">{copy.noTimeline}</p>
        )}
      </div>
    </section>
  );
}
