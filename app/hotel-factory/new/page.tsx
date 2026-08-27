import Link from "next/link";
import { redirect } from "next/navigation";

import HotelManagerOnboardingWizardV2 from "./HotelManagerOnboardingWizardV2";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Hotel Factory",
    title: "Създай нов хотелски Hub",
    subtitle: "Модерен Smart Setup за бърз тестов onboarding. Техническите настройки се генерират автоматично, а Production остава защитен.",
    back: "← Control Panel",
    runs: "Factory runs",
    advanced: "Advanced mode",
    smart: "SMART SETUP",
  },
  en: {
    eyebrow: "StayHub Hotel Factory",
    title: "Create a new hotel Hub",
    subtitle: "Modern Smart Setup for fast test onboarding. Technical configuration is generated automatically while Production stays protected.",
    back: "← Control Panel",
    runs: "Factory runs",
    advanced: "Advanced mode",
    smart: "SMART SETUP",
  },
} as const;

export default async function HotelFactoryNewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/hotel-factory/new?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_-20%,rgba(34,211,238,0.14),transparent_60%)]" />
      <div className="pointer-events-none absolute right-[-12rem] top-[20rem] h-96 w-96 rounded-full bg-teal-400/5 blur-3xl" />
      <div className="relative mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-cyan-300/15 bg-neutral-900/80 p-6 shadow-[0_30px_100px_rgba(6,182,212,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">{copy.eyebrow}</p>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-cyan-200">{copy.smart}</span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/hotel-factory/runs?lang=${lang}`} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-white/20">{copy.runs}</Link>
              <Link href={`/hotel-factory/advanced/new?lang=${lang}`} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/5 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/45">{copy.advanced}</Link>
              <Link href="/hotel-factory/new?lang=bg" className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${lang === "bg" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-white/10 text-neutral-400"}`}>BG</Link>
              <Link href="/hotel-factory/new?lang=en" className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${lang === "en" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-white/10 text-neutral-400"}`}>EN</Link>
            </div>
          </div>
          <Link href={`/control-panel?lang=${lang}`} className="mt-6 inline-flex text-sm font-semibold text-cyan-200 transition hover:text-cyan-100">{copy.back}</Link>
        </header>

        <HotelManagerOnboardingWizardV2 lang={lang} />
      </div>
    </main>
  );
}
