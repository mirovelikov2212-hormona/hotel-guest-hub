import Link from "next/link";
import { redirect } from "next/navigation";

import DesignStudioClient from "./DesignStudioClient";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Product Factory",
    title: "Hub Design Studio",
    subtitle: "Самостоятелна работна зона за дизайн, структура и бъдещо генериране на Hub draft от Hotel Intelligence Package.",
    back: "← Control Panel",
    scanner: "AI Hotel Scanner",
  },
  en: {
    eyebrow: "StayHub Product Factory",
    title: "Hub Design Studio",
    subtitle: "A standalone workspace for Hub design, structure and future draft generation from a Hotel Intelligence Package.",
    back: "← Control Panel",
    scanner: "AI Hotel Scanner",
  },
} as const;

export default async function DesignStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/design-studio?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_-20%,rgba(139,92,246,0.16),transparent_60%)]" />
      <div className="pointer-events-none absolute right-[-10rem] top-[24rem] h-96 w-96 rounded-full bg-cyan-400/5 blur-3xl" />
      <div className="relative mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-violet-300/15 bg-neutral-900/80 p-6 shadow-[0_30px_100px_rgba(139,92,246,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/70">{copy.eyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/hotel-scanner?lang=${lang}`} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-white/20">{copy.scanner}</Link>
              <Link href="/design-studio?lang=bg" className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${lang === "bg" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-white/10 text-neutral-400"}`}>BG</Link>
              <Link href="/design-studio?lang=en" className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${lang === "en" ? "border-neutral-100 bg-neutral-100 text-neutral-950" : "border-white/10 text-neutral-400"}`}>EN</Link>
            </div>
          </div>
          <Link href={`/control-panel?lang=${lang}`} className="mt-6 inline-flex text-sm font-semibold text-violet-200 transition hover:text-violet-100">{copy.back}</Link>
        </header>

        <DesignStudioClient lang={lang} />
      </div>
    </main>
  );
}
