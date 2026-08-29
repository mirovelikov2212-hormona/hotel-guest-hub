import Link from "next/link";
import { redirect } from "next/navigation";

import ControlPanelThemeShell from "@/components/control-panel/ControlPanelThemeShell";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Control Panel",
    title: "Административен център",
    subtitle: "Една ясна входна точка за търговско управление, Hotel Intelligence, дизайн и Hotel Factory.",
    signedIn: "Влезли сте като",
    commercialTitle: "Търговско управление",
    commercialText: "Хотели, тестови периоди, клиенти и търговски lifecycle действия.",
    commercialAction: "Отвори търговския панел",
    scannerTitle: "AI Hotel Scanner",
    scannerText: "Сканирай публичния сайт на хотел и получи структуриран Hotel Intelligence Package за review.",
    scannerAction: "Отвори скенера",
    designTitle: "Hub Design Studio",
    designText: "Изгради, прегледай и версионирай Hub experience преди Factory handoff.",
    designAction: "Отвори Design Studio",
    factoryTitle: "Hotel Factory",
    factoryText: "Създай и тествай нов хотелски Hub през guided onboarding и Sandbox-first workflow.",
    factoryAction: "Създай нов хотел",
    status: "Platform workspace",
    statusText: "Светъл режим по подразбиране · Dark режим при нужда · защитен Platform Admin достъп",
    logout: "Изход",
  },
  en: {
    eyebrow: "StayHub Control Panel",
    title: "Administration center",
    subtitle: "One clear entry point for commercial operations, Hotel Intelligence, design and Hotel Factory.",
    signedIn: "Signed in as",
    commercialTitle: "Commercial management",
    commercialText: "Hotels, trials, customers and explicit commercial lifecycle actions.",
    commercialAction: "Open commercial panel",
    scannerTitle: "AI Hotel Scanner",
    scannerText: "Scan a hotel's public website and prepare a structured Hotel Intelligence Package for review.",
    scannerAction: "Open scanner",
    designTitle: "Hub Design Studio",
    designText: "Build, review and version a Hub experience before the Factory handoff.",
    designAction: "Open Design Studio",
    factoryTitle: "Hotel Factory",
    factoryText: "Create and test a new hotel Hub through guided onboarding and a Sandbox-first workflow.",
    factoryAction: "Create new hotel",
    status: "Platform workspace",
    statusText: "Light mode by default · Dark mode when needed · protected Platform Admin access",
    logout: "Sign out",
  },
} as const;

const cardBase = "group relative overflow-hidden rounded-[1.75rem] border border-[var(--cp-border)] bg-[var(--cp-card)] p-6 shadow-[var(--cp-shadow)] transition duration-200 hover:-translate-y-1";
const actionBase = "mt-6 inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition";

export default async function ControlPanelHome({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];
  const authority = await getCurrentPlatformAdminSession();

  if (!authority) {
    const next = normalizeAdminNextTarget(`/control-panel?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  return (
    <ControlPanelThemeShell>
      <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_15%_0%,rgba(8,127,123,0.12),transparent_42%),radial-gradient(circle_at_85%_0%,rgba(59,130,246,0.08),transparent_38%)]" />
        <div className="relative mx-auto max-w-7xl space-y-6">
          <header className="rounded-[2rem] border border-[var(--cp-border)] bg-[var(--cp-surface)] p-6 shadow-[var(--cp-shadow)] sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cp-accent)]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {copy.eyebrow}
                </div>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--cp-text)] sm:text-4xl">{copy.title}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--cp-muted)] sm:text-base">{copy.subtitle}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--cp-muted)]">
                  <span className="rounded-full border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 py-1.5">{copy.signedIn}: {authority.email || "Platform Admin"}</span>
                  <span className="rounded-full border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 py-1.5 font-medium text-[var(--cp-text)]">{authority.role}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] p-1 text-xs font-semibold">
                  <Link href="/control-panel?lang=bg" className={`rounded-lg px-3 py-2 transition ${lang === "bg" ? "bg-[var(--cp-text)] text-[var(--cp-surface)]" : "text-[var(--cp-muted)] hover:text-[var(--cp-text)]"}`}>BG</Link>
                  <Link href="/control-panel?lang=en" className={`rounded-lg px-3 py-2 transition ${lang === "en" ? "bg-[var(--cp-text)] text-[var(--cp-surface)]" : "text-[var(--cp-muted)] hover:text-[var(--cp-text)]"}`}>EN</Link>
                </div>
                <form action={`/api/control-plane/logout?lang=${lang}`} method="post">
                  <button type="submit" className="min-h-11 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-4 text-xs font-semibold text-[var(--cp-text)] transition hover:border-teal-500/40">{copy.logout}</button>
                </form>
              </div>
            </div>
          </header>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <article className={cardBase}>
              <div className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Business</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--cp-text)]">{copy.commercialTitle}</h2>
              <p className="mt-3 min-h-24 text-sm leading-6 text-[var(--cp-muted)]">{copy.commercialText}</p>
              <Link href={`/control-plane?lang=${lang}`} className={`${actionBase} border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15`}>
                {copy.commercialAction} →
              </Link>
            </article>

            <article className={cardBase}>
              <div className="absolute inset-x-0 top-0 h-1 bg-indigo-500" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">StayHub Intelligence</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--cp-text)]">{copy.scannerTitle}</h2>
              <p className="mt-3 min-h-24 text-sm leading-6 text-[var(--cp-muted)]">{copy.scannerText}</p>
              <Link href={`/hotel-scanner?lang=${lang}`} className={`${actionBase} border-indigo-500/25 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/15`}>
                {copy.scannerAction} →
              </Link>
            </article>

            <article className={cardBase}>
              <div className="absolute inset-x-0 top-0 h-1 bg-violet-500" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Design Intelligence</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--cp-text)]">{copy.designTitle}</h2>
              <p className="mt-3 min-h-24 text-sm leading-6 text-[var(--cp-muted)]">{copy.designText}</p>
              <Link href={`/design-studio?lang=${lang}`} className={`${actionBase} border-violet-500/25 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15`}>
                {copy.designAction} →
              </Link>
            </article>

            <article className={cardBase}>
              <div className="absolute inset-x-0 top-0 h-1 bg-teal-500" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">Hotel Factory</p>
              <h2 className="mt-3 text-xl font-semibold text-[var(--cp-text)]">{copy.factoryTitle}</h2>
              <p className="mt-3 min-h-24 text-sm leading-6 text-[var(--cp-muted)]">{copy.factoryText}</p>
              <Link href={`/hotel-factory/new?lang=${lang}`} className={`${actionBase} border-teal-500/25 bg-teal-500/10 text-teal-700 hover:bg-teal-500/15`}>
                {copy.factoryAction} →
              </Link>
            </article>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--cp-text)]">{copy.status}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--cp-muted)]">{copy.statusText}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> secure
            </span>
          </section>
        </div>
      </main>
    </ControlPanelThemeShell>
  );
}
