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
    title: "Приходи от допълнителни услуги",
    body:
      "Начислени и чакащи приходи от масажи, късен check-out и други платени хотелски услуги. Не включва цени на стаи, ADR, RevPAR или общия приход на хотела.",
    open: "Отвори приходите",
  },
  en: {
    title: "Additional Service Revenue",
    body:
      "Charged and pending revenue from massages, late checkout and other paid hotel services. It does not include room rates, ADR, RevPAR or total hotel revenue.",
    open: "Open service revenue",
  },
  de: {
    title: "Umsatz aus Zusatzleistungen",
    body:
      "Gebuchte und offene Umsätze aus Massagen, Late Check-out und weiteren kostenpflichtigen Hotelleistungen. Keine Zimmerpreise, ADR, RevPAR oder Gesamtumsätze des Hotels.",
    open: "Service-Umsatz öffnen",
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
    <section className="h-full rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            {copy.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {copy.body}
          </p>
        </div>
        <Link
          href={`/staff/${hotelSlug}/manager/revenue`}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          {copy.open} →
        </Link>
      </div>
    </section>
  );
}
