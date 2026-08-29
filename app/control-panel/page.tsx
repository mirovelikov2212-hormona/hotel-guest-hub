import Link from "next/link";
import { redirect } from "next/navigation";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Control Panel",
    title: "Административен център",
    subtitle: "Избери отделния инструмент или работна зона, в която искаш да работиш.",
    commercialTitle: "Търговско управление",
    commercialText: "Хотели, тестови периоди, клиенти и търговски lifecycle действия.",
    commercialAction: "Отвори търговския панел",
    scannerTitle: "AI Hotel Scanner",
    scannerText: "Сканирай публичния сайт на хотел и получи структуриран, доказуем review draft без автоматично създаване или публикуване.",
    scannerAction: "Отвори скенера",
    designTitle: "Hub Design Studio",
    designText: "Прегледай Hotel Intelligence Package, сортирай Hub content и design signals и подготви визуален Hub draft.",
    designAction: "Отвори Design Studio",
    factoryTitle: "Hotel Factory",
    factoryText: "Създай и тествай нов хотелски Hub през guided onboarding workspace.",
    factoryAction: "Създай нов хотел",
    logout: "Изход",
  },
  en: {
    eyebrow: "StayHub Control Panel",
    title: "Administration center",
    subtitle: "Choose the separate tool or workspace you want to use.",
    commercialTitle: "Commercial management",
    commercialText: "Hotels, trials, customers and explicit commercial lifecycle actions.",
    commercialAction: "Open commercial panel",
    scannerTitle: "AI Hotel Scanner",
    scannerText: "Scan a hotel's public website and get a structured, evidence-backed review draft without automatically creating or publishing anything.",
    scannerAction: "Open scanner",
    designTitle: "Hub Design Studio",
    designText: "Review the Hotel Intelligence Package, sort Hub content and design signals, and prepare a visual Hub draft.",
    designAction: "Open Design Studio",
    factoryTitle: "Hotel Factory",
    factoryText: "Create and test a new hotel Hub through the guided onboarding workspace.",
    factoryAction: "Create new hotel",
    logout: "Sign out",
  },
} as const;

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
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">{copy.eyebrow}</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 text-sm text-neutral-400">{copy.subtitle}</p>
              <p className="mt-2 text-xs text-neutral-600">{authority.email || "Platform Admin"} · {authority.role}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/control-panel?lang=bg" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "bg" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>BG</Link>
              <Link href="/control-panel?lang=en" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "en" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>EN</Link>
              <form action={`/api/control-plane/logout?lang=${lang}`} method="post">
                <button type="submit" className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300">{copy.logout}</button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-amber-300/20 bg-neutral-900 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">Control Panel</p>
            <h2 className="mt-3 text-xl font-semibold">{copy.commercialTitle}</h2>
            <p className="mt-2 min-h-24 text-sm leading-6 text-neutral-400">{copy.commercialText}</p>
            <Link href={`/control-plane?lang=${lang}`} className="mt-6 inline-flex rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
              {copy.commercialAction}
            </Link>
          </article>

          <article className="rounded-3xl border border-indigo-300/25 bg-neutral-900 p-6 shadow-[0_24px_80px_rgba(99,102,241,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200/70">StayHub Intelligence</p>
            <h2 className="mt-3 text-xl font-semibold">{copy.scannerTitle}</h2>
            <p className="mt-2 min-h-24 text-sm leading-6 text-neutral-400">{copy.scannerText}</p>
            <Link href={`/hotel-scanner?lang=${lang}`} className="mt-6 inline-flex rounded-2xl border border-indigo-300/30 bg-indigo-300/10 px-4 py-3 text-sm font-semibold text-indigo-100">
              {copy.scannerAction}
            </Link>
          </article>

          <article className="rounded-3xl border border-violet-300/25 bg-neutral-900 p-6 shadow-[0_24px_80px_rgba(139,92,246,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/70">Design Intelligence</p>
            <h2 className="mt-3 text-xl font-semibold">{copy.designTitle}</h2>
            <p className="mt-2 min-h-24 text-sm leading-6 text-neutral-400">{copy.designText}</p>
            <Link href={`/design-studio?lang=${lang}`} className="mt-6 inline-flex rounded-2xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-semibold text-violet-100">
              {copy.designAction}
            </Link>
          </article>

          <article className="rounded-3xl border border-cyan-300/25 bg-neutral-900 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">Hotel Factory</p>
            <h2 className="mt-3 text-xl font-semibold">{copy.factoryTitle}</h2>
            <p className="mt-2 min-h-24 text-sm leading-6 text-neutral-400">{copy.factoryText}</p>
            <Link href={`/hotel-factory/new?lang=${lang}`} className="mt-6 inline-flex rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100">
              {copy.factoryAction}
            </Link>
          </article>
        </section>
      </div>
    </main>
  );
}
