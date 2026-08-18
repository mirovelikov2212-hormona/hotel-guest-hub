"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { FactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import type { FactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import type { FactorySandboxRuntimeProbe } from "@/lib/server/factory-sandbox-runtime-probe";

type Phase = "idle" | "starting" | "settling" | "checking" | "ready" | "certifying" | "complete" | "failed";

type SmokeStartResponse = {
  ok?: boolean;
  smokeRunId?: string;
  error?: string;
};

type SmokeSettleResponse = {
  ok?: boolean;
  state?: "waiting" | "settle_emitted" | "already_emitted";
  retryAfterMs?: number;
  error?: string;
};

type SmokeStatusResponse = {
  ok?: boolean;
  observation?: {
    status?: string;
    errorCount?: number;
    markerCount?: number;
    deploymentId?: string;
    gitSha?: string;
    windowStart?: string;
    windowEnd?: string;
  };
  error?: string;
};

const COPY = {
  bg: {
    title: "7. Guided Sandbox certification",
    subtitle: "Тук системата изпълнява tenant-specific Preview smoke и допуска P2.5 само след exact signed evidence. Няма ръчни TRUE отметки.",
    previewOnly: "Тази стъпка се изпълнява само от exact Vercel Preview. В Production mutation бутоните остават заключени.",
    readyToSmoke: "ГОТОВО ЗА PREVIEW SMOKE",
    blocked: "БЛОКИРАНО",
    certified: "SANDBOX CERTIFIED",
    runSmoke: "Пусни trusted Preview smoke",
    resumeSmoke: "Продължи проверката на smoke",
    runningSmoke: "Проверка на runtime evidence…",
    clean: "Runtime прозорецът е чист и exact lineage е потвърден.",
    certify: "Сертифицирай Sandbox",
    certifying: "Сертифициране…",
    confirm: "Потвърждавам, че искам да активирам само Sandbox чрез P2.5. Production остава inactive.",
    failed: "Trusted evidence не премина всички проверки. Sandbox не е сертифициран.",
    unavailable: "Preflight, release evidence или Generic Staff runtime още не са готови.",
    prodBlocked: "Отвори този Factory run в exact Preview deployment, за да изпълниш smoke и certification. Production страницата е read-only за тази стъпка.",
    smokeId: "Smoke run",
    deployment: "Deployment",
    gitSha: "Git SHA",
    markers: "Signed markers",
    errors: "Blocking runtime events",
    complete: "Sandbox certification е завършена. Следващата фаза може да продължи към Production Readiness, но Production още не е активиран.",
  },
  en: {
    title: "7. Guided Sandbox certification",
    subtitle: "The system runs a tenant-specific Preview smoke and permits P2.5 only after exact signed evidence. There are no manual TRUE checkboxes.",
    previewOnly: "This step runs only from the exact Vercel Preview. Mutation controls stay locked in Production.",
    readyToSmoke: "READY FOR PREVIEW SMOKE",
    blocked: "BLOCKED",
    certified: "SANDBOX CERTIFIED",
    runSmoke: "Run trusted Preview smoke",
    resumeSmoke: "Resume smoke verification",
    runningSmoke: "Verifying runtime evidence…",
    clean: "The runtime window is clean and exact lineage is confirmed.",
    certify: "Certify Sandbox",
    certifying: "Certifying…",
    confirm: "I confirm that I want to activate Sandbox only through P2.5. Production remains inactive.",
    failed: "Trusted evidence did not pass every gate. Sandbox was not certified.",
    unavailable: "Preflight, release evidence, or Generic Staff runtime is not ready yet.",
    prodBlocked: "Open this Factory run in the exact Preview deployment to run smoke and certification. The Production page is read-only for this step.",
    smokeId: "Smoke run",
    deployment: "Deployment",
    gitSha: "Git SHA",
    markers: "Signed markers",
    errors: "Blocking runtime events",
    complete: "Sandbox certification is complete. The next phase may proceed to Production Readiness, but Production is still not active.",
  },
} as const;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<{ response: Response; result: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T;
  return { response, result };
}

