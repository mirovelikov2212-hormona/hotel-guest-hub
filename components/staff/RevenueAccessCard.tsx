"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Availability = {
  hotelSlug: string;
  role: string;
  runtimeRole: {
    kind: "manager" | "department";
  };
  modules: {
    revenueIntelligence: boolean;
  };
};

const COPY = {
  bg: {
    title: "Revenue & Upsell",
    body:
      "Проследен ancillary revenue, billing ledger, pending pipeline и AI attribution.",
    open: "Отвори Revenue",
  },
  en: {
    title: "Revenue & Upsell",
    body:
      "Tracked ancillary revenue, billing ledger, pending pipeline and AI attribution.",
    open: "Open Revenue",
  },
  de: {
    title: "Revenue & Upsell",
    body:
      "Erfasster Ancillary Revenue, Billing Ledger, offene Pipeline und AI Attribution.",
    open: "Revenue öffnen",
  },
} as const;

export default function RevenueAccessCard({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({
          hotelSlug,
          role: "manager",
        });
        const response = await fetch(
          `/api/staff/modules?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; availability?: Availability }
          | null;

        if (!cancelled) {
          setAvailable(
            Boolean(
              response.ok
              && body?.ok
              && body.availability?.runtimeRole.kind === "manager"
              && body.availability.modules.revenueIntelligence,
            ),
          );
        }
      } catch {
        if (!cancelled) setAvailable(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hotelSlug]);

  if (!available) return null;

  return (
    <section className="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
            {copy.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
            {copy.body}
          </p>
        </div>
        <Link
          href={`/staff/${hotelSlug}/manager/revenue`}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/45"
        >
          {copy.open} →
        </Link>
      </div>
    </section>
  );
}
