import Link from "next/link";
import { redirect } from "next/navigation";

import FactoryBlueprintWizard from "@/app/control-plane/factory/new/FactoryBlueprintWizard";
import {
  normalizeControlPlaneLang,
} from "@/lib/control-plane-i18n";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "P4 · One-click Hotel Factory",
    title: "Нов хотел · Blueprint workspace",
    subtitle:
      "Изгради и валидирай основния hotel blueprint. Тази стъпка не създава tenant и не активира Production.",
    back: "← Към Control Plane",
  },
  en: {
    eyebrow: "P4 · One-click Hotel Factory",
    title: "New hotel · Blueprint workspace",
    subtitle:
      "Build and validate the base hotel blueprint. This step does not create a tenant or activate Production.",
    back: "← Back to Control Plane",
  },
} as const;

export default async function FactoryBlueprintWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) redirect(`/control-plane/login?lang=${lang}`);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">
                {copy.eyebrow}
              </p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/control-plane/factory/new?lang=bg"
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  lang === "bg"
                    ? "border-neutral-200 bg-neutral-100 text-neutral-950"
                    : "border-neutral-700 text-neutral-400"
                }`}
              >
                BG
              </Link>
              <Link
                href="/control-plane/factory/new?lang=en"
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  lang === "en"
                    ? "border-neutral-200 bg-neutral-100 text-neutral-950"
                    : "border-neutral-700 text-neutral-400"
                }`}
              >
                EN
              </Link>
            </div>
          </div>
          <Link
            href={`/control-plane?lang=${lang}`}
            className="mt-5 inline-flex text-sm font-semibold text-cyan-200 hover:text-cyan-100"
          >
            {copy.back}
          </Link>
        </header>

        <FactoryBlueprintWizard lang={lang} />
      </div>
    </main>
  );
}
