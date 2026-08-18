import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { FactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import type { FactorySandboxRuntimeProbe } from "@/lib/server/factory-sandbox-runtime-probe";

type State = "pending" | "validated" | "failed";

const COPY = {
  bg: {
    title: "6. Trusted Sandbox evidence",
    subtitle: "Системата събира release и Generic Staff доказателствата сама. Няма операторски TRUE отметки.",
    genericStaff: "Generic Staff runtime",
    tenantIsolation: "Tenant isolation / CI",
    previewBuild: "Exact Vercel Preview",
    runtimeErrors: "Tenant runtime smoke",
    validated: "VALIDATED",
    pending: "PENDING",
    failed: "FAILED",
    departments: "активни отдела",
    releaseSha: "Candidate SHA",
    runtimeSha: "Runtime SHA",
    blocked: "Продължи със стъпка 7: tenant-specific signed Preview smoke и P4.10 trusted certification bridge.",
    logReason: "P4.6 release evidence умишлено оставя runtime_errors PENDING. Реалният Vercel Drain е активен; tenant-specific runtime evidence се доказва в guided smoke прозореца по-долу.",
    runtimeProbeHash: "Runtime probe hash",
    releaseEvidenceHash: "Release evidence hash",
  },
  en: {
    title: "6. Trusted Sandbox evidence",
    subtitle: "The system derives release and Generic Staff evidence itself. There are no operator-supplied TRUE checkboxes.",
    genericStaff: "Generic Staff runtime",
    tenantIsolation: "Tenant isolation / CI",
    previewBuild: "Exact Vercel Preview",
    runtimeErrors: "Tenant runtime smoke",
    validated: "VALIDATED",
    pending: "PENDING",
    failed: "FAILED",
    departments: "active departments",
    releaseSha: "Candidate SHA",
    runtimeSha: "Runtime SHA",
    blocked: "Continue with step 7: the tenant-specific signed Preview smoke and the P4.10 trusted certification bridge.",
    logReason: "P4.6 release evidence intentionally leaves runtime_errors PENDING. The real Vercel Drain is active; tenant-specific runtime evidence is proven by the guided smoke window below.",
    runtimeProbeHash: "Runtime probe hash",
    releaseEvidenceHash: "Release evidence hash",
  },
} as const;

function tone(state: State) {
  if (state === "validated") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (state === "failed") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-amber-400/25 bg-amber-400/10 text-amber-100";
}

export default function FactorySandboxEvidencePanel({
  lang,
  runtimeProbe,
  releaseEvidence,
}: {
  lang: ControlPlaneLang;
  runtimeProbe: FactorySandboxRuntimeProbe;
  releaseEvidence: FactoryReleaseEvidence;
}) {
  const copy = COPY[lang];
  const states = [
    { label: copy.genericStaff, state: runtimeProbe.status as State },
    { label: copy.tenantIsolation, state: releaseEvidence.requiredChecks.tenant_isolation },
    { label: copy.previewBuild, state: releaseEvidence.requiredChecks.preview_build },
    { label: copy.runtimeErrors, state: releaseEvidence.requiredChecks.runtime_errors },
  ];

  return (
    <section className="rounded-3xl border border-cyan-400/25 bg-cyan-400/5 p-6">
      <div>
        <h2 className="text-xl font-semibold text-cyan-100">{copy.title}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-cyan-100/75">{copy.subtitle}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {states.map(({ label, state }) => (
          <div key={label} className="rounded-2xl border border-neutral-800 bg-neutral-950/55 p-4">
            <p className="text-sm text-neutral-300">{label}</p>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone(state)}`}>
              {state === "validated" ? copy.validated : state === "failed" ? copy.failed : copy.pending}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 text-xs text-neutral-500 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/45 p-4">
          <p>{runtimeProbe.departmentCount} {copy.departments}</p>
          <p className="mt-2 break-all">{copy.runtimeProbeHash}: {runtimeProbe.evidenceHash}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/45 p-4">
          <p className="break-all">{copy.releaseSha}: {releaseEvidence.candidateGitSha || "—"}</p>
          <p className="mt-2 break-all">{copy.runtimeSha}: {releaseEvidence.runtimeGitSha || "—"}</p>
          <p className="mt-2 break-all">{copy.releaseEvidenceHash}: {releaseEvidence.evidenceHash}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100/85">
        <p>{copy.logReason}</p>
        <p className="mt-2 font-semibold">{copy.blocked}</p>
      </div>
    </section>
  );
}
