"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Availability = {
  hotelSlug: string;
  runtimeRole: { kind: "manager" | "department" };
  modules: {
    managerIntelligence: boolean;
    revenueIntelligence: boolean;
  };
};

const COPY = {
  bg: {
    title: "Оперативна стойност и спестено време",
    body:
      "Измерва Direct Routing, Reception Bypass, AI Containment, service recovery, моделирано спестено време и стойността на доказаните допълнителни услуги спрямо baseline-а на хотела.",
    open: "Отвори оперативния ефект",
  },
  en: {
    title: "Operational Value & Time Saved",
    body:
      "Measures Direct Routing, Reception Bypass, AI Containment, service recovery, modeled staff time saved and verified paid-service value against the hotel baseline.",
    open: "Open operational value",
  },
  de: {
    title: "Operativer Wert & Zeitersparnis",
    body:
      "Misst Direct Routing, Reception Bypass, AI Containment, Service Recovery, modellierte Zeiteinsparung und verifizierten Wert aus Zusatzleistungen gegenüber der Hotel-Baseline.",
    open: "Operativen Wert öffnen",
  },
} as const;

export default function GostayaValueAccessCard({
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
              && body.availability.modules.managerIntelligence
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
    <section className="h-full rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
            {copy.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {copy.body}
          </p>
        </div>
        <Link
          href={`/staff/${hotelSlug}/manager/value`}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-800 bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-900"
        >
          {copy.open} →
        </Link>
      </div>
    </section>
  );
}
