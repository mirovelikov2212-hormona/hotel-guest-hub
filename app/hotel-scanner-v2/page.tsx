import Link from "next/link";
import { redirect } from "next/navigation";

import HotelScannerV2Client from "./HotelScannerV2Client";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Intelligence",
    title: "Hotel Scanner V2",
    subtitle: "Работна среда за проверимо onboarding сканиране. Системата първо установява какво съществува на сайта, после извлича данните и показва всяка липса или конфликт преди approval.",
    back: "← Control Panel",
    v1: "Scanner V1",
    preview: "Preview · без Production handoff",
  },
  en: {
    eyebrow: "StayHub Intelligence",
    title: "Hotel Scanner V2",
    subtitle: "Workspace for verifiable hotel onboarding. The system first establishes what exists on the website, then extracts the data and exposes every gap or conflict before approval.",
    back: "← Control Panel",
    v1: "Scanner V1",
    preview: "Preview · no Production handoff",
  },
} as const;

export default async function HotelScannerV2Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/hotel-scanner-v2?lang=${lang}`, lang);
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
              <div className="mt-4"><span className="v2-pill v2-pill-info">{copy.preview}</span></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/hotel-scanner?lang=${lang}`} className="v2-button text-xs">{copy.v1}</Link>
              <Link href="/hotel-scanner-v2?lang=bg" className={`v2-pill ${lang === "bg" ? "v2-pill-info" : ""}`}>BG</Link>
              <Link href="/hotel-scanner-v2?lang=en" className={`v2-pill ${lang === "en" ? "v2-pill-info" : ""}`}>EN</Link>
            </div>
          </div>
          <Link href={`/control-panel?lang=${lang}`} className="v2-source-link mt-6 inline-flex text-sm font-semibold">{copy.back}</Link>
        </header>

        <HotelScannerV2Client lang={lang} />
      </div>
    </main>
  );
}
