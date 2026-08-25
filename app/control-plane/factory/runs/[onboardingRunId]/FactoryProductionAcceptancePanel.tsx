"use client";

import { useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { FactoryProductionAcceptanceProgress } from "@/lib/server/factory-production-acceptance-progress";
import type { FactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";

type Action = "readiness" | "publication" | "certification";

type StoredProgress = FactoryProductionAcceptanceProgress;

type ApiResult = StoredProgress & {
  ok?: boolean;
  error?: string;
  deploymentId?: string;
  deploymentSha?: string;
  activationRunId?: string;
};

const COPY = {
  bg: {
    title: "8. Production acceptance",
    subtitle: "Dark acceptance и LIVE използват само authenticated Control Plane APIs. Target identity, deployment, SHA, evidence и runtime checks се извеждат server-side и се валидират повторно fail-closed.",
    releaseReady: "CURRENT PRODUCTION RELEASE VALIDATED",
    releaseBlocked: "CURRENT PRODUCTION RELEASE BLOCKED",
    readiness: "P2.6.1 · Production Readiness",
    publication: "P2.6.2 · Dark configuration publication",
    certification: "P2.6.3 · Dark runtime certification",
    pending: "Предстои",
    complete: "Завършено",
    runReadiness: "Потвърди P2.6.1 readiness",
    runPublication: "Публикувай конфигурацията dark",
    runCertification: "Сертифицирай current Production runtime",
    readinessConfirm: "Потвърждавам readiness оценка. Production и public identity остават неактивни.",
    publicationConfirm: "Потвърждавам dark publication. Runtime certification остава задължителна и Production не се активира.",
    certificationConfirm: "Потвърждавам dark runtime certification. Runtime resources, Production и public identity не се активират.",
    smokeNotice: "P2.6.3 се допуска само за текущия exact Production deployment. Ако няма нов signed clean smoke, API ще fail-close-не.",
    liveTitle: "P2.6.4 · LIVE pilot activation",
    liveReady: "EXACT CURRENT CERTIFICATION READY",
    liveBlocked: "LIVE BLOCKED UNTIL EXACT CURRENT CERTIFICATION",
    liveWarning: "Това е реална Production активация само за този Factory tenant. Property lifecycle става pilot, hotel active=true, public identity=active и published revision става LKG. Normalized services/workflows/routing остават изключени и credentials не се генерират.",
    liveConfirm: "Потвърждавам, че искам този exact Factory tenant да бъде активиран LIVE pilot. Не активирам Aquamarine или друг tenant.",
    livePhrase: "Напиши LIVE за финално потвърждение",
    runLive: "Активирай LIVE pilot",
    liveDone: "LIVE PILOT ACTIVATED",
    liveSuccess: "LIVE activation е записана успешно. Следва задължителна post-LIVE verification.",
    production: "Production hotel",
    revision: "Production revision",
    publicSlug: "Public slug",
    deployment: "Certified deployment",
    certificationRun: "Runtime certification",
    activationRun: "LIVE activation run",
    failed: "Стъпката не премина server-side gate-а. Няма извършена следваща активация.",
    unauthorized: "Control Plane сесията е изтекла. Влез отново и повтори само текущата стъпка.",
  },
  en: {
    title: "8. Production acceptance",
    subtitle: "Dark acceptance and LIVE use authenticated Control Plane APIs only. Target identity, deployment, SHA, evidence and runtime checks are server-derived and revalidated fail-closed.",
    releaseReady: "CURRENT PRODUCTION RELEASE VALIDATED",
    releaseBlocked: "CURRENT PRODUCTION RELEASE BLOCKED",
    readiness: "P2.6.1 · Production Readiness",
    publication: "P2.6.2 · Dark configuration publication",
    certification: "P2.6.3 · Dark runtime certification",
    pending: "Pending",
    complete: "Complete",
    runReadiness: "Confirm P2.6.1 readiness",
    runPublication: "Publish configuration dark",
    runCertification: "Certify current Production runtime",
    readinessConfirm: "I confirm readiness assessment. Production and public identity remain inactive.",
    publicationConfirm: "I confirm dark publication. Runtime certification remains mandatory and Production is not activated.",
    certificationConfirm: "I confirm dark runtime certification. Runtime resources, Production and public identity are not activated.",
    smokeNotice: "P2.6.3 is allowed only for the exact current Production deployment. Without a new signed clean smoke the API fails closed.",
    liveTitle: "P2.6.4 · LIVE pilot activation",
    liveReady: "EXACT CURRENT CERTIFICATION READY",
    liveBlocked: "LIVE BLOCKED UNTIL EXACT CURRENT CERTIFICATION",
    liveWarning: "This is a real Production activation for this Factory tenant only. Property lifecycle becomes pilot, hotel active=true, public identity=active and the published revision becomes LKG. Normalized services/workflows/routing remain disabled and no credentials are generated.",
    liveConfirm: "I confirm that I want this exact Factory tenant activated as LIVE pilot. I am not activating Aquamarine or any other tenant.",
    livePhrase: "Type LIVE for final confirmation",
    runLive: "Activate LIVE pilot",
    liveDone: "LIVE PILOT ACTIVATED",
    liveSuccess: "LIVE activation was recorded successfully. Mandatory post-LIVE verification is next.",
    production: "Production hotel",
    revision: "Production revision",
    publicSlug: "Public slug",
    deployment: "Certified deployment",
    certificationRun: "Runtime certification",
    activationRun: "LIVE activation run",
    failed: "The step did not pass the server-side gate. No later activation was performed.",
    unauthorized: "The Control Plane session expired. Sign in again and retry only the current step.",
  },
} as const;

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as ApiResult;
  return { response, result };
}

export default function FactoryProductionAcceptancePanel({
  lang,
  sandboxCertificationRunId,
  productionHotelId,
  productionRevisionId,
  publicSlug,
  releaseEvidence,
  initialProgress,
}: {
  lang: ControlPlaneLang;
  sandboxCertificationRunId: string;
  productionHotelId: string;
  productionRevisionId: string;
  publicSlug: string;
  releaseEvidence: FactoryReleaseEvidence;
  initialProgress: FactoryProductionAcceptanceProgress;
}) {
  const copy = COPY[lang];
  const storageKey = useMemo(
    () => `stayhub.factory.p2.6-dark.${sandboxCertificationRunId}`,
    [sandboxCertificationRunId],
  );
  const [progress, setProgress] = useState<StoredProgress>(initialProgress);
  const [confirmed, setConfirmed] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [livePhrase, setLivePhrase] = useState("");
  const [liveBusy, setLiveBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      const stored = raw ? JSON.parse(raw) as StoredProgress : {};
      const storedCertificationIsCurrent = Boolean(
        stored.certificationRunId
        && stored.certifiedDeploymentId
        && stored.certifiedDeploymentSha
        && stored.certifiedDeploymentId === releaseEvidence.runtimeDeploymentId
        && stored.certifiedDeploymentSha.toLowerCase() === String(releaseEvidence.runtimeGitSha || "").toLowerCase(),
      );
      const next: StoredProgress = {
        readinessRunId: stored.readinessRunId || initialProgress.readinessRunId,
        publicationRunId: stored.publicationRunId || initialProgress.publicationRunId,
        certificationRunId: storedCertificationIsCurrent ? stored.certificationRunId : initialProgress.certificationRunId,
        certifiedDeploymentId: storedCertificationIsCurrent ? stored.certifiedDeploymentId : initialProgress.certifiedDeploymentId,
        certifiedDeploymentSha: storedCertificationIsCurrent ? stored.certifiedDeploymentSha : initialProgress.certifiedDeploymentSha,
        liveActivationRunId: storedCertificationIsCurrent
          ? stored.liveActivationRunId || initialProgress.liveActivationRunId
          : initialProgress.liveActivationRunId,
      };
      setProgress(next);
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      window.sessionStorage.removeItem(storageKey);
      setProgress(initialProgress);
    }
  }, [initialProgress, releaseEvidence.runtimeDeploymentId, releaseEvidence.runtimeGitSha, storageKey]);

  const releaseReady =
    releaseEvidence.environment === "production"
    && releaseEvidence.status === "validated"
    && releaseEvidence.releaseGate.state === "validated"
    && releaseEvidence.vercelPreview.state === "validated";

  const stage: Action | "complete" = progress.certificationRunId
    ? "complete"
    : progress.publicationRunId
      ? "certification"
      : progress.readinessRunId
        ? "publication"
        : "readiness";

  const exactCertificationReady = Boolean(
    releaseReady
    && progress.certificationRunId
    && progress.certifiedDeploymentId
    && progress.certifiedDeploymentSha
    && progress.certifiedDeploymentId === releaseEvidence.runtimeDeploymentId
    && progress.certifiedDeploymentSha.toLowerCase() === String(releaseEvidence.runtimeGitSha || "").toLowerCase(),
  );

  function save(next: StoredProgress) {
    setProgress(next);
    window.sessionStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function run(action: Action) {
    if (!releaseReady || stage !== action || confirmed !== action || busy || liveBusy) return;
    setBusy(action);
    setFeedback(null);
    try {
      let response: Response;
      let result: ApiResult;

      if (action === "readiness") {
        ({ response, result } = await postJson(
          "/api/control-plane/onboarding/production-readiness",
          {
            sandboxCertificationRunId,
            approval: {
              assessReadiness: true,
              keepProductionDark: true,
              activateHotel: false,
              activatePublicIdentity: false,
            },
          },
        ));
        if (!response.ok || !result.ok || !result.readinessRunId) throw new Error(response.status === 401 ? "unauthorized" : "failed");
        save({ ...progress, readinessRunId: result.readinessRunId });
      } else if (action === "publication") {
        if (!progress.readinessRunId) return;
        ({ response, result } = await postJson(
          "/api/control-plane/onboarding/production-publication",
          {
            readinessRunId: progress.readinessRunId,
            expectedProductionHotelId: productionHotelId,
            expectedProductionRevisionId: productionRevisionId,
            expectedPublicSlug: publicSlug,
            approval: {
              publishConfiguration: true,
              keepProductionDark: true,
              requireRuntimeCertification: true,
              activateHotel: false,
              activatePublicIdentity: false,
            },
          },
        ));
        if (!response.ok || !result.ok || !result.publicationRunId) throw new Error(response.status === 401 ? "unauthorized" : "failed");
        save({ ...progress, publicationRunId: result.publicationRunId });
      } else {
        if (!progress.publicationRunId) return;
        ({ response, result } = await postJson(
          "/api/control-plane/onboarding/production-runtime-certification",
          {
            publicationRunId: progress.publicationRunId,
            approval: {
              certifyRuntime: true,
              keepProductionDark: true,
              activateHotel: false,
              activatePublicIdentity: false,
              enableRuntimeResources: false,
            },
          },
        ));
        if (!response.ok || !result.ok || !result.certificationRunId || !result.deploymentId || !result.deploymentSha) {
          throw new Error(response.status === 401 ? "unauthorized" : "failed");
        }
        save({
          ...progress,
          certificationRunId: result.certificationRunId,
          certifiedDeploymentId: result.deploymentId,
          certifiedDeploymentSha: result.deploymentSha.toLowerCase(),
          liveActivationRunId: undefined,
        });
      }

      setConfirmed(null);
    } catch (error) {
      setFeedback(error instanceof Error && error.message === "unauthorized" ? copy.unauthorized : copy.failed);
    } finally {
      setBusy(null);
    }
  }

  async function runLive() {
    if (
      !exactCertificationReady
      || !progress.certificationRunId
      || progress.liveActivationRunId
      || !liveConfirmed
      || livePhrase.trim().toUpperCase() !== "LIVE"
      || busy
      || liveBusy
    ) return;

    setLiveBusy(true);
    setFeedback(null);
    try {
      const { response, result } = await postJson(
        "/api/control-plane/onboarding/production-live-activation",
        {
          runtimeCertificationRunId: progress.certificationRunId,
          approval: {
            activateProduction: true,
            activateHotel: true,
            activatePublicIdentity: true,
            targetPropertyLifecycle: "pilot",
            preserveCertifiedRevision: true,
            enableProductionRelationalAuthority: true,
            enableNormalizedProductionAuthority: false,
            enableFactoryOperationalResources: false,
            generateCredentials: false,
          },
        },
      );
      if (!response.ok || !result.ok || !result.activationRunId) {
        throw new Error(response.status === 401 ? "unauthorized" : "failed");
      }
      save({ ...progress, liveActivationRunId: result.activationRunId });
      setLiveConfirmed(false);
      setLivePhrase("");
      setFeedback(copy.liveSuccess);
    } catch (error) {
      setFeedback(error instanceof Error && error.message === "unauthorized" ? copy.unauthorized : copy.failed);
    } finally {
      setLiveBusy(false);
    }
  }

  const steps: Array<{ action: Action; title: string; confirm: string; button: string; done: boolean }> = [
    { action: "readiness", title: copy.readiness, confirm: copy.readinessConfirm, button: copy.runReadiness, done: Boolean(progress.readinessRunId) },
    { action: "publication", title: copy.publication, confirm: copy.publicationConfirm, button: copy.runPublication, done: Boolean(progress.publicationRunId) },
    { action: "certification", title: copy.certification, confirm: copy.certificationConfirm, button: copy.runCertification, done: Boolean(progress.certificationRunId) },
  ];

  return (
    <section className="rounded-3xl border border-violet-400/25 bg-violet-400/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-violet-100">{copy.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-violet-100/75">{copy.subtitle}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${releaseReady ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-rose-300/30 bg-rose-300/10 text-rose-100"}`}>
          {releaseReady ? copy.releaseReady : copy.releaseBlocked}
        </span>
      </div>

      <div className="mt-5 grid gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/45 p-4 text-xs text-neutral-400 md:grid-cols-2">
        <p className="break-all">{copy.production}: {productionHotelId}</p>
        <p className="break-all">{copy.revision}: {productionRevisionId}</p>
        <p className="break-all md:col-span-2">{copy.publicSlug}: {publicSlug}</p>
        {progress.certifiedDeploymentId && <p className="break-all md:col-span-2">{copy.deployment}: {progress.certifiedDeploymentId}</p>}
        {progress.certificationRunId && <p className="break-all md:col-span-2">{copy.certificationRun}: {progress.certificationRunId}</p>}
        {progress.liveActivationRunId && <p className="break-all md:col-span-2">{copy.activationRun}: {progress.liveActivationRunId}</p>}
      </div>

      <div className="mt-5 space-y-4">
        {steps.map((item) => {
          const active = stage === item.action;
          return (
            <div key={item.action} className={`rounded-2xl border p-4 ${item.done ? "border-emerald-400/25 bg-emerald-400/5" : active ? "border-violet-400/30 bg-violet-400/10" : "border-neutral-800 bg-neutral-950/35"}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-100">{item.title}</p>
                <span className={`text-xs font-semibold ${item.done ? "text-emerald-200" : "text-neutral-500"}`}>{item.done ? copy.complete : copy.pending}</span>
              </div>

              {active && !item.done && (
                <>
                  {item.action === "certification" && <p className="mt-3 text-xs leading-5 text-amber-100/80">{copy.smokeNotice}</p>}
                  <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-neutral-300">
                    <input
                      type="checkbox"
                      checked={confirmed === item.action}
                      onChange={(event) => setConfirmed(event.target.checked ? item.action : null)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>{item.confirm}</span>
                  </label>
                  <button
                    type="button"
                    disabled={!releaseReady || confirmed !== item.action || Boolean(busy) || liveBusy}
                    onClick={() => run(item.action)}
                    className="mt-4 rounded-xl border border-violet-300/30 bg-violet-300/15 px-4 py-2 text-sm font-semibold text-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === item.action ? "…" : item.button}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className={`mt-5 rounded-2xl border p-5 ${progress.liveActivationRunId ? "border-emerald-400/30 bg-emerald-400/10" : exactCertificationReady ? "border-rose-300/35 bg-rose-300/10" : "border-neutral-800 bg-neutral-950/45"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-100">{copy.liveTitle}</h3>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${progress.liveActivationRunId || exactCertificationReady ? "border-emerald-300/30 text-emerald-100" : "border-neutral-700 text-neutral-400"}`}>
            {progress.liveActivationRunId ? copy.liveDone : exactCertificationReady ? copy.liveReady : copy.liveBlocked}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-rose-100/90">{copy.liveWarning}</p>

        {!progress.liveActivationRunId && exactCertificationReady && (
          <>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-neutral-200">
              <input
                type="checkbox"
                checked={liveConfirmed}
                onChange={(event) => setLiveConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>{copy.liveConfirm}</span>
            </label>
            <input
              value={livePhrase}
              onChange={(event) => setLivePhrase(event.target.value)}
              placeholder={copy.livePhrase}
              autoComplete="off"
              className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-rose-300/60"
            />
            <button
              type="button"
              disabled={!liveConfirmed || livePhrase.trim().toUpperCase() !== "LIVE" || Boolean(busy) || liveBusy}
              onClick={runLive}
              className="mt-4 rounded-xl border border-rose-300/40 bg-rose-300/15 px-4 py-2 text-sm font-semibold text-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {liveBusy ? "…" : copy.runLive}
            </button>
          </>
        )}
      </div>

      {feedback && <p className={`mt-4 text-sm ${progress.liveActivationRunId ? "text-emerald-200" : "text-rose-200"}`}>{feedback}</p>}
    </section>
  );
}
