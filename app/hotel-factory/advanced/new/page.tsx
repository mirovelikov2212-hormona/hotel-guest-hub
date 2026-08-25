import Link from "next/link";
import { redirect } from "next/navigation";

import FactoryBlueprintWizard from "@/app/control-plane/factory/new/FactoryBlueprintWizard";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "StayHub Hotel Factory · Advanced",
    title: "Техническа конфигурация",
    subtitle: "Пълен достъп до IDs, slugs, workflows и integration adapters. Използвай този режим само когато Smart Setup не е достатъчен.",
    smart: "← Smart Setup",
    panel: "Control Panel",
  },
  en: {
    eyebrow: "StayHub Hotel Factory · Advanced",
    title: "Technical configuration",
    subtitle: "Full access to IDs, slugs, workflows and integration adapters. Use this mode only when Smart Setup is not enough.",
    smart: "← Smart Setup",
    panel: "Control Panel",
  },
} as const;

export default async function HotelFactoryAdvancedPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/hotel-factory/advanced/new?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-amber-300/15 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/70">{copy.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/hotel-factory/new?lang=${lang}`} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/5 px-3 py-2 text-xs font-semibold text-cyan-100">{copy.smart}</Link>
              <Link href={`/control-panel?lang=${lang}`} className="rounded-2xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-300">{copy.panel}</Link>
            </div>
          </div>
        </header>
        <FactoryBlueprintWizard lang={lang} />
      </div>
    </main>
  );
}
