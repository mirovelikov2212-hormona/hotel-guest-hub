"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";

type Snapshot = {
  workspace: { id: string; currentRevisionId: string | null };
  revisions: Array<{ id: string; revisionNo: number; payloadChecksum: string }>;
};

export default function DesignFactoryHandoffLauncher({ lang }: { lang: ControlPlaneLang }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const raw = window.sessionStorage.getItem(PACKAGE_STORAGE_KEY);
        if (!raw) return;
        const pkg = JSON.parse(raw) as HotelIntelligencePackage;
        if (pkg?.schemaVersion !== "hotel-intelligence-v1" || !pkg.source?.canonicalUrl) return;
        const response = await fetch(`/api/control-plane/design-studio/drafts?canonicalUrl=${encodeURIComponent(pkg.source.canonicalUrl)}`, { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; snapshot?: Snapshot | null };
        if (!cancelled && response.ok && body.ok) setSnapshot(body.snapshot || null);
      } catch {
        // Versioned Builder remains usable even if the launcher cannot resolve history.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, []);

  const currentId = snapshot?.workspace.currentRevisionId || "";
  const revision = snapshot?.revisions.find((item) => item.id === currentId);
  const text = lang === "bg"
    ? {
        title: "Следваща стъпка: Hotel Factory",
        detail: "Използвай точно записаната revision като immutable source. Factory ще поиска реална локация, стаи и operational настройки и ще създаде само неактивни Production + Sandbox записи.",
        noRevision: "Първо запази Design Revision, за да продължиш към Factory.",
        action: "Преглед и Factory handoff",
      }
    : {
        title: "Next step: Hotel Factory",
        detail: "Use the exact saved revision as an immutable source. Factory will require real location, rooms and operational settings and will create inactive Production + Sandbox records only.",
        noRevision: "Save a Design Revision before continuing to Factory.",
        action: "Review and Factory handoff",
      };

  return (
    <section className="rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.025] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold text-emerald-100">{text.title}</p>
          <p className="mt-2 text-xs leading-5 text-neutral-400">{currentId ? text.detail : text.noRevision}</p>
          {revision && <p className="mt-2 font-mono text-[10px] text-neutral-600">revision {revision.revisionNo} · {revision.payloadChecksum.slice(0, 16)}…</p>}
        </div>
        {currentId ? (
          <Link
            href={`/hotel-factory/from-design?lang=${lang}&workspaceId=${encodeURIComponent(snapshot!.workspace.id)}&revisionId=${encodeURIComponent(currentId)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/[0.07] px-4 text-xs font-semibold text-emerald-100"
          >
            {text.action} →
          </Link>
        ) : (
          <span className="text-xs text-neutral-600">{loading ? "…" : "Design revision required"}</span>
        )}
      </div>
    </section>
  );
}
