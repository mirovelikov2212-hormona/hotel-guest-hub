import Link from "next/link";
import { redirect } from "next/navigation";

import HotelScannerV2WorkflowClient from "./HotelScannerV2WorkflowClient";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Intelligence",
    title: "Hotel Scanner · Intake",
    subtitle: "Вътрешен basic intake за публична хотелска информация, source links и design signals преди ръчния onboarding в Design Studio.",
    back: "← Control Plane",
    preview: "Basic Intake · bounded quick preview · без Production handoff",
    build: "Build",
  },
  en: {
    eyebrow: "StayHub Intelligence",
    title: "Hotel Scanner · Intake",
    subtitle: "Internal basic intake for public hotel information, source links and design signals before manual onboarding in Design Studio.",
    back: "← Control Plane",
    preview: "Basic Intake · bounded quick preview · no Production handoff",
    build: "Build",
  },
} as const;

export default async function HotelScannerV2WorkflowPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];
  const buildSha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local").slice(0, 8);

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/hotel-scanner-v2-workflow?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="scanner-v2-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="v2-panel p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="v2-accent text-xs font-bold uppercase tracking-[0.28em]">{copy.eyebrow}</p>
              <h1 className="v2-section-title mt-3 text-3xl sm:text-4xl">{copy.title}</h1>
              <p className="v2-muted mt-3 max-w-3xl text-sm leading-6">{copy.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="v2-pill v2-pill-info">{copy.preview}</span>
                <span className="v2-pill font-mono">{copy.build} {buildSha}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/hotel-scanner-v2-workflow?lang=bg" className={`v2-pill ${lang === "bg" ? "v2-pill-info" : ""}`}>BG</Link>
              <Link href="/hotel-scanner-v2-workflow?lang=en" className={`v2-pill ${lang === "en" ? "v2-pill-info" : ""}`}>EN</Link>
            </div>
          </div>
          <Link href={`/control-plane?lang=${lang}`} className="v2-source-link mt-6 inline-flex text-sm font-semibold">{copy.back}</Link>
        </header>

        <HotelScannerV2WorkflowClient lang={lang} />
      </div>
    </main>
  );
}
