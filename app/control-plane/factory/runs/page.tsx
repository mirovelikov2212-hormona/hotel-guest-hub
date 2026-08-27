import Link from "next/link";
import { redirect } from "next/navigation";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { listFactoryOnboardingRuns } from "@/lib/server/factory-onboarding-progress";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "P4 · One-click Hotel Factory",
    title: "Factory runs",
    subtitle: "Възобнови onboarding процес от exact immutable Product Factory lineage.",
    newHotel: "+ Нов хотел",
    back: "← Control Plane",
    empty: "Все още няма Product Factory onboarding runs.",
    created: "Създаден",
    stage: "Текущ етап",
    open: "Отвори workspace",
    production: "Production",
    sandbox: "Sandbox",
    inactive: "НЕАКТИВЕН",
    active: "АКТИВЕН",
    stages: {
      foundation: "Foundation",
      core: "Core resources",
      operational: "Operational resources",
      envelope: "Onboarding envelope",
      native_content: "Native content & venues",
    },
  },
  en: {
    eyebrow: "P4 · One-click Hotel Factory",
    title: "Factory runs",
    subtitle: "Resume onboarding from the exact immutable Product Factory lineage.",
    newHotel: "+ New hotel",
    back: "← Control Plane",
    empty: "No Product Factory onboarding runs yet.",
    created: "Created",
    stage: "Current stage",
    open: "Open workspace",
    production: "Production",
    sandbox: "Sandbox",
    inactive: "INACTIVE",
    active: "ACTIVE",
    stages: {
      foundation: "Foundation",
      core: "Core resources",
      operational: "Operational resources",
      envelope: "Onboarding envelope",
      native_content: "Native content & venues",
    },
  },
} as const;

function formatUtc(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${parsed.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default async function FactoryRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/hotel-factory/runs?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  const runs = await listFactoryOnboardingRuns(50);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">{copy.eyebrow}</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 text-sm text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/control-plane/factory/runs?lang=bg`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "bg" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>BG</Link>
              <Link href={`/control-plane/factory/runs?lang=en`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "en" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>EN</Link>
              <Link href={`/control-plane/factory/new?lang=${lang}`} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">{copy.newHotel}</Link>
            </div>
          </div>
          <Link href={`/control-plane?lang=${lang}`} className="mt-5 inline-flex text-sm font-semibold text-cyan-200">{copy.back}</Link>
        </header>

        {!runs.length ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">{copy.empty}</section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {runs.map((run) => (
              <article key={run.onboardingRunId} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{run.property.displayName}</h2>
                    <p className="mt-1 text-xs text-neutral-500">{run.property.propertyKey}</p>
                  </div>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    {copy.stages[run.currentStage]}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-neutral-400 sm:grid-cols-2">
                  <p>{copy.created}: <span className="text-neutral-200">{formatUtc(run.createdAt)}</span></p>
                  <p>{copy.stage}: <span className="text-neutral-200">{copy.stages[run.currentStage]}</span></p>
                  <p>{copy.production}: <span className={run.production.active ? "text-rose-300" : "text-emerald-300"}>{run.production.active ? copy.active : copy.inactive}</span></p>
                  <p>{copy.sandbox}: <span className={run.sandbox.active ? "text-rose-300" : "text-emerald-300"}>{run.sandbox.active ? copy.active : copy.inactive}</span></p>
                </div>
                <Link href={`/control-plane/factory/runs/${run.onboardingRunId}?lang=${lang}`} className="mt-5 inline-flex rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                  {copy.open}
                </Link>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
