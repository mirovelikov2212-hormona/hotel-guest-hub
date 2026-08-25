import Link from "next/link";
import { redirect } from "next/navigation";

import FactoryBlueprintWizard from "@/app/control-plane/factory/new/FactoryBlueprintWizard";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Hotel Factory",
    title: "Създай нов хотелски Hub",
    subtitle: "Настрой хотела стъпка по стъпка, валидирай конфигурацията и създай безопасен Sandbox/Production draft.",
    back: "← Control Panel",
    runs: "Factory runs",
  },
  en: {
    eyebrow: "StayHub Hotel Factory",
    title: "Create a new hotel Hub",
    subtitle: "Configure the hotel step by step, validate it and create a safe Sandbox/Production draft.",
    back: "← Control Panel",
    runs: "Factory runs",
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
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl border border-cyan-300/20 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">{copy.eyebrow}</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/hotel-factory/runs?lang=${lang}`} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">{copy.runs}</Link>
              <Link href="/hotel-factory/new?lang=bg" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "bg" ? "border-neutral-200 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>BG</Link>
              <Link href="/hotel-factory/new?lang=en" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lang === "en" ? "border-neutral-200 bg-neutral-100 text-neutral-950" : "border-neutral-700 text-neutral-400"}`}>EN</Link>
            </div>
          </div>
          <Link href={`/control-panel?lang=${lang}`} className="mt-5 inline-flex text-sm font-semibold text-cyan-200 hover:text-cyan-100">{copy.back}</Link>
        </header>

        <FactoryBlueprintWizard lang={lang} />
      </div>
    </main>
  );
}
