import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type {
  FactorySandboxPreflight,
  SandboxPreflightCheckState,
} from "@/lib/server/factory-sandbox-preflight";

const COPY = {
  bg: {
    title: "5. Sandbox certification preflight",
    subtitle: "Read-only evidence layer върху точния P2.4 envelope lineage. Не активира Sandbox или Production и не приема ръчни TRUE отметки.",
    database: "Database evidence",
    evidence: "Certification evidence",
    certification: "Sandbox certification",
    validated: "VALIDATED",
    pending: "PENDING",
    failed: "FAILED",
    complete: "COMPLETE",
    notStarted: "NOT STARTED",
    externalNote: "Generic Staff runtime smoke, tenant-isolation code gate, exact Preview build и runtime error verification трябва да дойдат от системно доказателство. Операторът не може да ги маркира ръчно като успешни.",
    mutationNote: "Certification mutation остава недостъпна на този preflight етап. Отделният P2.5 transition може да се извика само след пълно exact evidence; Production трябва да остане inactive.",
    prod: "Production",
    sandbox: "Sandbox",
    checks: {
      generic_staff_runtime: "Generic Staff runtime",
      tenant_isolation: "Tenant isolation",
      preview_build: "Exact Preview build",
      runtime_errors: "Runtime errors",
      supabase_security: "Supabase security",
      integration_placeholders: "Integration placeholders",
      reporting_fail_closed: "Reporting fail-closed",
      branding_placeholder: "Branding placeholder",
      knowledge_placeholder: "Knowledge placeholder",
    },
  },
  en: {
    title: "5. Sandbox certification preflight",
    subtitle: "Read-only evidence layer over the exact P2.4 envelope lineage. It does not activate Sandbox or Production and does not accept operator-supplied TRUE checkboxes.",
    database: "Database evidence",
    evidence: "Certification evidence",
    certification: "Sandbox certification",
    validated: "VALIDATED",
    pending: "PENDING",
    failed: "FAILED",
    complete: "COMPLETE",
    notStarted: "NOT STARTED",
    externalNote: "Generic Staff runtime smoke, the tenant-isolation code gate, the exact Preview build and runtime error verification must come from system evidence. An operator cannot mark them as passed manually.",
    mutationNote: "Certification mutation remains unavailable at this preflight stage. The separate P2.5 transition may run only after complete exact evidence; Production must remain inactive.",
    prod: "Production",
    sandbox: "Sandbox",
    checks: {
      generic_staff_runtime: "Generic Staff runtime",
      tenant_isolation: "Tenant isolation",
      preview_build: "Exact Preview build",
      runtime_errors: "Runtime errors",
      supabase_security: "Supabase security",
      integration_placeholders: "Integration placeholders",
      reporting_fail_closed: "Reporting fail-closed",
      branding_placeholder: "Branding placeholder",
      knowledge_placeholder: "Knowledge placeholder",
    },
  },
} as const;

const CHECK_ORDER = [
  "generic_staff_runtime",
  "tenant_isolation",
  "preview_build",
  "runtime_errors",
  "supabase_security",
  "integration_placeholders",
  "reporting_fail_closed",
  "branding_placeholder",
  "knowledge_placeholder",
] as const;

function tone(state: SandboxPreflightCheckState | "complete" | "not_started") {
  if (state === "validated" || state === "complete") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }
  if (state === "failed") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-amber-400/25 bg-amber-400/10 text-amber-100";
}

function statusLabel(
  state: SandboxPreflightCheckState | "complete" | "not_started",
  copy: (typeof COPY)[ControlPlaneLang],
) {
  if (state === "validated") return copy.validated;
  if (state === "failed") return copy.failed;
  if (state === "complete") return copy.complete;
  if (state === "not_started") return copy.notStarted;
  return copy.pending;
}

export default function FactorySandboxPreflightPanel({
  lang,
  preflight,
}: {
  lang: ControlPlaneLang;
  preflight: FactorySandboxPreflight;
}) {
  const copy = COPY[lang];

  return (
    <section className="rounded-3xl border border-violet-400/25 bg-violet-400/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-violet-100">{copy.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-violet-100/75">{copy.subtitle}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone(preflight.evidenceStatus)}`}>
          {statusLabel(preflight.evidenceStatus, copy)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{copy.database}</p>
          <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone(preflight.databaseStatus)}`}>
            {statusLabel(preflight.databaseStatus, copy)}
          </span>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{copy.evidence}</p>
          <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone(preflight.evidenceStatus)}`}>
            {statusLabel(preflight.evidenceStatus, copy)}
          </span>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{copy.certification}</p>
          <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone(preflight.certification.status)}`}>
            {statusLabel(preflight.certification.status, copy)}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CHECK_ORDER.map((key) => {
          const state = preflight.requiredChecks[key];
          return (
            <div key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/45 px-4 py-3">
              <span className="text-sm text-neutral-300">{copy.checks[key]}</span>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${tone(state)}`}>
                {statusLabel(state, copy)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-3 text-sm leading-6 text-neutral-400">
        <p>{copy.externalNote}</p>
        <p>{copy.mutationNote}</p>
        <p className="text-xs text-neutral-500">
          {copy.prod}: {preflight.environment.productionActive ? "ACTIVE" : "INACTIVE"} · {copy.sandbox}: {preflight.environment.sandboxActive ? "ACTIVE" : "INACTIVE"}
        </p>
      </div>
    </section>
  );
}
