"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { FactoryProductionAcceptanceProgress } from "@/lib/server/factory-production-acceptance-progress";
import type { FactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";

type Action = "readiness" | "publication" | "certification";

const COPY = {
  bg: {
    title: "8. Production acceptance · dark only",
    subtitle: "Тези стъпки използват съществуващите authenticated Control Plane APIs. Evidence, deployment и runtime checks се извеждат server-side; Production остава inactive.",
    releaseReady: "CURRENT PRODUCTION RELEASE VALIDATED",
    releaseBlocked: "CURRENT PRODUCTION RELEASE BLOCKED",
    readiness: "P2.6.1 · Production Readiness",
    publication: "P2.6.2 · Dark configuration publication",
    certification: "P2.6.3 · Dark runtime certification",
    pending: "Предстои",
    complete: "Завършено",
    runReadiness: "Потвърди P2.6.1 readiness",
    runPublication: "Публикувай конфигурацията dark",
    runCertification: "Сертифицирай runtime dark",
    readinessConfirm: "Потвърждавам readiness оценка. Production и public identity остават неактивни.",
    publicationConfirm: "Потвърждавам dark publication. Runtime certification остава задължителна и Production не се активира.",
    certificationConfirm: "Потвърждавам dark runtime certification. Runtime resources, Production и public identity не се активират.",
    smokeNotice: "След dark publication трябва да има нов signed Production smoke. Ако той още не е наблюдаван, P2.6.3 API ще fail-close-не; опитай отново само след потвърден clean smoke.",
    liveLocked: "LIVE activation не е налична от този панел.",
    production: "Production hotel",
    revision: "Production revision",
    publicSlug: "Public slug",
    identity: "Public identity",
    deployment: "Certified deployment",
    failed: "Стъпката не премина server-side gate-а. Няма извършена следваща активация.",
    unauthorized: "Control Plane сесията е изтекла. Влез отново и повтори само текущата стъпка.",
  },
  en: {
    title: "8. Production acceptance · dark only",
    subtitle: "These steps use the existing authenticated Control Plane APIs. Evidence, deployment and runtime checks are derived server-side; Production remains inactive.",
    releaseReady: "CURRENT PRODUCTION RELEASE VALIDATED",
    releaseBlocked: "CURRENT PRODUCTION RELEASE BLOCKED",
    readiness: "P2.6.1 · Production Readiness",
    publication: "P2.6.2 · Dark configuration publication",
    certification: "P2.6.3 · Dark runtime certification",
    pending: "Pending",
    complete: "Complete",
    runReadiness: "Confirm P2.6.1 readiness",
    runPublication: "Publish configuration dark",
    runCertification: "Certify runtime dark",
    readinessConfirm: "I confirm readiness assessment. Production and public identity remain inactive.",
    publicationConfirm: "I confirm dark publication. Runtime certification remains mandatory and Production is not activated.",
    certificationConfirm: "I confirm dark runtime certification. Runtime resources, Production and public identity are not activated.",
    smokeNotice: "After dark publication a new signed Production smoke is required. If it has not been observed yet, the P2.6.3 API will fail closed; retry only after a confirmed clean smoke.",
    liveLocked: "LIVE activation is not available from this panel.",
    production: "Production hotel",
    revision: "Production revision",
    publicSlug: "Public slug",
    identity: "Public identity",
    deployment: "Certified deployment",
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
  const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
  return { response, result };
}

export default function FactoryProductionAcceptancePanel({
  lang,
  progress,
  releaseEvidence,
}: {
  lang: ControlPlaneLang;
  progress: FactoryProductionAcceptanceProgress;
  releaseEvidence: FactoryReleaseEvidence;
}) {
  const copy = COPY[lang];
  const router = useRouter();
  const [confirmed, setConfirmed] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const releaseReady =
    releaseEvidence.environment === "production"
    && releaseEvidence.status === "validated"
    && releaseEvidence.releaseGate.state === "validated"
    && releaseEvidence.vercelPreview.state === "validated";

  const stage: Action | "complete" = progress.runtimeCertification
    ? "complete"
    : progress.publication
      ? "certification"
      : progress.readiness
        ? "publication"
        : "readiness";

  async function run(action: Action) {
    if (!releaseReady || stage !== action || confirmed !== action || busy) return;
    setBusy(action);
    setFeedback(null);
    try {
      let response: Response;
      let result: { ok?: boolean; error?: string };

      if (action === "readiness") {
        ({ response, result } = await postJson(
          "/api/control-plane/onboarding/production-readiness",
          {
            sandboxCertificationRunId: progress.sandboxCertificationRunId,
            approval: {
              assessReadiness: true,
              keepProductionDark: true,
              activateHotel: false,
              activatePublicIdentity: false,
            },
          },
        ));
      } else if (action === "publication") {
        if (!progress.readiness) return;
        ({ response, result } = await postJson(
          "/api/control-plane/onboarding/production-publication",
          {
            readinessRunId: progress.readiness.id,
            expectedProductionHotelId: progress.productionHotelId,
            expectedProductionRevisionId: progress.productionRevisionId,
            expectedPublicSlug: progress.publicSlug,
            approval: {
              publishConfiguration: true,
              keepProductionDark: true,
              requireRuntimeCertification: true,
              activateHotel: false,
              activatePublicIdentity: false,
            },
          },
        ));
      } else {
        if (!progress.publication) return;
        ({ response, result } = await postJson(
          "/api/control-plane/onboarding/production-runtime-certification",
          {
            publicationRunId: progress.publication.id,
            approval: {
              certifyRuntime: true,
              keepProductionDark: true,
              activateHotel: false,
              activatePublicIdentity: false,
              enableRuntimeResources: false,
            },
          },
        ));
      }

      if (!response.ok || !result.ok) {
        setFeedback(response.status === 401 ? copy.unauthorized : copy.failed);
        return;
      }
      setConfirmed(null);
      router.refresh();
    } catch {
      setFeedback(copy.failed);
    } finally {
      setBusy(null);
    }
  }

  const steps: Array<{ action: Action; title: string; confirm: string; button: string; done: boolean }> = [
    { action: "readiness", title: copy.readiness, confirm: copy.readinessConfirm, button: copy.runReadiness, done: Boolean(progress.readiness) },
    { action: "publication", title: copy.publication, confirm: copy.publicationConfirm, button: copy.runPublication, done: Boolean(progress.publication) },
    { action: "certification", title: copy.certification, confirm: copy.certificationConfirm, button: copy.runCertification, done: Boolean(progress.runtimeCertification) },
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
        <p className="break-all">{copy.production}: {progress.productionHotelId}</p>
        <p className="break-all">{copy.revision}: {progress.productionRevisionId}</p>
        <p className="break-all">{copy.publicSlug}: {progress.publicSlug}</p>
        <p>{copy.identity}: {progress.publicIdentityStatus}</p>
        {progress.runtimeCertification?.deploymentId && <p className="break-all md:col-span-2">{copy.deployment}: {progress.runtimeCertification.deploymentId}</p>}
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
                  {item.action === "certification" && (
                    <p className="mt-3 text-xs leading-5 text-amber-100/80">{copy.smokeNotice}</p>
                  )}
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
                    disabled={!releaseReady || confirmed !== item.action || Boolean(busy)}
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

      <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm font-semibold text-rose-100/90">
        {copy.liveLocked}
      </p>
      {feedback && <p className="mt-4 text-sm text-rose-200">{feedback}</p>}
    </section>
  );
}
