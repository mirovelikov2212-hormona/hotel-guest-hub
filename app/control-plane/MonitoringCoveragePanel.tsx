"use client";

import {
  MONITORING_COVERAGE,
  MONITORING_COVERAGE_AUDIT_VERSION,
  monitoringCoverageSummary,
} from "@/lib/monitoring/coverage-registry";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

const COPY = {
  bg: {
    eyebrow: "MONITORING COVERAGE",
    title: "Покритие на системното наблюдение",
    subtitle: "Критичните хотелски модули трябва да имат централен incident logging. Partial означава, че има функционално покритие, но monitoring layer-ът още не е пълен.",
    covered: "Покрити",
    partial: "Частично",
    incident: "Incident Center",
    email: "Critical email",
    recovery: "Recovery",
    yes: "Да",
    no: "Не",
    automatic: "Автоматично",
    fallback: "Fallback",
    manual: "Ръчно",
    none: "Няма",
    audit: "Audit",
  },
  en: {
    eyebrow: "MONITORING COVERAGE",
    title: "System monitoring coverage",
    subtitle: "Critical hotel modules should have centralized incident logging. Partial means functional coverage exists but the monitoring layer is not complete yet.",
    covered: "Covered",
    partial: "Partial",
    incident: "Incident Center",
    email: "Critical email",
    recovery: "Recovery",
    yes: "Yes",
    no: "No",
    automatic: "Automatic",
    fallback: "Fallback",
    manual: "Manual",
    none: "None",
    audit: "Audit",
  },
} as const;

export default function MonitoringCoveragePanel({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang] || COPY.en;
  const summary = monitoringCoverageSummary();

  const recoveryLabel = (value: (typeof MONITORING_COVERAGE)[number]["recovery"]) => {
    if (value === "automatic") return copy.automatic;
    if (value === "fallback") return copy.fallback;
    if (value === "manual") return copy.manual;
    return copy.none;
  };

  return (
    <section className="rounded-2xl border border-cyan-900/50 bg-neutral-900 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/70">{copy.eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-100">{copy.title}</h2>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-neutral-500">{copy.subtitle}</p>
        </div>
        <span className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[11px] text-neutral-500">
          {copy.audit}: {MONITORING_COVERAGE_AUDIT_VERSION}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
          <p className="text-[11px] text-neutral-500">{copy.covered}</p>
          <p className="mt-1 text-xl font-semibold text-emerald-200">{summary.covered}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
          <p className="text-[11px] text-neutral-500">{copy.partial}</p>
          <p className="mt-1 text-xl font-semibold text-amber-200">{summary.partial}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
          <p className="text-[11px] text-neutral-500">Total</p>
          <p className="mt-1 text-xl font-semibold text-neutral-100">{summary.total}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {MONITORING_COVERAGE.map((row) => (
          <article key={row.key} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-neutral-100">
                    {lang === "bg" ? row.labelBg : row.labelEn}
                  </h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    row.status === "covered"
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                  }`}>
                    {row.status === "covered" ? copy.covered : copy.partial}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  {lang === "bg" ? row.noteBg : row.noteEn}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 text-[10px] font-semibold uppercase">
                <span className="rounded-full border border-neutral-800 px-2 py-1 text-neutral-400">
                  {copy.incident}: {row.incidentCenter ? copy.yes : copy.no}
                </span>
                <span className="rounded-full border border-neutral-800 px-2 py-1 text-neutral-400">
                  {copy.email}: {row.criticalEmail ? copy.yes : copy.no}
                </span>
                <span className="rounded-full border border-neutral-800 px-2 py-1 text-neutral-400">
                  {copy.recovery}: {recoveryLabel(row.recovery)}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
