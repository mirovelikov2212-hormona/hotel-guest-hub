import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import FactoryProductionAcceptancePanel from "@/app/control-plane/factory/runs/[onboardingRunId]/FactoryProductionAcceptancePanel";
import FactoryProjectionWorkspace from "@/app/control-plane/factory/runs/[onboardingRunId]/FactoryProjectionWorkspace";
import FactorySandboxCertificationPanel from "@/app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCertificationPanel";
import FactorySandboxCredentialsPanel from "@/app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCredentialsPanel";
import FactorySandboxEvidencePanel from "@/app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxEvidencePanel";
import FactorySandboxPreflightPanel from "@/app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxPreflightPanel";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { getFactoryOnboardingProgress } from "@/lib/server/factory-onboarding-progress";
import { getFactoryProductionAcceptanceProgress } from "@/lib/server/factory-production-acceptance-progress";
import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { getFactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { probeFactorySandboxGenericStaffRuntime } from "@/lib/server/factory-sandbox-runtime-probe";

export const dynamic = "force-dynamic";

const COPY = {
  bg: { eyebrow: "P4.4 → P4.11 · Guided Factory Progress", back: "← Factory runs" },
  en: { eyebrow: "P4.4 → P4.11 · Guided Factory Progress", back: "← Factory runs" },
} as const;

export default async function FactoryRunWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ onboardingRunId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ onboardingRunId }, { lang: rawLang }] = await Promise.all([params, searchParams]);
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(
      `/control-plane/factory/runs/${onboardingRunId}?lang=${lang}`,
      lang,
    );
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  const progress = await getFactoryOnboardingProgress(onboardingRunId);
  if (!progress) notFound();

  const preflight = progress.envelope && progress.native && progress.communications
    ? await getFactorySandboxPreflight(progress.envelope.projectionRunId)
    : null;

  const trustedEvidence = preflight?.databaseStatus === "validated"
    ? await Promise.all([
        probeFactorySandboxGenericStaffRuntime(preflight),
        getFactoryReleaseEvidence(),
      ])
    : null;

  const productionPanelReady = Boolean(
    trustedEvidence
    && preflight?.certification.status === "complete"
    && preflight.certification.certificationRunId
    && progress.production.publicSlug,
  );

  const productionAcceptanceProgress = productionPanelReady && trustedEvidence && preflight
    ? await getFactoryProductionAcceptanceProgress({
        productionHotelId: preflight.lineage.productionHotelId,
        productionRevisionId: preflight.lineage.productionRevisionId,
        currentDeploymentId: trustedEvidence[1].runtimeDeploymentId,
        currentDeploymentSha: trustedEvidence[1].runtimeGitSha,
      })
    : {};

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">{copy.eyebrow}</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{progress.property.displayName}</h1>
              <p className="mt-2 break-all text-xs text-neutral-500">{progress.onboardingRunId}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/control-plane/factory/runs/${progress.onboardingRunId}?lang=bg`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "bg" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>BG</Link>
              <Link href={`/control-plane/factory/runs/${progress.onboardingRunId}?lang=en`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "en" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>EN</Link>
            </div>
          </div>
          <Link href={`/control-plane/factory/runs?lang=${lang}`} className="mt-5 inline-flex text-sm font-semibold text-cyan-200">{copy.back}</Link>
        </header>

        <FactoryProjectionWorkspace lang={lang} progress={progress} />
        {preflight && <FactorySandboxPreflightPanel lang={lang} preflight={preflight} />}
        {trustedEvidence && preflight && (
          <>
            <FactorySandboxEvidencePanel
              lang={lang}
              runtimeProbe={trustedEvidence[0]}
              releaseEvidence={trustedEvidence[1]}
            />
            <FactorySandboxCertificationPanel
              lang={lang}
              preflight={preflight}
              runtimeProbe={trustedEvidence[0]}
              releaseEvidence={trustedEvidence[1]}
            />
          </>
        )}
        {trustedEvidence?.[1].environment === "production" && preflight?.certification.status === "complete" && (
          <FactorySandboxCredentialsPanel
            lang={lang}
            sandboxHotelId={preflight.lineage.sandboxHotelId}
            certifiedRevisionId={preflight.lineage.sandboxRevisionId}
          />
        )}
        {productionPanelReady && trustedEvidence && preflight?.certification.certificationRunId && progress.production.publicSlug && (
          <FactoryProductionAcceptancePanel
            lang={lang}
            sandboxCertificationRunId={preflight.certification.certificationRunId}
            productionHotelId={preflight.lineage.productionHotelId}
            productionRevisionId={preflight.lineage.productionRevisionId}
            publicSlug={progress.production.publicSlug}
            releaseEvidence={trustedEvidence[1]}
            initialProgress={productionAcceptanceProgress}
          />
        )}
      </div>
    </main>
  );
}
