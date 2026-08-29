import Link from "next/link";
import { redirect } from "next/navigation";

import DesignRevisionFactoryHandoffClient from "./DesignRevisionFactoryHandoffClient";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

export default async function DesignRevisionFactoryHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; workspaceId?: string; revisionId?: string }>;
}) {
  const params = await searchParams;
  const lang = normalizeControlPlaneLang(params.lang);
  const workspaceId = String(params.workspaceId || "");
  const revisionId = String(params.revisionId || "");
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) {
    const next = normalizeAdminNextTarget(`/hotel-factory/from-design?lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&revisionId=${encodeURIComponent(revisionId)}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-emerald-300/15 bg-neutral-900/80 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/70">StayHub Product Factory</p>
          <h1 className="mt-3 text-3xl font-semibold">{lang === "bg" ? "Design Revision → Hotel Factory" : "Design Revision → Hotel Factory"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{lang === "bg" ? "Точната design revision е immutable source. Тук се потвърждават само operational данните, които сайтът не може надеждно да знае. Няма LIVE activation." : "The exact design revision is the immutable source. This step confirms only operational data the website cannot reliably know. There is no LIVE activation."}</p>
          <Link href={`/design-studio?lang=${lang}`} className="mt-5 inline-flex text-sm font-semibold text-emerald-200">← Design Studio</Link>
        </header>
        <DesignRevisionFactoryHandoffClient lang={lang} workspaceId={workspaceId} revisionId={revisionId} />
      </div>
    </main>
  );
}