export default function FactorySandboxCertificationPanel({
  lang,
  preflight,
  runtimeProbe,
  releaseEvidence,
}: {
  lang: ControlPlaneLang;
  preflight: FactorySandboxPreflight;
  runtimeProbe: FactorySandboxRuntimeProbe;
  releaseEvidence: FactoryReleaseEvidence;
}) {
  const copy = COPY[lang];
  const router = useRouter();
  const envelopeProjectionRunId = preflight.envelopeProjectionRunId;
  const storageKey = useMemo(
    () => `stayhub.factory.sandbox-smoke.${envelopeProjectionRunId}`,
    [envelopeProjectionRunId],
  );
  const [phase, setPhase] = useState<Phase>(preflight.certification.status === "complete" ? "complete" : "idle");
  const [smokeRunId, setSmokeRunId] = useState<string | null>(null);
  const [observation, setObservation] = useState<SmokeStatusResponse["observation"] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (preflight.certification.status === "complete") return;
    const stored = window.sessionStorage.getItem(storageKey);
    if (/^[0-9a-f-]{36}$/i.test(String(stored || ""))) setSmokeRunId(stored);
  }, [preflight.certification.status, storageKey]);

  const previewReady =
    releaseEvidence.environment === "preview"
    && releaseEvidence.lineageMode === "preview_self"
    && releaseEvidence.status === "validated"
    && releaseEvidence.releaseGate.state === "validated"
    && releaseEvidence.vercelPreview.state === "validated";
  const preflightReady =
    preflight.databaseStatus === "validated"
    && preflight.environment.stateValid
    && preflight.environment.productionActive === false
    && preflight.environment.sandboxActive === false
    && preflight.certification.status === "not_started";
  const runtimeReady = runtimeProbe.status === "validated";
  const canRun = previewReady && preflightReady && runtimeReady;

  async function waitForCleanSmoke(id: string) {
    setPhase("settling");
    const settleDeadline = Date.now() + 150_000;

    while (Date.now() < settleDeadline) {
      const { response, result } = await postJson<SmokeSettleResponse>(
        "/api/control-plane/onboarding/sandbox-runtime-smoke",
        { action: "settle", envelopeProjectionRunId, smokeRunId: id },
      );
      if (!response.ok || !result.ok) throw new Error(result.error || "settle_failed");
      if (result.state === "settle_emitted" || result.state === "already_emitted") break;
      const retry = Math.min(Math.max(Number(result.retryAfterMs) || 2_000, 1_000), 10_000);
      await sleep(retry);
    }

    if (Date.now() >= settleDeadline) throw new Error("settle_timeout");

    setPhase("checking");
    const statusDeadline = Date.now() + 45_000;
    while (Date.now() < statusDeadline) {
      const { response, result } = await postJson<SmokeStatusResponse>(
        "/api/control-plane/onboarding/sandbox-runtime-smoke",
        { action: "status", envelopeProjectionRunId, smokeRunId: id },
      );
      if (!response.ok || !result.ok) throw new Error(result.error || "status_failed");
      if (result.observation?.status === "observed_clean") {
        setObservation(result.observation);
        setPhase("ready");
        return;
      }
      if (result.observation?.status === "failed") {
        setObservation(result.observation);
        throw new Error("runtime_window_failed");
      }
      await sleep(2_000);
    }
    throw new Error("status_timeout");
  }

  async function runSmoke() {
    if (!canRun || phase === "starting" || phase === "settling" || phase === "checking") return;
    setFeedback(null);
    setObservation(null);
    setConfirmed(false);
    setPhase("starting");

    try {
      const { response, result } = await postJson<SmokeStartResponse>(
        "/api/control-plane/onboarding/sandbox-runtime-smoke",
        { action: "start", envelopeProjectionRunId },
      );
      if (!response.ok || !result.ok || !result.smokeRunId) throw new Error(result.error || "start_failed");
      setSmokeRunId(result.smokeRunId);
      window.sessionStorage.setItem(storageKey, result.smokeRunId);
      await waitForCleanSmoke(result.smokeRunId);
    } catch {
      setPhase("failed");
      setFeedback(copy.failed);
    }
  }

  async function resumeSmoke() {
    if (!canRun || !smokeRunId) return;
    setFeedback(null);
    setObservation(null);
    setConfirmed(false);
    try {
      await waitForCleanSmoke(smokeRunId);
    } catch {
      setPhase("failed");
      setFeedback(copy.failed);
    }
  }

  async function certifySandbox() {
    if (phase !== "ready" || !smokeRunId || !confirmed) return;
    setPhase("certifying");
    setFeedback(null);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>(
        "/api/control-plane/onboarding/sandbox-certification",
        { envelopeProjectionRunId, smokeRunId },
      );
      if (!response.ok || !result.ok) throw new Error(result.error || "certification_failed");
      window.sessionStorage.removeItem(storageKey);
      setPhase("complete");
      router.refresh();
    } catch {
      setPhase("failed");
      setFeedback(copy.failed);
    }
  }

  const busy = phase === "starting" || phase === "settling" || phase === "checking" || phase === "certifying";
  const statusLabel = phase === "complete"
    ? copy.certified
    : canRun
      ? copy.readyToSmoke
      : copy.blocked;

  return (
    <section className="rounded-3xl border border-emerald-400/25 bg-emerald-400/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-emerald-100">{copy.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-emerald-100/75">{copy.subtitle}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${phase === "complete" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : canRun ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-neutral-700 bg-neutral-950 text-neutral-500"}`}>
          {statusLabel}
        </span>
      </div>

      <p className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-sm leading-6 text-neutral-400">
        {copy.previewOnly}
      </p>

      {phase === "complete" ? (
        <p className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100">
          {copy.complete}
        </p>
      ) : (
        <>
          {!canRun && (
            <p className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100/85">
              {releaseEvidence.environment === "production" ? copy.prodBlocked : copy.unavailable}
            </p>
          )}

          {canRun && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={runSmoke}
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy && phase !== "certifying" ? copy.runningSmoke : copy.runSmoke}
              </button>
              {smokeRunId && phase !== "ready" && !busy && (
                <button
                  type="button"
                  onClick={resumeSmoke}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200"
                >
                  {copy.resumeSmoke}
                </button>
              )}
            </div>
          )}

          {smokeRunId && (
            <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950/45 p-4 text-xs text-neutral-500">
              <p className="break-all">{copy.smokeId}: {smokeRunId}</p>
              {observation?.deploymentId && <p className="mt-2 break-all">{copy.deployment}: {observation.deploymentId}</p>}
              {observation?.gitSha && <p className="mt-2 break-all">{copy.gitSha}: {observation.gitSha}</p>}
              {observation?.markerCount !== undefined && <p className="mt-2">{copy.markers}: {observation.markerCount}</p>}
              {observation?.errorCount !== undefined && <p className="mt-2">{copy.errors}: {observation.errorCount}</p>}
            </div>
          )}

          {phase === "ready" && (
            <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
              <p className="text-sm font-semibold text-emerald-100">{copy.clean}</p>
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-emerald-50/85">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>{copy.confirm}</span>
              </label>
              <button
                type="button"
                disabled={!confirmed || busy}
                onClick={certifySandbox}
                className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/15 px-4 py-2 text-sm font-semibold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === "certifying" ? copy.certifying : copy.certify}
              </button>
            </div>
          )}

          {feedback && (
            <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">
              {feedback}
            </p>
          )}
        </>
      )}
    </section>
  );
}
